'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-r3-jwt-secret-ppos-2026';
process.env.NODE_ENV = 'test';

/**
 * tests/budget02c01r3_fiscal_calendar_provenance.test.js
 * 
 * BUDGET-02C-01R3: Fiscal Reliability, Real Calendar & BPE Snapshot Provenance Certification Suite
 * 
 * Exhaustively certifies:
 * 1. FISC-01: Reliable fiscal classification from authorized sources.
 *             - Elimination of interior_pages editorial book inference.
 *             - Elimination of 'ES' destination country fallback.
 *             - Strict fail-closed TAX_CLASSIFICATION_BLOCKED on missing jurisdiction or ambiguous category.
 *             - Strict differentiation between B2B and B2C cross-border transactions.
 * 2. TIME-01: Verifiable labor calendar in IANA Europe/Madrid timezone.
 *             - Real CET (UTC+1) and CEST (UTC+2) working hours (09:00 - 18:00 local time).
 *             - DST transitions (March CET->CEST, October CEST->CET).
 *             - Statutory Spanish national and Madrid regional holidays, including variable Easter.
 * 3. BPE-01: Authoritative BPE calculation snapshot provenance and database error propagation.
 *             - Rejection of untethered snapshots without accredited order linkage.
 *             - Verification of engine version, tariff checksum, specs, rates, and breakdown.
 *             - Elimination of silent .catch(() => [[]]) on printhouse margin query.
 */

const assert = require('assert');
const crypto = require('crypto');
const mysqlClient = require('../src/api/services/mysqlClient');
const {
    OrderQuoteRevisionService,
    OrderQuoteRevisionError,
    calculateBusinessHoursExpirationUtc,
    getMadridOfficialHolidays,
    validateBpeSnapshotProvenance
} = require('../src/api/services/orderQuoteRevisionService');
const TaxVatReadinessClassifierService = require('../src/api/services/taxVatReadinessClassifierService');
const pricingSnapshotCanonicalizer = require('../src/api/services/pricingSnapshotCanonicalizer');

describe('BUDGET-02C-01R3 — Fiscal Reliability, Real Calendar & BPE Snapshot Provenance Certification', () => {
    let mockDb;
    let service;
    let classifier;
    let mockDelivery;
    let deliveredOtps;
    let baseChecksum;

    const baselineBpeSnapshot = {
        bpe_calculation_id: 'bpe_calc_canonical_historical',
        bpe_engine_version: 'v3.0',
        rates_checksum: 'sha256-e99a8b1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        order_id: 'ord_r3_100',
        order_ref: 'job_order_100',
        target_margin_pct: 18.5,
        base_production_cost: 1147.30,
        base_net_price: 1407.7301,
        specs: {
            copies: 1000,
            interior_pages: 128,
            cover_pages: 4,
            book_width: 148,
            book_height: 210,
            paper_weight_interior: 90,
            paper_type_interior: 'offset',
            signature: 32,
            sheet_width: 640,
            sheet_height: 900
        },
        rates: {
            paper_price_interior_by_kilo: {
                offset: 1.45,
                coated: 1.65,
                lux: 1.85
            },
            paper_waste_for_binding: 5.0,
            waste_sheets_setup: 100
        },
        breakdown: {
            interior_paper_cost: 464.00,
            kilos_interior: 320,
            cover_paper_cost: 75.90,
            interior_print_cost: 168.00,
            cover_print_cost: 146.00,
            endpapers_cost: 14.40,
            binding_cost: 279.00,
            freight_cost: 0.00,
            total_industrial_cost: 1147.30
        }
    };

    beforeEach(() => {
        classifier = new TaxVatReadinessClassifierService();
        deliveredOtps = [];

        mockDelivery = {
            configured: true,
            isDeliveryChannelConfigured: () => true,
            deliverOtp: async (payload) => {
                deliveredOtps.push(payload);
                return {
                    ok: true,
                    status: 'PROVIDER_ACCEPTED',
                    channel: 'EMAIL',
                    destination: payload.recipientEmail,
                    proof: {
                        provider_message_id: `msg_r3_${Date.now()}`,
                        accepted_at: new Date().toISOString(),
                        handset_delivered: false
                    }
                };
            }
        };

        service = new OrderQuoteRevisionService({
            taxClassifier: classifier,
            otpDeliveryService: mockDelivery,
            defaultOtpThresholdEur: 50.00
        });

        baseChecksum = pricingSnapshotCanonicalizer.calculatePricingSnapshotChecksum(baselineBpeSnapshot);
        mockDb = {
            orders: [
                {
                    id: 'ord_r3_100',
                    order_ref: 'job_order_100',
                    tenant_id: 'tenant_alpha',
                    printhouse_id: 'ph_madrid_01',
                    customer_email: 'finance.director@acme-publishing.es',
                    delivery_country: 'ES',
                    vat_number: 'ESA12345678',
                    product_type: 'BOOK',
                    offers_snapshot: baselineBpeSnapshot,
                    metadata_json: {
                        delivery_country: 'ES',
                        supplier_offer_valid_until: '2026-11-15T18:00:00.000Z'
                    }
                }
            ],
            order_pricing_snapshots: [
                {
                    snapshot_id: 'ops_r3_100',
                    order_id: 'ord_r3_100',
                    tenant_id: 'tenant_alpha',
                    printhouse_id: 'ph_madrid_01',
                    status: 'SEALED',
                    currency: 'EUR',
                    final_amount: 1407.7301,
                    formula_version: 'v3.0',
                    rate_card_checksum: baselineBpeSnapshot.rates_checksum,
                    snapshot_json: JSON.stringify(baselineBpeSnapshot),
                    snapshot_checksum: baseChecksum,
                    sealed_by: 'BPE_ENGINE_SEALER',
                    sealed_at: new Date()
                }
            ],
            order_paper_decisions: [
                {
                    id: 'opd_legit_001',
                    tenant_id: 'tenant_alpha',
                    external_order_intent_id: 'job_order_100',
                    canonical_order_id: 'ord_r3_100',
                    printhouse_tenant_id: 'ph_madrid_01',
                    paper_role: 'INTERIOR',
                    requested_variant_id: 'var_offset_90',
                    decision_action: 'PROPOSE_ALTERNATIVE',
                    alternative_variant_id: 'var_offset_120',
                    economic_status: 'REQUIRES_ECONOMIC_REVISION',
                    status: 'ACTIVE',
                    metadata_json: {
                        supplier_offer_valid_until: '2026-11-15T18:00:00.000Z'
                    }
                }
            ],
            paper_variants: [
                {
                    id: 'var_offset_120',
                    gsm: 120,
                    paper_type: 'offset',
                    sheet_width: 640,
                    sheet_height: 900,
                    width_mm: 640,
                    height_mm: 900,
                    finish: 'offset',
                    category: 'offset',
                    brand_name: 'Munken Print White 120g'
                }
            ],
            order_quote_revisions: [],
            quote_revision_tokens: [],
            order_revision_audit_events: [],
            printhouse_profiles: [
                {
                    printhouse_id: 'ph_madrid_01',
                    target_margin_pct: 18.5,
                    timezone: 'Europe/Madrid',
                    jurisdiction: 'ES-MD',
                    has_lunch_break: 1,
                    business_hours_ttl: 48
                }
            ]
        };

        const mockConn = {
            beginTransaction: async () => {},
            commit: async () => {},
            rollback: async () => {},
            release: () => {},
            query: async (sql, params = []) => {
                if (sql.includes('SELECT') && sql.includes('FROM orders') && sql.includes('FOR UPDATE')) {
                    const row = mockDb.orders.find(o => o.order_ref === params[0] || o.id === params[1] || o.order_ref === params[1]);
                    return [row ? [row] : []];
                }
                if (sql.includes('SELECT') && sql.includes('FROM order_paper_decisions')) {
                    const row = mockDb.order_paper_decisions.find(d => d.id === params[0]);
                    return [row ? [row] : []];
                }
                if (sql.includes('SELECT') && sql.includes('FROM order_pricing_snapshots')) {
                    const [orderId, tenantId] = params;
                    const matches = (mockDb.order_pricing_snapshots || []).filter(
                        snap => (!orderId || snap.order_id === orderId) && (!tenantId || snap.tenant_id === tenantId) && snap.status === 'SEALED'
                    );
                    return [matches];
                }
                if (sql.includes('SELECT') && sql.includes('FROM paper_variants')) {
                    const row = mockDb.paper_variants.find(v => v.id === params[0]);
                    return [row ? [row] : []];
                }
                if (sql.includes('SELECT') && sql.includes('FROM printhouse_profiles')) {
                    if (mockDb._simulatePrinthouseProfileDbError) {
                        throw new Error('ECONNRESET: Database connection lost during printhouse profile lookup');
                    }
                    const row = mockDb.printhouse_profiles.find(p => p.printhouse_id === params[0]);
                    return [row ? [row] : []];
                }
                if (sql.includes('SELECT') && sql.includes('FROM order_quote_revisions') && sql.includes('FOR UPDATE')) {
                    return [[]];
                }
                if (sql.includes('INSERT INTO order_quote_revisions')) {
                    mockDb.order_quote_revisions.push({ id: params[0], payload: params });
                    return [{ affectedRows: 1 }];
                }
                if (sql.includes('INSERT INTO quote_revision_tokens')) {
                    mockDb.quote_revision_tokens.push({ id: params[0], payload: params });
                    return [{ affectedRows: 1 }];
                }
                if (sql.includes('INSERT INTO order_revision_audit_events')) {
                    mockDb.order_revision_audit_events.push({ id: params[0], payload: params });
                    return [{ affectedRows: 1 }];
                }
                if (sql.includes('UPDATE order_paper_decisions')) {
                    return [{ affectedRows: 1 }];
                }
                return [[]];
            }
        };

        mysqlClient.getConnection = async () => mockConn;
    });

    // =========================================================================
    // 1. FISC-01: RELIABLE FISCAL CLASSIFICATION
    // =========================================================================
    describe('1. FISC-01 — Reliable Fiscal Classification', () => {
        it('1.1: Product with 128 interior pages but product_type CATALOG gets standard VAT 21%, not 4%', async () => {
            mockDb.orders[0].product_type = 'CATALOG';
            delete mockDb.orders[0].metadata_json.is_editorial_book;

            const revision = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'finance.director@acme-publishing.es'
            });

            // Standard VAT 21.00% applied
            assert.strictEqual(revision.tax_rate_pct, 21.00);
            const expectedGross = Math.round((revision.revised_net_amount * 1.21) * 100) / 100;
            assert.strictEqual(revision.revised_gross_amount, expectedGross);
        });

        it('1.2: Product with 128 interior pages and product_type BOOK gets super-reduced VAT 4%', async () => {
            mockDb.orders[0].product_type = 'BOOK';

            const revision = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'finance.director@acme-publishing.es'
            });

            // Super-reduced 4.00% under Art. 91.Dos.1.2º Ley del IVA
            assert.strictEqual(revision.tax_rate_pct, 4.00);
            const expectedGross = Math.round((revision.revised_net_amount * 1.04) * 100) / 100;
            assert.strictEqual(revision.revised_gross_amount, expectedGross);
        });

        it('1.3: Fails closed with 422 TAX_CLASSIFICATION_BLOCKED when destination country is missing (no ES fallback)', async () => {
            // Completely strip delivery country from order and metadata
            delete mockDb.orders[0].delivery_country;
            delete mockDb.orders[0].metadata_json.delivery_country;
            delete mockDb.orders[0].metadata_json.shipping_country;

            await assert.rejects(
                () => service.createQuoteRevision({
                    tenantId: 'tenant_alpha',
                    externalOrderIntentId: 'job_order_100',
                    paperDecisionId: 'opd_legit_001',
                    recipientEmail: 'finance.director@acme-publishing.es'
                }),
                err => {
                    assert.strictEqual(err.code, 'TAX_CLASSIFICATION_BLOCKED');
                    assert.strictEqual(err.statusCode, 422);
                    assert.ok(err.details?.findings?.includes('MISSING_JURISDICTION_DATA'));
                    return true;
                }
            );
        });

        it('1.4: Cross-border EU B2B with valid VIES and proof of transport gets 0% exempt (Art. 25 LIVA)', async () => {
            mockDb.orders[0].delivery_country = 'FR';
            mockDb.orders[0].vat_number = 'FR12345678901';
            mockDb.orders[0].metadata_json = {
                delivery_country: 'FR',
                vies_valid: true,
                has_proof_of_transport: true
            };

            const revision = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'finance.director@acme-publishing.es'
            });

            assert.strictEqual(revision.tax_rate_pct, 0.00);
            assert.strictEqual(revision.revised_gross_amount, Math.round(revision.revised_net_amount * 100) / 100);
        });

        it('1.5: Cross-border EU B2B with valid VIES but WITHOUT proof of transport is BLOCKED (Art. 138 Dir)', async () => {
            mockDb.orders[0].delivery_country = 'FR';
            mockDb.orders[0].vat_number = 'FR12345678901';
            mockDb.orders[0].metadata_json = {
                delivery_country: 'FR',
                vies_valid: true,
                has_proof_of_transport: false // Missing cross-border CMR/dispatch proof
            };

            await assert.rejects(
                () => service.createQuoteRevision({
                    tenantId: 'tenant_alpha',
                    externalOrderIntentId: 'job_order_100',
                    paperDecisionId: 'opd_legit_001',
                    recipientEmail: 'finance.director@acme-publishing.es'
                }),
                err => {
                    assert.strictEqual(err.code, 'TAX_CLASSIFICATION_BLOCKED');
                    assert.strictEqual(err.statusCode, 422);
                    assert.ok(err.details?.findings?.includes('UNVERIFIED_CROSS_BORDER_DISPATCH'));
                    return true;
                }
            );
        });

        it('1.6: Cross-border EU B2C is strictly blocked pending OSS destination tax review', async () => {
            mockDb.orders[0].delivery_country = 'FR';
            delete mockDb.orders[0].vat_number; // B2C customer without VAT ID
            mockDb.orders[0].metadata_json = {
                delivery_country: 'FR',
                customer_type: 'B2C'
            };

            await assert.rejects(
                () => service.createQuoteRevision({
                    tenantId: 'tenant_alpha',
                    externalOrderIntentId: 'job_order_100',
                    paperDecisionId: 'opd_legit_001',
                    recipientEmail: 'finance.director@acme-publishing.es'
                }),
                err => {
                    assert.strictEqual(err.code, 'TAX_CLASSIFICATION_BLOCKED');
                    assert.strictEqual(err.statusCode, 422);
                    assert.ok(err.details?.findings?.includes('INTRA_EU_B2C_REVIEW_REQUIRED') || err.message.includes('OSS'));
                    return true;
                }
            );
        });
    });

    // =========================================================================
    // 2. TIME-01: REAL LABOR CALENDAR (IANA EUROPE/MADRID, DST & HOLIDAYS)
    // =========================================================================
    describe('2. TIME-01 — Verifiable Labor Calendar (Europe/Madrid, DST & Holidays)', () => {
        it('2.1: Summer working hours: 09:00 Madrid (CEST, UTC+2) corresponds to 07:00 UTC', () => {
            // Wednesday in July (CEST is UTC+2)
            const summerStart = new Date('2026-07-01T07:00:00.000Z'); // 09:00 CEST
            const expiration = calculateBusinessHoursExpirationUtc({
                startDate: summerStart,
                businessHours: 9, // 1 full workday (09:00 to 18:00 without lunch break)
                timezone: 'Europe/Madrid',
                hasLunchBreak: false
            });

            // 18:00 CEST corresponds to 16:00 UTC
            assert.strictEqual(expiration.toISOString(), '2026-07-01T16:00:00.000Z');
        });

        it('2.2: Winter working hours: 09:00 Madrid (CET, UTC+1) corresponds to 08:00 UTC', () => {
            // Wednesday in January (CET is UTC+1)
            const winterStart = new Date('2026-01-14T08:00:00.000Z'); // 09:00 CET
            const expiration = calculateBusinessHoursExpirationUtc({
                startDate: winterStart,
                businessHours: 9, // 1 full workday (09:00 to 18:00 without lunch break)
                timezone: 'Europe/Madrid',
                hasLunchBreak: false
            });

            // 18:00 CET corresponds to 17:00 UTC
            assert.strictEqual(expiration.toISOString(), '2026-01-14T17:00:00.000Z');
        });

        it('2.3: Correctly spans DST change (Spring Forward CET -> CEST on last Sunday of March)', () => {
            // Friday March 27, 2026 at 15:00 CET (14:00 UTC)
            // Friday remaining: 3 hours (15:00 to 18:00 CET)
            // Saturday March 28 & Sunday March 29 (DST change CET -> CEST): skipped
            // Monday March 30, 2026: needs 2 hours (09:00 to 11:00 CEST = 09:00 UTC)
            const fridayStart = new Date('2026-03-27T14:00:00.000Z');
            const expiration = calculateBusinessHoursExpirationUtc({
                startDate: fridayStart,
                businessHours: 5,
                timezone: 'Europe/Madrid'
            });

            assert.strictEqual(expiration.toISOString(), '2026-03-30T09:00:00.000Z');
        });

        it('2.4: Correctly spans DST change (Fall Back CEST -> CET on last Sunday of October)', () => {
            // Friday October 23, 2026 at 15:00 CEST (13:00 UTC)
            // Friday remaining: 3 hours (15:00 to 18:00 CEST)
            // Saturday Oct 24 & Sunday Oct 25 (DST fall back CEST -> CET): skipped
            // Monday October 26, 2026: now CET (UTC+1). 09:00 to 11:00 CET = 10:00 UTC
            const fridayStart = new Date('2026-10-23T13:00:00.000Z');
            const expiration = calculateBusinessHoursExpirationUtc({
                startDate: fridayStart,
                businessHours: 5,
                timezone: 'Europe/Madrid'
            });

            assert.strictEqual(expiration.toISOString(), '2026-10-26T10:00:00.000Z');
        });

        it('2.5: Skips official statutory Madrid holidays (e.g. Fiesta del Trabajo May 1 & Comunidad de Madrid May 2)', () => {
            // Thursday April 30, 2026 at 15:00 CEST (13:00 UTC)
            // Thursday gets 3 hours (15:00 to 18:00 CEST)
            // Friday May 1 (Labor Day holiday): SKIPPED
            // Saturday May 2 (Madrid Community Day): SKIPPED
            // Sunday May 3: SKIPPED
            // Monday May 4: resumes at 09:00 CEST. Needs 2 hours (09:00 to 11:00 CEST = 09:00 UTC)
            const start = new Date('2026-04-30T13:00:00.000Z');
            const expiration = calculateBusinessHoursExpirationUtc({
                startDate: start,
                businessHours: 5,
                timezone: 'Europe/Madrid'
            });

            assert.strictEqual(expiration.toISOString(), '2026-05-04T09:00:00.000Z');
        });

        it('2.6: Meeus/Butcher Western Easter calculates Holy Thursday and Good Friday deterministically', () => {
            const holidays2026 = getMadridOfficialHolidays(2026);
            assert.ok(holidays2026.has('2026-04-02'), 'Holy Thursday 2026 must be April 2');
            assert.ok(holidays2026.has('2026-04-03'), 'Good Friday 2026 must be April 3');
            assert.ok(holidays2026.has('2026-10-12'), 'Fiesta Nacional de España must be Oct 12');
            assert.ok(holidays2026.has('2026-12-25'), 'Navidad must be Dec 25');
        });
    });

    // =========================================================================
    // 3. BPE-01: AUTHORIZED SNAPSHOT PROVENANCE & DATABASE ERROR PROPAGATION
    // =========================================================================
    describe('3. BPE-01 — Authorized Snapshot Provenance & Database Error Propagation', () => {
        it('3.1: Rejects untethered decision.metadata_json.bpe_snapshot with 422 RECALCULATION_BLOCKED', async () => {
            // Order has no snapshot stored in order table
            mockDb.orders[0].offers_snapshot = null;
            mockDb.order_pricing_snapshots = [];

            // Untethered snapshot in decision metadata (lacks order linkage proof)
            const untetheredSnapshot = JSON.parse(JSON.stringify(baselineBpeSnapshot));
            delete untetheredSnapshot.order_id;
            delete untetheredSnapshot.order_ref;

            mockDb.order_paper_decisions[0].metadata_json = {
                bpe_snapshot: untetheredSnapshot
            };

            await assert.rejects(
                () => service.createQuoteRevision({
                    tenantId: 'tenant_alpha',
                    externalOrderIntentId: 'job_order_100',
                    paperDecisionId: 'opd_legit_001',
                    recipientEmail: 'finance.director@acme-publishing.es'
                }),
                err => {
                    assert.strictEqual(err.code, 'RECALCULATION_BLOCKED');
                    assert.strictEqual(err.statusCode, 422);
                    assert.strictEqual(err.details?.reason, 'UNVERIFIED_SNAPSHOT_PROVENANCE');
                    return true;
                }
            );
        });

        it('3.2: Accepts decision.metadata_json.bpe_snapshot when order linkage is accredited', async () => {
            mockDb.orders[0].offers_snapshot = null;

            // Accredited snapshot explicitly bound to order_id and sealed in DB
            const accreditedSnapshot = JSON.parse(JSON.stringify(baselineBpeSnapshot));
            accreditedSnapshot.order_id = 'ord_r3_100';

            mockDb.order_paper_decisions[0].metadata_json = {
                bpe_snapshot: accreditedSnapshot
            };
            mockDb.order_pricing_snapshots = [
                {
                    snapshot_id: 'ops_r3_100',
                    order_id: 'ord_r3_100',
                    tenant_id: 'tenant_alpha',
                    printhouse_id: 'ph_madrid_01',
                    status: 'SEALED',
                    currency: 'EUR',
                    final_amount: 1407.7301,
                    formula_version: 'v3.0',
                    rate_card_checksum: baselineBpeSnapshot.rates_checksum,
                    snapshot_json: JSON.stringify(baselineBpeSnapshot),
                    snapshot_checksum: baseChecksum,
                    sealed_by: 'BPE_ENGINE_SEALER',
                    sealed_at: new Date()
                }
            ];

            const revision = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'finance.director@acme-publishing.es'
            });

            assert.strictEqual(revision.base_net_amount, 1407.7301);
            assert.strictEqual(revision.status, 'PENDING');
        });

        it('3.3: Rejects calculation snapshot lacking bpe_engine_version', () => {
            const invalidSnapshot = JSON.parse(JSON.stringify(baselineBpeSnapshot));
            delete invalidSnapshot.bpe_engine_version;
            delete invalidSnapshot.formula_version;

            const res = validateBpeSnapshotProvenance(invalidSnapshot, { orderId: 'ord_r3_100' });
            assert.strictEqual(res.valid, false);
            assert.strictEqual(res.code, 'MISSING_BPE_ENGINE_VERSION');
        });

        it('3.4: Rejects calculation snapshot with corrupted rates_checksum', () => {
            const corruptSnapshot = JSON.parse(JSON.stringify(baselineBpeSnapshot));
            corruptSnapshot.rates_checksum = 'bad!@#$%';

            const res = validateBpeSnapshotProvenance(corruptSnapshot, { orderId: 'ord_r3_100' });
            assert.strictEqual(res.valid, false);
            assert.strictEqual(res.code, 'INCOMPATIBLE_RATES_CHECKSUM');
        });

        it('3.5: Printhouse margin database query failure is NOT swallowed; transaction aborts', async () => {
            // Snapshot has no target_margin_pct, forcing database lookup in printhouse_profiles
            const noMarginSnapshot = JSON.parse(JSON.stringify(baselineBpeSnapshot));
            delete noMarginSnapshot.target_margin_pct;
            mockDb.orders[0].offers_snapshot = noMarginSnapshot;
            mockDb.order_pricing_snapshots[0].snapshot_json = JSON.stringify(noMarginSnapshot);
            mockDb.order_pricing_snapshots[0].snapshot_checksum = pricingSnapshotCanonicalizer.calculatePricingSnapshotChecksum(noMarginSnapshot);

            // Simulate database connection crash during printhouse_profiles query
            mockDb._simulatePrinthouseProfileDbError = true;

            await assert.rejects(
                () => service.createQuoteRevision({
                    tenantId: 'tenant_alpha',
                    externalOrderIntentId: 'job_order_100',
                    paperDecisionId: 'opd_legit_001',
                    recipientEmail: 'finance.director@acme-publishing.es'
                }),
                err => {
                    // Must be real DB error, NOT converted into 422 MISSING_AUTHORITATIVE_MARGIN
                    assert.ok(err.message.includes('ECONNRESET'), 'Database error must propagate');
                    return true;
                }
            );
        });

        it('3.6: Legitimate absence of margin configuration is cleanly differentiated from DB error', async () => {
            const noMarginSnapshot = JSON.parse(JSON.stringify(baselineBpeSnapshot));
            delete noMarginSnapshot.target_margin_pct;
            mockDb.orders[0].offers_snapshot = noMarginSnapshot;
            mockDb.order_pricing_snapshots[0].snapshot_json = JSON.stringify(noMarginSnapshot);
            mockDb.order_pricing_snapshots[0].snapshot_checksum = pricingSnapshotCanonicalizer.calculatePricingSnapshotChecksum(noMarginSnapshot);

            // Database responds normally, but tenant has no registered margin profile
            mockDb.printhouse_profiles = [];

            await assert.rejects(
                () => service.createQuoteRevision({
                    tenantId: 'tenant_alpha',
                    externalOrderIntentId: 'job_order_100',
                    paperDecisionId: 'opd_legit_001',
                    recipientEmail: 'finance.director@acme-publishing.es'
                }),
                err => {
                    assert.strictEqual(err.code, 'RECALCULATION_BLOCKED');
                    assert.strictEqual(err.statusCode, 422);
                    assert.strictEqual(err.details?.reason, 'MISSING_AUTHORITATIVE_MARGIN');
                    return true;
                }
            );
        });
    });
});
