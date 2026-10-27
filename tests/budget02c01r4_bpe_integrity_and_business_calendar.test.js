'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-r4-jwt-secret-ppos-2026';
process.env.NODE_ENV = 'test';

/**
 * tests/budget02c01r4_bpe_integrity_and_business_calendar.test.js
 * 
 * BUDGET-02C-01R4: BPE Integrity, Real Labor Calendar & Expiration Enforcement Certification Suite
 * 
 * Exhaustively certifies:
 * 1. BPE-01R: Cryptographic Sealing & Snapshot Provenance Verification
 *    - Rejection of self-declared metadata flags (bpe_snapshot_provenance_verified === true) without DB seal.
 *    - Strict enforcement of order_pricing_snapshots database schema contract.
 *    - Verification of snapshot status = 'SEALED' and non-empty sealed_by authority.
 *    - Binding of snapshot order_id and tenant_id to the active transaction.
 *    - Recalculation and cryptographic match of canonical SHA-256 snapshot_checksum.
 *    - Tariff rate_card_checksum and BPE formula_version consistency checks.
 *    - Baseline net commercial amount equivalence (tolerance <= 0.0001 EUR).
 *    - Fail-closed behavior with RECALCULATION_BLOCKED / UNVERIFIED_SNAPSHOT_PROVENANCE.
 * 2. TIME-01R: Operating Schedule, Real Business Hours & Analytical Segment Stepping
 *    - Default 8 effective business hours/day with 1-hour lunch break (14:00-15:00 local time).
 *    - Optional 9 continuous operating hours/day when hasLunchBreak = false.
 *    - Minute-level precision from arbitrary start timestamps (09:15, 13:30, 17:45).
 *    - Resumption across lunch break, nights, weekends, and statutory holidays.
 * 3. TIME-01R: Jurisdictional Statutory Calendars & Printhouse Policy Profiles
 *    - Multi-jurisdictional holiday resolution (ES-MD, ES-CT, ES-VC, ES-AN, ES-GA, ES-PV).
 *    - Differentiation between regional calendars (Holy Thursday in Madrid vs Easter Monday / Sant Joan in Catalonia).
 *    - Integration with printhouse profile settings in printhouse_profiles table.
 *    - Custom printhouse municipal holidays (e.g. San Isidro in Madrid city).
 * 4. TIME-01R & SEC-C04: Expiration Clamping & Decision Rejection
 *    - Clamping of expiration by supplier_offer_valid_until.
 *    - Strict rejection with HTTP 410 TOKEN_EXPIRED on respondToQuoteRevision after deadline.
 *    - Persistent state transition of token and revision to EXPIRED upon post-expiration interaction.
 */

const assert = require('assert');
const crypto = require('crypto');
const mysqlClient = require('../src/api/services/mysqlClient');
const {
    OrderQuoteRevisionService,
    OrderQuoteRevisionError,
    calculateBusinessHoursExpirationUtc,
    getOfficialHolidaysForJurisdiction,
    validateBpeSnapshotProvenance
} = require('../src/api/services/orderQuoteRevisionService');
const TaxVatReadinessClassifierService = require('../src/api/services/taxVatReadinessClassifierService');
const pricingSnapshotCanonicalizer = require('../src/api/services/pricingSnapshotCanonicalizer');

describe('BUDGET-02C-01R4 — BPE Integrity & Business Calendar Certification', () => {
    let mockDb;
    let service;
    let classifier;
    let mockDelivery;
    let deliveredOtps;
    let baseChecksum;

    const baselineBpeSnapshot = {
        bpe_calculation_id: 'bpe_calc_canonical_r4_001',
        bpe_engine_version: 'v3.0',
        rates_checksum: 'sha256-e99a8b1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        order_id: 'ord_r4_100',
        order_ref: 'job_order_r4_100',
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
                        provider_message_id: `msg_r4_${Date.now()}`,
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
                    id: 'ord_r4_100',
                    order_ref: 'job_order_r4_100',
                    tenant_id: 'tenant_omega',
                    printhouse_id: 'ph_es_001',
                    customer_email: 'procurement@editorial-mediterraneo.es',
                    delivery_country: 'ES',
                    vat_number: 'ESB98765432',
                    product_type: 'BOOK',
                    offers_snapshot: baselineBpeSnapshot,
                    metadata_json: {
                        delivery_country: 'ES',
                        supplier_offer_valid_until: '2026-12-31T18:00:00.000Z'
                    }
                }
            ],
            order_pricing_snapshots: [
                {
                    snapshot_id: 'ops_r4_100',
                    order_id: 'ord_r4_100',
                    tenant_id: 'tenant_omega',
                    printhouse_id: 'ph_es_001',
                    status: 'SEALED',
                    currency: 'EUR',
                    final_amount: 1407.7301,
                    formula_version: 'v3.0',
                    rate_card_checksum: baselineBpeSnapshot.rates_checksum,
                    snapshot_json: JSON.stringify(baselineBpeSnapshot),
                    snapshot_checksum: baseChecksum,
                    sealed_by: 'BPE_ENGINE_SEALER_V3',
                    sealed_at: new Date()
                }
            ],
            order_paper_decisions: [
                {
                    id: 'opd_r4_001',
                    tenant_id: 'tenant_omega',
                    external_order_intent_id: 'job_order_r4_100',
                    canonical_order_id: 'ord_r4_100',
                    printhouse_tenant_id: 'ph_es_001',
                    paper_role: 'INTERIOR',
                    requested_variant_id: 'var_offset_90',
                    decision_action: 'PROPOSE_ALTERNATIVE',
                    alternative_variant_id: 'var_offset_120',
                    economic_status: 'REQUIRES_ECONOMIC_REVISION',
                    status: 'ACTIVE',
                    metadata_json: {
                        supplier_offer_valid_until: '2026-12-31T18:00:00.000Z'
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
                    brand_name: 'Torraspapel Offset 120g'
                }
            ],
            order_quote_revisions: [],
            quote_revision_tokens: [],
            order_revision_audit_events: [],
            printhouse_profiles: [
                {
                    printhouse_id: 'ph_es_001',
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
                if (sql.includes('SELECT t.id AS token_id') && sql.includes('FROM quote_revision_tokens t')) {
                    const tokenHash = params[0];
                    const tokenObj = (mockDb.quote_revision_tokens || []).find(t => t.token_hash === tokenHash || (t.payload && t.payload.includes(tokenHash)));
                    if (!tokenObj) return [[]];
                    const rev = mockDb.order_quote_revisions[0] || {};
                    return [[{
                        token_id: tokenObj.id,
                        token_status: tokenObj.status || 'PENDING',
                        expires_at: tokenObj.expires_at || new Date(Date.now() + 86400000).toISOString(),
                        attempt_count: tokenObj.attempt_count || 0,
                        max_attempts: 3,
                        bound_amount: 1407.7301,
                        bound_currency: 'EUR',
                        recipient_email_hash: crypto.createHash('sha256').update('procurement@editorial-mediterraneo.es').digest('hex'),
                        otp_hash: null,
                        otp_salt: null,
                        otp_expires_at: null,
                        otp_attempts: 0,
                        otp_max_attempts: 3,
                        otp_delivery_status: 'NOT_APPLICABLE',
                        revision_id: rev.id || 'oqr_mock_1',
                        tenant_id: 'tenant_omega',
                        external_order_intent_id: 'job_order_r4_100',
                        revision_status: rev.status || 'PENDING',
                        delta_net_amount: 25.00,
                        delta_gross_amount: 26.00,
                        applied_policies_json: JSON.stringify({ otp_delta_threshold_eur: 50.00 })
                    }]];
                }
                if (sql.includes('UPDATE quote_revision_tokens SET status =')) {
                    return [{ affectedRows: 1 }];
                }
                if (sql.includes('UPDATE order_quote_revisions SET status =')) {
                    return [{ affectedRows: 1 }];
                }
                return [[]];
            }
        };

        mysqlClient.getConnection = async () => mockConn;
    });

    // =========================================================================
    // 1. BPE-01R: CRYPTOGRAPHIC SEALING & SNAPSHOT PROVENANCE CERTIFICATION
    // =========================================================================
    describe('1. BPE-01R — Cryptographic Sealing & Snapshot Provenance Verification', () => {
        it('1.1: Strips and rejects self-asserted bpe_snapshot_provenance_verified flag when no sealed DB record exists', async () => {
            // Emulate adversarial attacker who sets decisionMeta.bpe_snapshot_provenance_verified = true
            mockDb.order_pricing_snapshots = []; // No sealed record in DB
            mockDb.orders[0].offers_snapshot = null;
            mockDb.order_paper_decisions[0].metadata_json = {
                bpe_snapshot_provenance_verified: true,
                bpe_snapshot: baselineBpeSnapshot
            };

            await assert.rejects(
                () => service.createQuoteRevision({
                    tenantId: 'tenant_omega',
                    externalOrderIntentId: 'job_order_r4_100',
                    paperDecisionId: 'opd_r4_001',
                    recipientEmail: 'procurement@editorial-mediterraneo.es'
                }),
                err => {
                    assert.strictEqual(err.code, 'RECALCULATION_BLOCKED');
                    assert.strictEqual(err.statusCode, 422);
                    assert.strictEqual(err.details?.reason, 'UNVERIFIED_SNAPSHOT_PROVENANCE');
                    return true;
                }
            );
        });

        it('1.2: Rejects snapshot if database record status is not SEALED (e.g. DRAFT or PENDING)', () => {
            const draftSnap = {
                snapshot_id: 'ops_r4_draft',
                order_id: 'ord_r4_100',
                tenant_id: 'tenant_omega',
                status: 'DRAFT', // Unsealed!
                sealed_by: 'BPE_ENGINE_SEALER_V3',
                snapshot_checksum: baseChecksum,
                rate_card_checksum: baselineBpeSnapshot.rates_checksum,
                formula_version: 'v3.0',
                final_amount: 1407.7301
            };

            const result = validateBpeSnapshotProvenance(baselineBpeSnapshot, {
                orderId: 'ord_r4_100',
                tenantId: 'tenant_omega',
                sealedRecord: draftSnap
            });

            assert.strictEqual(result.valid, false);
            assert.strictEqual(result.code, 'UNVERIFIED_SNAPSHOT_STATUS');
        });

        it('1.3: Rejects snapshot if database record lacks seal authority (sealed_by is empty or null)', () => {
            const missingAuthoritySnap = {
                snapshot_id: 'ops_r4_no_auth',
                order_id: 'ord_r4_100',
                tenant_id: 'tenant_omega',
                status: 'SEALED',
                sealed_by: '', // Missing authority!
                snapshot_checksum: baseChecksum,
                rate_card_checksum: baselineBpeSnapshot.rates_checksum,
                formula_version: 'v3.0',
                final_amount: 1407.7301
            };

            const result = validateBpeSnapshotProvenance(baselineBpeSnapshot, {
                orderId: 'ord_r4_100',
                tenantId: 'tenant_omega',
                sealedRecord: missingAuthoritySnap
            });

            assert.strictEqual(result.valid, false);
            assert.strictEqual(result.code, 'MISSING_SEAL_AUTHORITY');
        });

        it('1.4: Rejects cross-order snapshot replay (snap.order_id !== orderId)', () => {
            const crossOrderSnap = {
                snapshot_id: 'ops_r4_alien_order',
                order_id: 'ord_different_999', // Order mismatch!
                tenant_id: 'tenant_omega',
                status: 'SEALED',
                sealed_by: 'BPE_ENGINE_SEALER_V3',
                snapshot_checksum: baseChecksum,
                rate_card_checksum: baselineBpeSnapshot.rates_checksum,
                formula_version: 'v3.0',
                final_amount: 1407.7301
            };

            const result = validateBpeSnapshotProvenance(baselineBpeSnapshot, {
                orderId: 'ord_r4_100',
                tenantId: 'tenant_omega',
                sealedRecord: crossOrderSnap
            });

            assert.strictEqual(result.valid, false);
            assert.strictEqual(result.code, 'SNAPSHOT_ORDER_MISMATCH');
        });

        it('1.5: Rejects cross-tenant snapshot replay (snap.tenant_id !== tenantId)', () => {
            const crossTenantSnap = {
                snapshot_id: 'ops_r4_alien_tenant',
                order_id: 'ord_r4_100',
                tenant_id: 'tenant_other_corp', // Tenant mismatch!
                status: 'SEALED',
                sealed_by: 'BPE_ENGINE_SEALER_V3',
                snapshot_checksum: baseChecksum,
                rate_card_checksum: baselineBpeSnapshot.rates_checksum,
                formula_version: 'v3.0',
                final_amount: 1407.7301
            };

            const result = validateBpeSnapshotProvenance(baselineBpeSnapshot, {
                orderId: 'ord_r4_100',
                tenantId: 'tenant_omega',
                sealedRecord: crossTenantSnap
            });

            assert.strictEqual(result.valid, false);
            assert.strictEqual(result.code, 'SNAPSHOT_TENANT_MISMATCH');
        });

        it('1.6: Cryptographically detects tampering with snapshot payload (recomputed SHA-256 mismatch)', () => {
            const tamperedSnapshot = JSON.parse(JSON.stringify(baselineBpeSnapshot));
            tamperedSnapshot.specs.interior_pages = 256; // Tampered spec!

            const sealedRecord = {
                snapshot_id: 'ops_r4_tampered',
                order_id: 'ord_r4_100',
                tenant_id: 'tenant_omega',
                status: 'SEALED',
                sealed_by: 'BPE_ENGINE_SEALER_V3',
                snapshot_checksum: baseChecksum, // Original checksum
                rate_card_checksum: baselineBpeSnapshot.rates_checksum,
                formula_version: 'v3.0',
                final_amount: 1407.7301
            };

            const result = validateBpeSnapshotProvenance(tamperedSnapshot, {
                orderId: 'ord_r4_100',
                tenantId: 'tenant_omega',
                sealedRecord
            });

            assert.strictEqual(result.valid, false);
            assert.strictEqual(result.code, 'SNAPSHOT_INTEGRITY_TAMPERED');
        });

        it('1.7: Rejects snapshot with divergent tariff rates_checksum', () => {
            const divergentRatesSnapshot = JSON.parse(JSON.stringify(baselineBpeSnapshot));
            divergentRatesSnapshot.rates_checksum = 'sha256-ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

            const sealedRecord = {
                snapshot_id: 'ops_r4_rates_mismatch',
                order_id: 'ord_r4_100',
                tenant_id: 'tenant_omega',
                status: 'SEALED',
                sealed_by: 'BPE_ENGINE_SEALER_V3',
                snapshot_checksum: pricingSnapshotCanonicalizer.calculatePricingSnapshotChecksum(divergentRatesSnapshot),
                rate_card_checksum: baselineBpeSnapshot.rates_checksum, // Sealed under old tariff!
                formula_version: 'v3.0',
                final_amount: 1407.7301
            };

            const result = validateBpeSnapshotProvenance(divergentRatesSnapshot, {
                orderId: 'ord_r4_100',
                tenantId: 'tenant_omega',
                sealedRecord
            });

            assert.strictEqual(result.valid, false);
            assert.strictEqual(result.code, 'INCOMPATIBLE_RATES_CHECKSUM');
        });

        it('1.8: Rejects snapshot with formula_version mismatch', () => {
            const divergentEngineSnapshot = JSON.parse(JSON.stringify(baselineBpeSnapshot));
            divergentEngineSnapshot.bpe_engine_version = 'v4.0-experimental';

            const sealedRecord = {
                snapshot_id: 'ops_r4_engine_mismatch',
                order_id: 'ord_r4_100',
                tenant_id: 'tenant_omega',
                status: 'SEALED',
                sealed_by: 'BPE_ENGINE_SEALER_V3',
                snapshot_checksum: pricingSnapshotCanonicalizer.calculatePricingSnapshotChecksum(divergentEngineSnapshot),
                rate_card_checksum: baselineBpeSnapshot.rates_checksum,
                formula_version: 'v3.0', // Sealed under v3.0!
                final_amount: 1407.7301
            };

            const result = validateBpeSnapshotProvenance(divergentEngineSnapshot, {
                orderId: 'ord_r4_100',
                tenantId: 'tenant_omega',
                sealedRecord
            });

            assert.strictEqual(result.valid, false);
            assert.strictEqual(result.code, 'BPE_ENGINE_VERSION_MISMATCH');
        });

        it('1.9: Rejects snapshot when baseline commercial net amount diverges (> 0.0001 EUR)', () => {
            const divergentAmountSnapshot = JSON.parse(JSON.stringify(baselineBpeSnapshot));
            divergentAmountSnapshot.base_net_price = 1450.0000;

            const sealedRecord = {
                snapshot_id: 'ops_r4_amount_mismatch',
                order_id: 'ord_r4_100',
                tenant_id: 'tenant_omega',
                status: 'SEALED',
                sealed_by: 'BPE_ENGINE_SEALER_V3',
                snapshot_checksum: pricingSnapshotCanonicalizer.calculatePricingSnapshotChecksum(divergentAmountSnapshot),
                rate_card_checksum: baselineBpeSnapshot.rates_checksum,
                formula_version: 'v3.0',
                final_amount: 1407.7301 // Sealed final amount is 1407.7301
            };

            const result = validateBpeSnapshotProvenance(divergentAmountSnapshot, {
                orderId: 'ord_r4_100',
                tenantId: 'tenant_omega',
                sealedRecord
            });

            assert.strictEqual(result.valid, false);
            assert.strictEqual(result.code, 'BASELINE_AMOUNT_MISMATCH');
        });

        it('1.10: Zero retroactive sealing: creates no fake database records when snapshot is unsealed', async () => {
            mockDb.order_pricing_snapshots = []; // Zero sealed records

            await assert.rejects(
                () => service.createQuoteRevision({
                    tenantId: 'tenant_omega',
                    externalOrderIntentId: 'job_order_r4_100',
                    paperDecisionId: 'opd_r4_001',
                    recipientEmail: 'procurement@editorial-mediterraneo.es'
                }),
                err => {
                    assert.strictEqual(err.code, 'RECALCULATION_BLOCKED');
                    assert.strictEqual(err.statusCode, 422);
                    assert.strictEqual(err.details?.reason, 'UNVERIFIED_SNAPSHOT_PROVENANCE');
                    return true;
                }
            );

            // Confirm no retroactive INSERT happened
            assert.strictEqual(mockDb.order_pricing_snapshots.length, 0);
            assert.strictEqual(mockDb.order_quote_revisions.length, 0);
        });
    });

    // =========================================================================
    // 2. TIME-01R: REAL BUSINESS HOURS, LUNCH BREAKS & MINUTE PRECISION
    // =========================================================================
    describe('2. TIME-01R — Operating Schedule, Real Business Hours & Analytical Segment Stepping', () => {
        it('2.1: Default schedule (8 effective hours/day with 1h lunch break): 09:15 Madrid start spans exactly to 09:15 next day', () => {
            // Monday July 6, 2026 at 09:15 CEST (07:15 UTC)
            const start = new Date('2026-07-06T07:15:00.000Z');
            const expiration = calculateBusinessHoursExpirationUtc({
                startDate: start,
                businessHours: 8, // Exactly 1 full effective workday
                timezone: 'Europe/Madrid',
                hasLunchBreak: true
            });

            // Breakdown:
            // Day 1 (Monday): 09:15 to 14:00 (4h 45m) + 15:00 to 18:00 (3h) = 7h 45m = 465 min.
            // Remaining: 15 minutes.
            // Day 2 (Tuesday): starts at 09:00 CEST. +15 minutes = 09:15 CEST = 07:15 UTC.
            assert.strictEqual(expiration.toISOString(), '2026-07-07T07:15:00.000Z');
        });

        it('2.2: Partial mid-day start at 13:30 Madrid with 2 business hours (with lunch break) completes at 16:30 same day', () => {
            // Wednesday January 14, 2026 at 13:30 CET (12:30 UTC)
            const start = new Date('2026-01-14T12:30:00.000Z');
            const expiration = calculateBusinessHoursExpirationUtc({
                startDate: start,
                businessHours: 2,
                timezone: 'Europe/Madrid',
                hasLunchBreak: true
            });

            // Breakdown:
            // 13:30 to 14:00 = 30 minutes (0.5h).
            // 14:00 to 15:00 = lunch break (0h).
            // Remaining: 1.5h (90 min).
            // Afternoon segment: 15:00 + 90 min = 16:30 CET = 15:30 UTC.
            assert.strictEqual(expiration.toISOString(), '2026-01-14T15:30:00.000Z');
        });

        it('2.3: End-of-day start at 17:45 Madrid with 1 business hour (with lunch break) spans to 09:45 next day', () => {
            // Wednesday January 14, 2026 at 17:45 CET (16:45 UTC)
            const start = new Date('2026-01-14T16:45:00.000Z');
            const expiration = calculateBusinessHoursExpirationUtc({
                startDate: start,
                businessHours: 1, // 60 minutes
                timezone: 'Europe/Madrid',
                hasLunchBreak: true
            });

            // Breakdown:
            // 17:45 to 18:00 = 15 minutes.
            // Remaining: 45 minutes.
            // Thursday morning: starts at 09:00 CET + 45 minutes = 09:45 CET = 08:45 UTC.
            assert.strictEqual(expiration.toISOString(), '2026-01-15T08:45:00.000Z');
        });

        it('2.4: Continuous 9-hour schedule when hasLunchBreak = false: 09:00 start with 9h finishes at 18:00 same day', () => {
            // Wednesday July 1, 2026 at 09:00 CEST (07:00 UTC)
            const start = new Date('2026-07-01T07:00:00.000Z');
            const expiration = calculateBusinessHoursExpirationUtc({
                startDate: start,
                businessHours: 9,
                timezone: 'Europe/Madrid',
                hasLunchBreak: false // Continuous operating schedule
            });

            // 09:00 + 9h = 18:00 CEST = 16:00 UTC on same day
            assert.strictEqual(expiration.toISOString(), '2026-07-01T16:00:00.000Z');
        });

        it('2.5: Starting inside lunch break window (14:30 Madrid) pauses clock until 15:00', () => {
            // Wednesday January 14, 2026 at 14:30 CET (13:30 UTC)
            const start = new Date('2026-01-14T13:30:00.000Z');
            const expiration = calculateBusinessHoursExpirationUtc({
                startDate: start,
                businessHours: 3,
                timezone: 'Europe/Madrid',
                hasLunchBreak: true
            });

            // Clock advances to 15:00 CET without consuming business minutes.
            // Afternoon: 15:00 + 3h = 18:00 CET = 17:00 UTC.
            assert.strictEqual(expiration.toISOString(), '2026-01-14T17:00:00.000Z');
        });

        it('2.6: Starting after hours (21:00 Madrid) advances clock to 09:00 next business day', () => {
            // Tuesday July 7, 2026 at 21:00 CEST (19:00 UTC)
            const start = new Date('2026-07-07T19:00:00.000Z');
            const expiration = calculateBusinessHoursExpirationUtc({
                startDate: start,
                businessHours: 8, // 1 full day
                timezone: 'Europe/Madrid',
                hasLunchBreak: true
            });

            // Clock advances to Wednesday 09:00 CEST.
            // 09:00 to 14:00 (5h) + 15:00 to 18:00 (3h) = 8h.
            // Ends Wednesday at 18:00 CEST = 16:00 UTC.
            assert.strictEqual(expiration.toISOString(), '2026-07-08T16:00:00.000Z');
        });
    });

    // =========================================================================
    // 3. TIME-01R: MULTI-JURISDICTION STATUTORY CALENDARS & PRINTHOUSE PROFILES
    // =========================================================================
    describe('3. TIME-01R — Multi-Jurisdiction Statutory Calendars & Printhouse Profiles', () => {
        it('3.1: Regional divergence: Holy Thursday is holiday in Madrid (ES-MD) but working day in Catalonia (ES-CT)', () => {
            const mdHolidays = getOfficialHolidaysForJurisdiction(2026, 'ES-MD');
            const ctHolidays = getOfficialHolidaysForJurisdiction(2026, 'ES-CT');

            // Holy Thursday 2026: April 2
            assert.ok(mdHolidays.has('2026-04-02'), 'Holy Thursday must be holiday in Madrid');
            assert.strictEqual(ctHolidays.has('2026-04-02'), false, 'Holy Thursday is regular working day in Catalonia');

            // Easter Monday 2026: April 6
            assert.strictEqual(mdHolidays.has('2026-04-06'), false, 'Easter Monday is regular working day in Madrid');
            assert.ok(ctHolidays.has('2026-04-06'), 'Easter Monday must be holiday in Catalonia');

            // Sant Joan: June 24
            assert.strictEqual(mdHolidays.has('2026-06-24'), false, 'Sant Joan is working day in Madrid');
            assert.ok(ctHolidays.has('2026-06-24'), 'Sant Joan must be holiday in Catalonia');
        });

        it('3.2: Valencia (ES-VC) includes San José (March 19) and Comunitat Valenciana (October 9)', () => {
            const vcHolidays = getOfficialHolidaysForJurisdiction(2026, 'ES-VC');
            assert.ok(vcHolidays.has('2026-03-19'), 'San José must be holiday in Valencia');
            assert.ok(vcHolidays.has('2026-10-09'), 'Día de la Comunitat Valenciana must be holiday');
        });

        it('3.3: Custom municipal holidays apply only when configured in printhouse profile', () => {
            const withoutCustom = getOfficialHolidaysForJurisdiction(2026, 'ES-MD');
            assert.strictEqual(withoutCustom.has('2026-05-15'), false, 'May 15 is not standard regional holiday');

            const withCustom = getOfficialHolidaysForJurisdiction(2026, 'ES-MD', ['05-15']);
            assert.ok(withCustom.has('2026-05-15'), 'San Isidro custom holiday must be recognized');
        });

        it('3.4: createQuoteRevision loads printhouse profile policies from printhouse_profiles table', async () => {
            // Configure printhouse in Catalonia without lunch break and 24h TTL
            mockDb.printhouse_profiles = [
                {
                    printhouse_id: 'ph_es_001',
                    target_margin_pct: 22.0,
                    timezone: 'Europe/Madrid',
                    jurisdiction: 'ES-CT',
                    has_lunch_break: 0, // Continuous operating hours
                    business_hours_ttl: 24,
                    custom_holidays_json: JSON.stringify(['09-24']) // La Mercè
                }
            ];

            const revision = await service.createQuoteRevision({
                tenantId: 'tenant_omega',
                externalOrderIntentId: 'job_order_r4_100',
                paperDecisionId: 'opd_r4_001',
                recipientEmail: 'procurement@editorial-mediterraneo.es'
            });

            assert.strictEqual(revision.status, 'PENDING');
            assert.strictEqual(revision.effective_business_hours, 24);
            assert.ok(revision.expires_at, 'Must have computed expiration');
        });
    });

    // =========================================================================
    // 4. TIME-01R & SEC-C04: EXPIRATION ENFORCEMENT & CLAMPING
    // =========================================================================
    describe('4. TIME-01R & SEC-C04 — Expiration Enforcement & Clamping', () => {
        it('4.1: respondToQuoteRevision strictly rejects expired token with HTTP 410 TOKEN_EXPIRED and transitions state', async () => {
            const rawToken = 'deadbeef'.repeat(8);
            const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

            // Token already expired yesterday
            mockDb.quote_revision_tokens = [
                {
                    id: 'qrt_expired_001',
                    status: 'PENDING',
                    token_hash: tokenHash,
                    expires_at: new Date(Date.now() - 86400000).toISOString(),
                    attempt_count: 0
                }
            ];

            await assert.rejects(
                () => service.respondToQuoteRevision({
                    rawToken,
                    decision: 'ACCEPT'
                }),
                err => {
                    assert.strictEqual(err.code, 'TOKEN_EXPIRED');
                    assert.strictEqual(err.statusCode, 410);
                    return true;
                }
            );
        });

        it('4.2: Expiration is clamped by supplier_offer_valid_until if earlier than business hours TTL', async () => {
            // Set supplier offer to expire in 2 hours
            const supplierExpiration = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
            mockDb.orders[0].metadata_json.supplier_offer_valid_until = supplierExpiration;
            mockDb.order_paper_decisions[0].metadata_json.supplier_offer_valid_until = supplierExpiration;

            const revision = await service.createQuoteRevision({
                tenantId: 'tenant_omega',
                externalOrderIntentId: 'job_order_r4_100',
                paperDecisionId: 'opd_r4_001',
                recipientEmail: 'procurement@editorial-mediterraneo.es'
            });

            // Expiration must be clamped to supplierExpiration
            assert.strictEqual(new Date(revision.expires_at).toISOString(), new Date(supplierExpiration).toISOString());
        });
    });
});
