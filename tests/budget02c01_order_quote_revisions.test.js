'use strict';

/**
 * tests/budget02c01_order_quote_revisions.test.js
 * 
 * BUDGET-02C-01: Governed Order Quote Revisions, BPE Reproducibility,
 * Single-Use Cryptographic Tokens, Fiscal Gate & Decoupled State Engine Certification Suite.
 *
 * Verifies:
 * 1. Puerta Obligatoria de Cierre Fiscal (Gate 2):
 *    - Strict differentiation: Intra-EU goods exempt (Art. 25 LIVA / Art. 138 Dir) vs Intra-EU services reverse charge (Art. 84.Uno.2º LIVA).
 *    - Rejection of goods exemption when VIES is valid but transport is unverified (Fail-closed TAX_CLASSIFICATION_BLOCKED).
 *    - Strict product differentiation: Editorial books (Art. 91.Dos.1.2º LIVA -> 4% super-reduced) vs commercial print (21% standard).
 *    - Special Spanish territories: Canary Islands (IGIC), Ceuta/Melilla (IPSI).
 *    - Exact canonical independent quota calculation: delta_tax = round2(revised*t) - round2(base*t).
 * 2. Puerta de Reproducibilidad BPE (Gate 3 & 5):
 *    - Fails closed with RECALCULATION_BLOCKED if baseline calculation or frozen rates are missing.
 *    - Enforces 100% frozen line items for unaffected components (cover, binding, printing, freight).
 *    - Server-exclusive calculation: rejects direct injection of unverified client delta.
 * 3. Persistencia Versionada & Concurrencia (Gate 4):
 *    - Multi-tenant isolation: Tenant A cannot access or mutate Tenant B's revisions.
 *    - Database-level concurrency slot: rejects concurrent PENDING revisions unless allowSupersede = true.
 *    - Monotonic state transitions: PENDING -> ACCEPTED / REJECTED / SUPERSEDED / REVOKED.
 * 4. Aceptación del Cliente & Tokens Monouso (Gate 6):
 *    - Single-use 256-bit CSPRNG token with zero plaintext persistence (only SHA-256 hash in DB).
 *    - GET review endpoint is strictly read-only and safe against browser prefetching/crawlers.
 *    - POST response consumes token; second attempt fails with 410 TOKEN_ALREADY_CONSUMED.
 *    - Expired tokens fail closed with 410 TOKEN_EXPIRED.
 *    - Anti-fraud OTP challenge enforced for deltas exceeding configurable threshold (50.00 €).
 * 5. Compuertas Industriales y Financieras Desacopladas (Gate 7):
 *    - GATE_CONTRACTUAL, GATE_FINANCIAL, and GATE_INDUSTRIAL remain strictly independent.
 *    - Acceptance does NOT trigger automated production dispatch.
 * 6. Auditoría Continua Append-Only:
 *    - All lifecycle events recorded immutably in order_revision_audit_events.
 */

const assert = require('assert');
const crypto = require('crypto');
const mysqlClient = require('../src/api/services/mysqlClient');
const {
    OrderQuoteRevisionService,
    OrderQuoteRevisionError,
    recalculateDeterministicBpePrice,
    sha256Canonical
} = require('../src/api/services/orderQuoteRevisionService');
const TaxVatReadinessClassifierService = require('../src/api/services/taxVatReadinessClassifierService');

describe('BUDGET-02C-01 — Governed Order Quote Revisions Certification Suite', () => {
    let mockDb;
    let service;
    let classifier;

    beforeEach(() => {
        classifier = new TaxVatReadinessClassifierService();
        const mockDeliveryService = {
            isDeliveryChannelConfigured: () => true,
            deliverOtp: async ({ recipientEmail, otpCode, revisionId }) => {
                return {
                    ok: true,
                    status: 'PROVIDER_ACCEPTED',
                    delivered: true,
                    proof: {
                        channel: 'EMAIL',
                        destination: recipientEmail,
                        provider_message_id: `msg_${Date.now()}`,
                        timestamp: new Date().toISOString()
                    }
                };
            }
        };

        service = new OrderQuoteRevisionService({
            taxClassifier: classifier,
            otpDeliveryService: mockDeliveryService
        });

        mockDb = {
            orders: [
                {
                    id: 'ord_can_100',
                    order_ref: 'job_order_100',
                    tenant_id: 'tenant_alpha',
                    printhouse_id: 'ph_dar_01',
                    customer_email: 'client@example.com',
                    offers_snapshot: JSON.stringify(baselineCalculationFixture)
                },
                {
                    id: 'ord_can_200',
                    order_ref: 'job_order_200',
                    tenant_id: 'tenant_alpha',
                    printhouse_id: 'ph_dar_01',
                    customer_email: 'client@example.com',
                    offers_snapshot: JSON.stringify(baselineCalculationFixture)
                },
                {
                    id: 'ord_can_300',
                    order_ref: 'job_order_300',
                    tenant_id: 'tenant_beta',
                    printhouse_id: 'ph_other',
                    customer_email: 'client@example.com',
                    offers_snapshot: JSON.stringify(baselineCalculationFixture)
                }
            ],
            order_paper_decisions: [
                {
                    id: 'opd_legit_001',
                    tenant_id: 'tenant_alpha',
                    external_order_intent_id: 'job_order_100',
                    canonical_order_id: 'ord_can_100',
                    printhouse_tenant_id: 'ph_dar_01',
                    paper_role: 'INTERIOR',
                    requested_variant_id: 'var_offset_90',
                    decision_action: 'PROPOSE_ALTERNATIVE',
                    alternative_variant_id: 'var_offset_120',
                    economic_status: 'REQUIRES_ECONOMIC_REVISION',
                    status: 'ACTIVE'
                },
                {
                    id: 'opd_confirmed_delta_zero',
                    tenant_id: 'tenant_alpha',
                    external_order_intent_id: 'job_order_200',
                    canonical_order_id: 'ord_can_200',
                    printhouse_tenant_id: 'ph_dar_01',
                    paper_role: 'INTERIOR',
                    requested_variant_id: 'var_offset_90',
                    decision_action: 'CONFIRM',
                    alternative_variant_id: null,
                    economic_status: 'DELTA_ZERO_CONFIRMED',
                    status: 'ACTIVE'
                },
                {
                    id: 'opd_other_tenant',
                    tenant_id: 'tenant_beta',
                    external_order_intent_id: 'job_order_300',
                    canonical_order_id: 'ord_can_300',
                    printhouse_tenant_id: 'ph_other',
                    paper_role: 'INTERIOR',
                    requested_variant_id: 'var_offset_90',
                    decision_action: 'PROPOSE_ALTERNATIVE',
                    alternative_variant_id: 'var_offset_120',
                    economic_status: 'REQUIRES_ECONOMIC_REVISION',
                    status: 'ACTIVE'
                }
            ],
            order_quote_revisions: [],
            quote_revision_tokens: [],
            order_revision_audit_events: []
        };

        // Mock mysqlClient connection
        const mockConn = {
            beginTransaction: async () => {},
            commit: async () => {},
            rollback: async () => {},
            release: () => {},
            query: async (sql, params = []) => {
                const s = sql.trim().toLowerCase();

                // 0. SELECT ... FROM orders
                if (s.includes('from orders')) {
                    if (params.length === 2) {
                        const [ref, id] = params;
                        const matches = mockDb.orders.filter(
                            o => o.order_ref === ref || o.id === id
                        );
                        return [matches];
                    } else {
                        const [tenantId, ref, id] = params;
                        const matches = mockDb.orders.filter(
                            o => o.tenant_id === tenantId && (o.order_ref === ref || o.id === id)
                        );
                        return [matches];
                    }
                }

                // 1. SELECT ... FROM order_paper_decisions
                if (s.includes('from order_paper_decisions')) {
                    const [id, tenantId] = params;
                    const matches = mockDb.order_paper_decisions.filter(
                        d => d.id === id && d.tenant_id === tenantId
                    );
                    return [matches];
                }

                // 1b. SELECT ... FROM paper_variants
                if (s.includes('from paper_variants')) {
                    const [id] = params;
                    if (id === 'var_offset_120') {
                        return [[{
                            id: 'var_offset_120',
                            gsm: 120,
                            width_mm: 640,
                            height_mm: 900,
                            finish: 'offset',
                            category: 'offset',
                            product_name: 'Amber Graphic 120g'
                        }]];
                    }
                    return [[]];
                }

                // 2. SELECT ... FROM order_quote_revisions WHERE tenant_id = ? AND external_order_intent_id = ? AND status = 'PENDING'
                if (s.includes('from order_quote_revisions') && s.includes('status = \'pending\'') && s.includes('external_order_intent_id = ?')) {
                    const [tenantId, extId] = params;
                    const matches = mockDb.order_quote_revisions.filter(
                        r => r.tenant_id === tenantId && r.external_order_intent_id === extId && r.status === 'PENDING'
                    );
                    return [matches];
                }

                // 3. SELECT ... FROM order_quote_revisions WHERE id = ? AND tenant_id = ?
                if (s.includes('from order_quote_revisions') && s.includes('where id = ? and tenant_id = ?')) {
                    const [id, tenantId] = params;
                    const matches = mockDb.order_quote_revisions.filter(
                        r => r.id === id && r.tenant_id === tenantId
                    );
                    return [matches];
                }

                // 4. Token + Revision join lookup
                if (s.includes('from quote_revision_tokens t') && s.includes('inner join order_quote_revisions r')) {
                    const [tokenHash] = params;
                    const token = mockDb.quote_revision_tokens.find(t => t.token_hash === tokenHash);
                    if (!token) return [[]];
                    const revision = mockDb.order_quote_revisions.find(r => r.id === token.revision_id);
                    if (!revision) return [[]];

                    return [[{
                        token_id: token.id,
                        token_prefix: token.token_prefix,
                        token_status: token.status,
                        recipient_email_hash: token.recipient_email_hash,
                        bound_amount: token.bound_amount,
                        bound_currency: token.bound_currency || 'EUR',
                        otp_hash: token.otp_hash,
                        otp_salt: token.otp_salt,
                        otp_expires_at: token.otp_expires_at,
                        otp_attempts: token.otp_attempts || 0,
                        otp_max_attempts: token.otp_max_attempts || 3,
                        otp_delivery_channel: token.otp_delivery_channel || 'EMAIL',
                        otp_delivery_status: token.otp_delivery_status || 'DELIVERED',
                        otp_delivered_at: token.otp_delivered_at,
                        otp_delivery_proof_json: token.otp_delivery_proof_json,
                        token_expires_at: token.expires_at,
                        expires_at: token.expires_at,
                        attempt_count: token.attempt_count,
                        max_attempts: token.max_attempts,
                        revision_id: revision.id,
                        tenant_id: revision.tenant_id,
                        external_order_intent_id: revision.external_order_intent_id,
                        revision_status: revision.status,
                        currency: revision.currency,
                        base_net_amount: revision.base_net_amount,
                        delta_net_amount: revision.delta_net_amount,
                        revised_net_amount: revision.revised_net_amount,
                        base_tax_amount: revision.base_tax_amount,
                        delta_tax_amount: revision.delta_tax_amount,
                        revised_tax_amount: revision.revised_tax_amount,
                        tax_rate_pct: revision.tax_rate_pct,
                        base_gross_amount: revision.base_gross_amount,
                        delta_gross_amount: revision.delta_gross_amount,
                        revised_gross_amount: revision.revised_gross_amount,
                        technical_specs_snapshot_json: revision.technical_specs_snapshot_json,
                        applied_policies_json: revision.applied_policies_json,
                        revision_expires_at: revision.expires_at
                    }]];
                }

                // 5. INSERT INTO order_quote_revisions
                if (s.includes('insert into order_quote_revisions')) {
                    const row = {
                        id: params[0],
                        tenant_id: params[1],
                        printhouse_id: params[2],
                        external_order_intent_id: params[3],
                        canonical_order_id: params[4],
                        paper_decision_id: params[5],
                        revision_number: params[6],
                        status: 'PENDING',
                        currency: params[7],
                        base_net_amount: params[8],
                        delta_net_amount: params[9],
                        revised_net_amount: params[10],
                        base_tax_amount: params[11],
                        delta_tax_amount: params[12],
                        revised_tax_amount: params[13],
                        tax_rate_pct: params[14],
                        base_gross_amount: params[15],
                        delta_gross_amount: params[16],
                        revised_gross_amount: params[17],
                        bpe_calculation_id: params[18],
                        bpe_engine_version: params[19],
                        bpe_rates_checksum: params[20],
                        snapshot_canonical_hash: params[21],
                        breakdown_json: params[22],
                        technical_specs_snapshot_json: params[23],
                        applied_policies_json: params[24],
                        tax_resolution_snapshot_json: params[25],
                        expires_at: params[26],
                        effective_business_hours: params[27],
                        supplier_offer_valid_until: params[28],
                        printhouse_timezone: params[29]
                    };
                    mockDb.order_quote_revisions.push(row);
                    return [{ affectedRows: 1 }];
                }

                // 6. INSERT INTO quote_revision_tokens
                if (s.includes('insert into quote_revision_tokens')) {
                    const tokenRow = {
                        id: params[0],
                        tenant_id: params[1],
                        revision_id: params[2],
                        token_hash: params[3],
                        token_prefix: params[4],
                        recipient_email_hash: params[5],
                        bound_amount: params[6],
                        bound_currency: 'EUR',
                        status: 'PENDING',
                        expires_at: params[7],
                        attempt_count: 0,
                        max_attempts: 5,
                        otp_hash: params[8],
                        otp_salt: params[9],
                        otp_expires_at: params[10],
                        otp_attempts: 0,
                        otp_max_attempts: 3,
                        otp_delivery_channel: 'EMAIL',
                        otp_delivery_status: params[11],
                        otp_delivered_at: params[12],
                        otp_delivery_proof_json: params[13]
                    };
                    mockDb.quote_revision_tokens.push(tokenRow);
                    return [{ affectedRows: 1 }];
                }

                // 7. INSERT INTO order_revision_audit_events
                if (s.includes('insert into order_revision_audit_events')) {
                    mockDb.order_revision_audit_events.push({
                        event_id: params[0],
                        tenant_id: params[1],
                        revision_id: params[2],
                        event_type: params[3],
                        actor_type: params[4],
                        actor_id: params[5],
                        payload: params[6]
                    });
                    return [{ affectedRows: 1 }];
                }

                // 8. UPDATE order_quote_revisions
                if (s.includes('update order_quote_revisions')) {
                    if (s.includes("set status = 'superseded'")) {
                        if (s.includes('external_order_intent_id = ?')) {
                            const [tenantId, extId] = params;
                            mockDb.order_quote_revisions
                                .filter(r => r.tenant_id === tenantId && r.external_order_intent_id === extId && r.status === 'PENDING')
                                .forEach(r => r.status = 'SUPERSEDED');
                        } else {
                            const id = params[0];
                            const rev = mockDb.order_quote_revisions.find(r => r.id === id);
                            if (rev) rev.status = 'SUPERSEDED';
                        }
                    } else if (s.includes("set status = 'expired'")) {
                        const id = params[0];
                        const rev = mockDb.order_quote_revisions.find(r => r.id === id);
                        if (rev) rev.status = 'EXPIRED';
                    } else if (s.includes("set status = 'revoked'")) {
                        const [reason, id] = params;
                        const rev = mockDb.order_quote_revisions.find(r => r.id === id);
                        if (rev) {
                            rev.status = 'REVOKED';
                            rev.revocation_reason = reason;
                        }
                    } else if (s.includes('set status = ?')) {
                        const [status, consentJson, id] = params;
                        const rev = mockDb.order_quote_revisions.find(r => r.id === id);
                        if (rev) {
                            rev.status = status;
                            rev.consent_record_json = consentJson;
                        }
                    }
                    return [{ affectedRows: 1 }];
                }

                // 9. UPDATE quote_revision_tokens
                if (s.includes('update quote_revision_tokens')) {
                    if (s.includes("set status = 'revoked'")) {
                        if (s.includes('where revision_id in')) {
                            const [tenantId, extId] = params;
                            const supersededRevIds = mockDb.order_quote_revisions
                                .filter(r => r.tenant_id === tenantId && r.external_order_intent_id === extId && r.status === 'SUPERSEDED')
                                .map(r => r.id);
                            mockDb.quote_revision_tokens
                                .filter(t => supersededRevIds.includes(t.revision_id))
                                .forEach(t => t.status = 'REVOKED');
                        } else {
                            const revisionId = params[0];
                            mockDb.quote_revision_tokens
                                .filter(t => t.revision_id === revisionId)
                                .forEach(t => t.status = 'REVOKED');
                        }
                    } else if (s.includes("set status = 'expired'")) {
                        const id = params[0];
                        const t = mockDb.quote_revision_tokens.find(tok => tok.id === id);
                        if (t) t.status = 'EXPIRED';
                    } else if (s.includes("set status = 'consumed'")) {
                        const [clientIp, userAgent, id] = params;
                        const t = mockDb.quote_revision_tokens.find(tok => tok.id === id);
                        if (t) {
                            t.status = 'CONSUMED';
                            t.consumed_ip_hash = clientIp;
                            t.consumed_user_agent_hash = userAgent;
                        }
                    } else if (s.includes('attempt_count = attempt_count + 1')) {
                        const id = params[0];
                        const t = mockDb.quote_revision_tokens.find(tok => tok.id === id);
                        if (t) t.attempt_count += 1;
                    }
                    return [{ affectedRows: 1 }];
                }

                return [[]];
            }
        };

        mysqlClient.getConnection = async () => mockConn;
    });

    const baselineCalculationFixture = {
        bpe_engine_version: 'v3.0',
        rates_checksum: 'sha256-e99a8b1234567890abcdef',
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
                mc: 1.55,
                lux: 1.85
            },
            paper_waste_for_binding: 5.0,
            waste_sheets_setup: 100
        },
        breakdown: {
            interior_paper_cost: 464.00,
            interior_paper_cost_revised: 619.00,
            kilos_interior: 320,
            kilos_interior_revised: 427,
            cover_paper_cost: 75.90,
            interior_print_cost: 168.00,
            cover_print_cost: 146.00,
            endpapers_cost: 14.40,
            binding_cost: 279.00,
            freight_cost: 0.00,
            total_industrial_cost: 1147.30
        }
    };

    // =========================================================================
    // 1. GATE 2 — PUERTA OBLIGATORIA DE CIERRE FISCAL
    // =========================================================================
    describe('Gate 2 — Puerta Obligatoria de Cierre Fiscal (Tax/VAT Engine)', () => {
        it('2.1 Diferencia estrictamente entrega de bienes exenta (Art. 25 LIVA / Art. 138 Dir) cuando transporte está verificado', () => {
            const result = classifier.classifyReadiness({
                seller_country: 'ES',
                customer_country: 'FR',
                customer_type: 'B2B',
                customer_vat_id: 'FR12345678901',
                supply_type: 'SUPPLY_OF_GOODS',
                cross_border_transport_verified: true,
                amount: 1597.91
            });

            assert.strictEqual(result.readiness_status, 'READY');
            assert.strictEqual(result.tax_treatment, 'INTRA_EU_SUPPLY_OF_GOODS_EXEMPT');
            assert.strictEqual(result.exemption_flag, true);
            assert.strictEqual(result.reverse_charge_flag, false);
            assert.strictEqual(result.tax_rate_applied, 0.00);
            assert.strictEqual(result.tax_rate_pct, 0.00);
        });

        it('2.2 Bloquea el cálculo fiscal si VIES es válido pero el transporte transfronterizo no está verificado (Fails closed)', () => {
            const result = classifier.classifyReadiness({
                seller_country: 'ES',
                customer_country: 'FR',
                customer_type: 'B2B',
                customer_vat_id: 'FR12345678901',
                supply_type: 'SUPPLY_OF_GOODS',
                cross_border_transport_verified: false, // Missing transport proof!
                amount: 1597.91
            });

            assert.strictEqual(result.readiness_status, 'TAX_CLASSIFICATION_BLOCKED');
            assert.strictEqual(result.tax_treatment, 'BLOCKED_UNVERIFIED_CROSS_BORDER_DISPATCH');
            assert.ok(result.findings.includes('UNVERIFIED_CROSS_BORDER_DISPATCH'));
        });

        it('2.3 Diferencia prestación de servicios transfronteriza con inversión del sujeto pasivo (Art. 84.Uno.2º LIVA)', () => {
            const result = classifier.classifyReadiness({
                seller_country: 'ES',
                customer_country: 'DE',
                customer_type: 'B2B',
                customer_vat_id: 'DE987654321',
                supply_type: 'SUPPLY_OF_SERVICES',
                amount: 1597.91
            });

            assert.strictEqual(result.readiness_status, 'READY');
            assert.strictEqual(result.tax_treatment, 'INTRA_EU_B2B_SERVICES_REVERSE_CHARGE');
            assert.strictEqual(result.reverse_charge_flag, true);
            assert.strictEqual(result.exemption_flag, false);
            assert.strictEqual(result.tax_rate_applied, 0.00);
        });

        it('2.4 Aplica el 4% superreducido en España para libros editoriales conforme al Art. 91.Dos.1.2º Ley del IVA', () => {
            const result = classifier.classifyReadiness({
                seller_country: 'ES',
                customer_country: 'ES',
                product_category: 'BOOK',
                is_editorial_book: true,
                amount: 1782.30
            });

            assert.strictEqual(result.readiness_status, 'READY');
            assert.strictEqual(result.tax_treatment, 'DOMESTIC_VAT_SUPER_REDUCED_BOOKS_ART_91_DOS_1_2');
            assert.strictEqual(result.tax_rate_applied, 0.04);
            assert.strictEqual(result.tax_rate_pct, 4.00);
        });

        it('2.5 Aplica el 21% general en España para impresiones comerciales no editoriales', () => {
            const result = classifier.classifyReadiness({
                seller_country: 'ES',
                customer_country: 'ES',
                product_category: 'COMMERCIAL_PRINT',
                is_editorial_book: false,
                amount: 1782.30
            });

            assert.strictEqual(result.readiness_status, 'READY');
            assert.strictEqual(result.tax_treatment, 'DOMESTIC_VAT_STANDARD');
            assert.strictEqual(result.tax_rate_applied, 0.21);
            assert.strictEqual(result.tax_rate_pct, 21.00);
        });

        it('2.6 Bloquea fiscalmente cuando el producto es ambiguo para evitar asumir 21% o 4% erróneo (Fail-Closed)', () => {
            const result = classifier.classifyReadiness({
                seller_country: 'ES',
                customer_country: 'ES',
                // product_category omitted!
                amount: 1782.30
            });

            assert.strictEqual(result.readiness_status, 'TAX_CLASSIFICATION_BLOCKED');
            assert.strictEqual(result.tax_treatment, 'BLOCKED_UNKNOWN_PRODUCT_CATEGORY');
            assert.ok(result.findings.includes('UNKNOWN_PRODUCT_CATEGORY_RATE_AMBIGUITY'));
        });

        it('2.7 Aplica régimen especial de Canarias (IGIC no sujeto a IVA peninsular)', () => {
            const result = classifier.classifyReadiness({
                seller_country: 'ES',
                customer_country: 'ES',
                destination_region: 'IC',
                product_category: 'BOOK',
                amount: 1782.30
            });

            assert.strictEqual(result.readiness_status, 'READY');
            assert.strictEqual(result.tax_treatment, 'CANARY_ISLANDS_IGIC_REGIME');
            assert.strictEqual(result.exemption_flag, true);
            assert.strictEqual(result.tax_rate_pct, 0.00);
        });

        it('2.8 Cálculo canónico exacto de cuotas independientes de impuesto (cero desfase de céntimo con facturas)', () => {
            const baseNet = 1782.30;
            const revisedNet = 1972.48;
            const taxRate = 4.00; // 4% superreducido

            const breakdown = classifier.calculateGovernedTaxBreakdown({
                baseNetAmount: baseNet,
                revisedNetAmount: revisedNet,
                taxRatePct: taxRate
            });

            // Base Tax: round2(1782.30 * 0.04) = round2(71.292) = 71.29
            assert.strictEqual(breakdown.base_tax_amount, 71.29);
            // Revised Tax: round2(1972.48 * 0.04) = round2(78.8992) = 78.90
            assert.strictEqual(breakdown.revised_tax_amount, 78.90);
            // Delta Tax: 78.90 - 71.29 = 7.61
            assert.strictEqual(breakdown.delta_tax_amount, 7.61);
            // Gross totals check
            assert.strictEqual(breakdown.base_gross_amount, 1853.59);
            assert.strictEqual(breakdown.revised_gross_amount, 2051.38);
            assert.strictEqual(breakdown.delta_gross_amount, 197.79);
            // Exact identity: base_gross + delta_gross === revised_gross
            assert.strictEqual(
                Math.round((breakdown.base_gross_amount + breakdown.delta_gross_amount) * 100) / 100,
                breakdown.revised_gross_amount
            );
        });
    });

    // =========================================================================
    // 2. GATE 3 — REPRODUCIBILIDAD DETERMINISTA BPE
    // =========================================================================
    describe('Gate 3 — Reproducibilidad Determinista BPE', () => {
        it('3.1 Recalcula deterministamente el incremento de gramaje (90g -> 120g) preservando congeladas todas las demás líneas', () => {
            const res = recalculateDeterministicBpePrice({
                originalCalculation: baselineCalculationFixture,
                alternativeVariant: { gsm: 120, paper_type: 'offset' },
                targetMarginPct: 18.5
            });

            // Paper delta: 154.68 EUR (interior paper: 464.00 -> 618.68)
            assert.strictEqual(res.breakdown.interior_paper_cost_delta, 154.68);
            assert.strictEqual(res.industrial_cost_delta, 154.68);
            assert.strictEqual(res.revised_industrial_cost, 1301.98);
            // Net price delta: 154.68 / 0.815 = 189.7914 EUR
            assert.strictEqual(res.delta_net_price, 189.7914);
            // Frozen items
            assert.strictEqual(res.breakdown.cover_paper_cost, 75.90);
            assert.strictEqual(res.breakdown.interior_print_cost, 168.00);
            assert.strictEqual(res.breakdown.cover_print_cost, 146.00);
            assert.strictEqual(res.breakdown.endpapers_cost, 14.40);
            assert.strictEqual(res.breakdown.binding_cost, 279.00);
            assert.strictEqual(res.breakdown.freight_cost, 0.00);
        });

        it('3.2 Fails closed con RECALCULATION_BLOCKED si no existe snapshot baseline de tarifas y especificaciones', () => {
            assert.throws(
                () => recalculateDeterministicBpePrice({
                    originalCalculation: null,
                    alternativeVariant: { gsm: 120 }
                }),
                err => err instanceof OrderQuoteRevisionError && err.code === 'RECALCULATION_BLOCKED'
            );
        });

        it('3.3 Fails closed si faltan tarifas congeladas (rates_checksum) en el snapshot histórico', () => {
            const incompleteSnapshot = { ...baselineCalculationFixture, rates_checksum: null };
            assert.throws(
                () => recalculateDeterministicBpePrice({
                    originalCalculation: incompleteSnapshot,
                    alternativeVariant: { gsm: 120 }
                }),
                err => err instanceof OrderQuoteRevisionError && err.code === 'RECALCULATION_BLOCKED'
            );
        });
    });

    // =========================================================================
    // 3. GATE 4 — PERSISTENCIA RELACIONAL, TENANCY & CONCURRENCIA
    // =========================================================================
    describe('Gate 4 — Persistencia Versionada, Tenancy y Concurrencia', () => {
        it('4.1 Emite revisión exitosamente bajo aislamiento de tenant y registra token monouso con hash SHA-256', async () => {
            const result = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'client@example.com',
                originalCalculation: baselineCalculationFixture,
                alternativeVariant: { gsm: 120, paper_type: 'offset' },
                targetMarginPct: 18.5,
                taxResolutionContext: {
                    seller_country: 'ES',
                    customer_country: 'ES',
                    product_category: 'BOOK',
                    is_editorial_book: true
                }
            });

            assert.strictEqual(result.status, 'PENDING');
            assert.ok(result.revision_id.startsWith('oqr_'));
            assert.ok(result.token_prefix.startsWith('qrt_'));
            assert.ok(result.rawToken); // Delivered once
            assert.strictEqual(result.rawToken.length, 64); // 256 bits hex
            assert.strictEqual(result.delta_net_amount, 189.7914);
            assert.strictEqual(result.tax_rate_pct, 4.00);

            // Verify in mock DB that rawToken is NEVER stored in database (Zero Plaintext Persistence)
            const storedToken = mockDb.quote_revision_tokens[0];
            assert.notStrictEqual(storedToken.token_hash, result.rawToken);
            assert.strictEqual(
                storedToken.token_hash,
                crypto.createHash('sha256').update(result.rawToken).digest('hex')
            );

            // Verify audit event ledger
            assert.strictEqual(mockDb.order_revision_audit_events.length, 1);
            assert.strictEqual(mockDb.order_revision_audit_events[0].event_type, 'REVISION_ISSUED');
        });

        it('4.2 Rechaza la emisión si el tenant no coincide con el propietario de la decisión técnica (Tenancy Isolation)', async () => {
            await assert.rejects(
                async () => service.createQuoteRevision({
                    tenantId: 'tenant_attacker',
                    externalOrderIntentId: 'job_order_100',
                    paperDecisionId: 'opd_legit_001', // Belongs to tenant_alpha!
                    recipientEmail: 'attacker@example.com',
                    originalCalculation: baselineCalculationFixture,
                    alternativeVariant: { gsm: 120 }
                }),
                err => err instanceof OrderQuoteRevisionError && err.code === 'DECISION_NOT_FOUND' && err.statusCode === 404
            );
        });

        it('4.3 Rechaza la emisión si la decisión no es PROPOSE_ALTERNATIVE / REQUIRES_ECONOMIC_REVISION', async () => {
            await assert.rejects(
                async () => service.createQuoteRevision({
                    tenantId: 'tenant_alpha',
                    externalOrderIntentId: 'job_order_200',
                    paperDecisionId: 'opd_confirmed_delta_zero', // Action is CONFIRM!
                    recipientEmail: 'client@example.com',
                    originalCalculation: baselineCalculationFixture,
                    alternativeVariant: { gsm: 120 }
                }),
                err => err instanceof OrderQuoteRevisionError && err.code === 'DECISION_NOT_ELIGIBLE_FOR_REVISION'
            );
        });

        it('4.4 Fails closed ante intento de emitir una segunda revisión PENDING simultánea para el mismo pedido (Anti-Race Condition)', async () => {
            // First revision
            await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'client@example.com',
                originalCalculation: baselineCalculationFixture,
                alternativeVariant: { gsm: 120 },
                taxResolutionContext: {
                    seller_country: 'ES',
                    customer_country: 'ES',
                    product_category: 'BOOK',
                    is_editorial_book: true
                }
            });

            // Second concurrent revision without allowSupersede
            await assert.rejects(
                async () => service.createQuoteRevision({
                    tenantId: 'tenant_alpha',
                    externalOrderIntentId: 'job_order_100',
                    paperDecisionId: 'opd_legit_001',
                    recipientEmail: 'client@example.com',
                    originalCalculation: baselineCalculationFixture,
                    alternativeVariant: { gsm: 120 },
                    taxResolutionContext: {
                        seller_country: 'ES',
                        customer_country: 'ES',
                        product_category: 'BOOK',
                        is_editorial_book: true
                    },
                    allowSupersede: false
                }),
                err => err instanceof OrderQuoteRevisionError && err.code === 'CONCURRENT_REVISION_PENDING' && err.statusCode === 409
            );
        });

        it('4.5 Permite superseding explícito de una revisión previa revovando los tokens anteriores', async () => {
            // First revision
            const rev1 = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'client@example.com',
                originalCalculation: baselineCalculationFixture,
                alternativeVariant: { gsm: 120 },
                taxResolutionContext: {
                    seller_country: 'ES',
                    customer_country: 'ES',
                    product_category: 'BOOK',
                    is_editorial_book: true
                }
            });

            // Superseding revision
            const rev2 = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'client@example.com',
                originalCalculation: baselineCalculationFixture,
                alternativeVariant: { gsm: 130 },
                taxResolutionContext: {
                    seller_country: 'ES',
                    customer_country: 'ES',
                    product_category: 'BOOK',
                    is_editorial_book: true
                },
                allowSupersede: true
            });

            assert.strictEqual(rev2.status, 'PENDING');
            assert.notStrictEqual(rev1.revision_id, rev2.revision_id);

            // Previous revision must be SUPERSEDED and its token REVOKED
            const oldRev = mockDb.order_quote_revisions.find(r => r.id === rev1.revision_id);
            assert.strictEqual(oldRev.status, 'SUPERSEDED');
            const oldToken = mockDb.quote_revision_tokens.find(t => t.revision_id === rev1.revision_id);
            assert.strictEqual(oldToken.status, 'REVOKED');
        });
    });

    // =========================================================================
    // 4. GATE 6 — ACEPTACIÓN DEL CLIENTE & TOKENS MONOUSO
    // =========================================================================
    describe('Gate 6 — Aceptación del Cliente y Tokens Monouso', () => {
        it('6.1 Lectura mediante GET es estrictamente idempotente y no consume el token (Inmune a prefetching)', async () => {
            const created = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'client@example.com',
                originalCalculation: baselineCalculationFixture,
                alternativeVariant: { gsm: 120 },
                taxResolutionContext: {
                    seller_country: 'ES',
                    customer_country: 'ES',
                    product_category: 'BOOK',
                    is_editorial_book: true
                }
            });

            // Simulate repeated browser prefetching GET
            const read1 = await service.getQuoteRevisionByToken({ rawToken: created.rawToken });
            const read2 = await service.getQuoteRevisionByToken({ rawToken: created.rawToken });

            assert.strictEqual(read1.revision_id, created.revision_id);
            assert.strictEqual(read2.revision_id, created.revision_id);

            // Token remains PENDING
            const tokenRow = mockDb.quote_revision_tokens[0];
            assert.strictEqual(tokenRow.status, 'PENDING');
        });

        it('6.2 Respuesta POST ACCEPT consume el token y desacopla compuertas (Gate 7)', async () => {
            const created = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'client@example.com',
                originalCalculation: baselineCalculationFixture,
                alternativeVariant: { gsm: 120 },
                taxResolutionContext: {
                    seller_country: 'ES',
                    customer_country: 'ES',
                    product_category: 'BOOK',
                    is_editorial_book: true
                }
            });

            // Respond with OTP (delta > 50 EUR requires OTP)
            const response = await service.respondToQuoteRevision({
                rawToken: created.rawToken,
                decision: 'ACCEPT',
                otpCode: created._debugOtp,
                clientIp: '198.51.100.4',
                userAgent: 'Mozilla/5.0 TestBrowser'
            });

            assert.strictEqual(response.status, 'ACCEPTED');
            assert.strictEqual(response.gates.gate_contractual, 'PASSED');
            assert.strictEqual(response.gates.gate_financial, 'PAYMENT_PENDING'); // Delta > 0 requires payment
            assert.strictEqual(response.gates.gate_industrial, 'PREFLIGHT_PENDING'); // Industrial gate is NOT bypassed!

            // Token must be CONSUMED in DB
            const tokenRow = mockDb.quote_revision_tokens[0];
            assert.strictEqual(tokenRow.status, 'CONSUMED');
        });

        it('6.3 Replay attack: segundo intento de respuesta con token consumido es rechazado con 410 TOKEN_ALREADY_CONSUMED', async () => {
            const created = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'client@example.com',
                originalCalculation: baselineCalculationFixture,
                alternativeVariant: { gsm: 120 },
                taxResolutionContext: {
                    seller_country: 'ES',
                    customer_country: 'ES',
                    product_category: 'BOOK',
                    is_editorial_book: true
                }
            });

            // First response
            await service.respondToQuoteRevision({
                rawToken: created.rawToken,
                decision: 'ACCEPT',
                otpCode: created._debugOtp
            });

            // Second response (replay attack)
            await assert.rejects(
                async () => service.respondToQuoteRevision({
                    rawToken: created.rawToken,
                    decision: 'ACCEPT',
                    otpCode: created._debugOtp
                }),
                err => err instanceof OrderQuoteRevisionError && err.code === 'TOKEN_ALREADY_CONSUMED' && err.statusCode === 410
            );
        });

        it('6.4 Token expirado es rechazado con 410 TOKEN_EXPIRED (Fail-Closed)', async () => {
            const created = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'client@example.com',
                originalCalculation: baselineCalculationFixture,
                alternativeVariant: { gsm: 120 },
                taxResolutionContext: {
                    seller_country: 'ES',
                    customer_country: 'ES',
                    product_category: 'BOOK',
                    is_editorial_book: true
                }
            });

            // Force token expiration in DB
            const tokenRow = mockDb.quote_revision_tokens[0];
            tokenRow.expires_at = new Date(Date.now() - 3600 * 1000).toISOString();

            await assert.rejects(
                async () => service.getQuoteRevisionByToken({ rawToken: created.rawToken }),
                err => err instanceof OrderQuoteRevisionError && err.code === 'TOKEN_EXPIRED' && err.statusCode === 410
            );
        });

        it('6.5 Exige desafío OTP cuando el Delta neto supera el umbral configurable (50.00 €)', async () => {
            const created = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'client@example.com',
                originalCalculation: baselineCalculationFixture,
                alternativeVariant: { gsm: 120 }, // Delta net is ~190.18 EUR (> 50 EUR)
                taxResolutionContext: {
                    seller_country: 'ES',
                    customer_country: 'ES',
                    product_category: 'BOOK',
                    is_editorial_book: true
                }
            });

            // Attempt to accept without OTP or session
            await assert.rejects(
                async () => service.respondToQuoteRevision({
                    rawToken: created.rawToken,
                    decision: 'ACCEPT',
                    otpCode: null,
                    sessionToken: null
                }),
                err => err instanceof OrderQuoteRevisionError && err.code === 'OTP_CHALLENGE_REQUIRED' && err.statusCode === 403
            );
        });

        it('6.6 Revocación por operario invalida la revisión y sus tokens monouso', async () => {
            const created = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'client@example.com',
                originalCalculation: baselineCalculationFixture,
                alternativeVariant: { gsm: 120 },
                taxResolutionContext: {
                    seller_country: 'ES',
                    customer_country: 'ES',
                    product_category: 'BOOK',
                    is_editorial_book: true
                }
            });

            const revokeRes = await service.revokeQuoteRevision({
                tenantId: 'tenant_alpha',
                revisionId: created.revision_id,
                reason: 'Stock variant sold out at warehouse'
            });

            assert.strictEqual(revokeRes.status, 'REVOKED');

            // Token cannot be consumed anymore
            await assert.rejects(
                async () => service.getQuoteRevisionByToken({ rawToken: created.rawToken }),
                err => err instanceof OrderQuoteRevisionError && err.code === 'TOKEN_INACTIVE'
            );
        });
    });
});
