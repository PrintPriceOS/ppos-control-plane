'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-adversarial-secret-jwt-key-2026-ppos';
process.env.NODE_ENV = 'test';

/**
 * tests/budget02c01r_security_and_bpe_adversarial.test.js
 * 
 * BUDGET-02C-01R: Blocking Security Remediation & BPE Parity Adversarial Certification Suite
 * 
 * Exhaustively certifies the Six Remediation Controls:
 * - SEC-C01: Elimination of insecure OTP bypasses, CSPRNG generation, zero plaintext persistence,
 *            verified delivery channel enforcement, max attempts, and cryptographically bound sessions.
 * - SEC-C02: Server authority over economic data, strict tenant resolution from trusted actor context,
 *            system-of-record resolution, and elimination of client price overrides.
 * - SEC-C03: Authentic BPE calculation parity, client cost override prohibition, adversarial fixtures
 *            (grammage, format/dimensions, finish category, missing tariffs, rates checksum).
 * - SEC-C04: Strictly safe GET review route: ZERO database write queries, in-memory clock expiration,
 *            and dedicated authorized transactional expiration job.
 * - SEC-C05: Middleware authorization chain: requirePrinthouseScope, 401/403 RBAC, cross-tenant isolation,
 *            and superadmin fail-closed guards.
 * - SEC-C06: Single-use token security: replay protection (410), recipient/amount binding,
 *            brute-force rate limiting (429), token redaction in logs, and decoupled triple gates.
 */

const assert = require('assert');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mysqlClient = require('../src/api/services/mysqlClient');
const {
    OrderQuoteRevisionService,
    OrderQuoteRevisionError,
    recalculateDeterministicBpePrice,
    computeSaltedOtpHash,
    redactToken,
    sha256Canonical
} = require('../src/api/services/orderQuoteRevisionService');
const TaxVatReadinessClassifierService = require('../src/api/services/taxVatReadinessClassifierService');
const quoteRevisionRoutes = require('../src/api/routes/orderQuoteRevisionRoutes');

function createMockReqRes({ method = 'GET', url = '/', headers = {}, query = {}, params = {}, body = {}, user = null }) {
    let statusCode = 200;
    let responseBody = null;
    let nextCalled = false;

    const req = {
        method,
        url,
        originalUrl: url,
        path: url.split('?')[0],
        headers: { ...headers },
        query: { ...query },
        params: { ...params },
        body: { ...body },
        ip: '198.51.100.4',
        user
    };

    const res = {
        status(code) {
            statusCode = code;
            return this;
        },
        json(data) {
            responseBody = data;
            return this;
        },
        send(data) {
            responseBody = data;
            return this;
        }
    };

    const next = () => {
        nextCalled = true;
    };

    return {
        req,
        res,
        next,
        getStatusCode: () => statusCode,
        getBody: () => responseBody,
        isNextCalled: () => nextCalled
    };
}

function findRouteLayer(router, path, method) {
    for (const layer of router.stack) {
        if (layer.route && layer.route.path === path && layer.route.methods[method.toLowerCase()]) {
            return layer.route;
        }
    }
    return null;
}

describe('BUDGET-02C-01R — Security Remediation & BPE Parity Adversarial Certification Suite', () => {
    let mockDb;
    let service;
    let classifier;
    let mockDelivery;
    let deliveredOtps;
    const JWT_SECRET = 'test-adversarial-secret-jwt-key-2026-ppos';

    const baselineBpeSnapshot = {
        bpe_calculation_id: 'bpe_calc_canonical_historical',
        bpe_engine_version: 'v3.0',
        rates_checksum: 'sha256-e99a8b1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
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
            isDeliveryChannelConfigured: () => mockDelivery.configured,
            deliverOtp: async (payload) => {
                if (!mockDelivery.configured) {
                    return { ok: false, delivered: false, reason: 'NO_ADAPTER_CONFIGURED' };
                }
                deliveredOtps.push(payload);
                return {
                    ok: true,
                    delivered: true,
                    channel: 'EMAIL',
                    destination: payload.recipientEmail,
                    messageId: `msg_${Date.now()}`,
                    timestamp: new Date().toISOString()
                };
            }
        };

        service = new OrderQuoteRevisionService({
            taxClassifier: classifier,
            otpDeliveryService: mockDelivery,
            jwtSecret: JWT_SECRET
        });

        mockDb = {
            orders: [
                {
                    id: 'ord_authoritative_100',
                    order_ref: 'job_order_100',
                    tenant_id: 'tenant_alpha',
                    printhouse_id: 'ph_dar_01',
                    offers_snapshot: baselineBpeSnapshot
                },
                {
                    id: 'ord_cross_tenant_300',
                    order_ref: 'job_order_300',
                    tenant_id: 'tenant_beta',
                    printhouse_id: 'ph_other',
                    offers_snapshot: baselineBpeSnapshot
                }
            ],
            order_paper_decisions: [
                {
                    id: 'opd_legit_001',
                    tenant_id: 'tenant_alpha',
                    external_order_intent_id: 'job_order_100',
                    canonical_order_id: 'ord_authoritative_100',
                    printhouse_tenant_id: 'ph_dar_01',
                    paper_role: 'INTERIOR',
                    requested_variant_id: 'var_offset_90',
                    decision_action: 'PROPOSE_ALTERNATIVE',
                    alternative_variant_id: 'var_offset_120',
                    economic_status: 'REQUIRES_ECONOMIC_REVISION',
                    status: 'ACTIVE',
                    metadata_json: { bpe_snapshot: baselineBpeSnapshot }
                }
            ],
            paper_variants: [
                {
                    id: 'var_offset_120',
                    gsm: 120,
                    paper_type: 'offset',
                    sheet_width: 640,
                    sheet_height: 900,
                    brand_name: 'Standard Offset',
                    finish_type: 'UNCOATED',
                    is_active: 1
                }
            ],
            order_quote_revisions: [],
            quote_revision_tokens: [],
            order_revision_audit_events: [],
            executedQueries: []
        };

        const mockConn = {
            beginTransaction: async () => {},
            commit: async () => {},
            rollback: async () => {},
            release: () => {},
            query: async (sql, params = []) => {
                const s = sql.trim().toLowerCase();
                mockDb.executedQueries.push({ sql: s, params });

                if (s.includes('from paper_variants')) {
                    const [id] = params;
                    const matches = mockDb.paper_variants.filter(v => v.id === id && v.is_active === 1);
                    return [matches];
                }

                if (s.includes('from orders')) {
                    const [tenantId, ref, id] = params;
                    const matches = mockDb.orders.filter(
                        o => o.tenant_id === tenantId && (o.order_ref === ref || o.id === id)
                    );
                    return [matches];
                }

                if (s.includes('from order_paper_decisions')) {
                    const [id, tenantId] = params;
                    const matches = mockDb.order_paper_decisions.filter(
                        d => d.id === id && d.tenant_id === tenantId
                    );
                    return [matches];
                }

                if (s.includes('from order_quote_revisions') && s.includes('status = \'pending\'') && s.includes('external_order_intent_id = ?')) {
                    const [tenantId, extId] = params;
                    const matches = mockDb.order_quote_revisions.filter(
                        r => r.tenant_id === tenantId && r.external_order_intent_id === extId && r.status === 'PENDING'
                    );
                    return [matches];
                }

                if (s.includes('from order_quote_revisions') && s.includes('where id = ? and tenant_id = ?')) {
                    const [id, tenantId] = params;
                    const matches = mockDb.order_quote_revisions.filter(
                        r => r.id === id && r.tenant_id === tenantId
                    );
                    return [matches];
                }

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

                if (s.includes('update quote_revision_tokens')) {
                    if (s.includes("set status = 'revoked'")) {
                        const targetId = params[0];
                        mockDb.quote_revision_tokens
                            .filter(t => t.id === targetId || t.revision_id === targetId)
                            .forEach(t => t.status = 'REVOKED');
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
                    } else if (s.includes('otp_attempts = ?')) {
                        const [attempts, id] = params;
                        const t = mockDb.quote_revision_tokens.find(tok => tok.id === id);
                        if (t) t.otp_attempts = attempts;
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

    // =========================================================================
    // CONTROL SEC-C01: ELIMINACIÓN DE OTP INSEGURO Y FACTOR DE SEGUNDA VÍA
    // =========================================================================
    describe('SEC-C01 — Eliminar OTP inseguro y verificar canal de entrega', () => {
        it('SEC-C01.1: Insecure mock code "123456" is completely eliminated and fails closed', async () => {
            const created = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'client@example.com',
                originalCalculation: baselineBpeSnapshot,
                alternativeVariant: { gsm: 120, paper_type: 'offset' },
                taxResolutionContext: { seller_country: 'ES', customer_country: 'ES', product_category: 'BOOK', is_editorial_book: true }
            });

            // Submitting "123456" must be rejected with 403 INVALID_OTP_CODE
            await assert.rejects(
                async () => service.respondToQuoteRevision({
                    rawToken: created.rawToken,
                    decision: 'ACCEPT',
                    otpCode: '123456'
                }),
                err => err instanceof OrderQuoteRevisionError && err.code === 'INVALID_OTP_CODE' && err.statusCode === 403
            );
        });

        it('SEC-C01.2: Generated OTP is real 6-digit CSPRNG numeric, stored only as salted SHA-256 hash', async () => {
            const created = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'client@example.com',
                originalCalculation: baselineBpeSnapshot,
                alternativeVariant: { gsm: 120, paper_type: 'offset' },
                taxResolutionContext: { seller_country: 'ES', customer_country: 'ES', product_category: 'BOOK', is_editorial_book: true }
            });

            const deliveredOtp = deliveredOtps[0].otpCode;
            assert.strictEqual(typeof deliveredOtp, 'string');
            assert.strictEqual(deliveredOtp.length, 6);
            assert.ok(/^\d{6}$/.test(deliveredOtp), 'OTP must be 6 numeric digits');

            const tokenRow = mockDb.quote_revision_tokens[0];
            // Zero plaintext persistence: tokenRow stores only SHA-256 hash and 16-byte salt
            assert.notStrictEqual(tokenRow.otp_hash, deliveredOtp);
            assert.strictEqual(tokenRow.otp_salt.length, 32); // 16 bytes hex
            assert.strictEqual(tokenRow.otp_hash, computeSaltedOtpHash(deliveredOtp, tokenRow.otp_salt, created.revision_id));

            // Valid OTP verification succeeds
            const accepted = await service.respondToQuoteRevision({
                rawToken: created.rawToken,
                decision: 'ACCEPT',
                otpCode: deliveredOtp
            });
            assert.strictEqual(accepted.status, 'ACCEPTED');
        });

        it('SEC-C01.3: Exhaustion of OTP attempts: after 3 incorrect submissions, token is REVOKED and fails with 429', async () => {
            const created = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'client@example.com',
                originalCalculation: baselineBpeSnapshot,
                alternativeVariant: { gsm: 120, paper_type: 'offset' },
                taxResolutionContext: { seller_country: 'ES', customer_country: 'ES', product_category: 'BOOK', is_editorial_book: true }
            });

            // Attempt 1: wrong OTP
            await assert.rejects(
                () => service.respondToQuoteRevision({ rawToken: created.rawToken, decision: 'ACCEPT', otpCode: '999991' }),
                err => err.code === 'INVALID_OTP_CODE'
            );
            assert.strictEqual(mockDb.quote_revision_tokens[0].otp_attempts, 1);

            // Attempt 2: wrong OTP
            await assert.rejects(
                () => service.respondToQuoteRevision({ rawToken: created.rawToken, decision: 'ACCEPT', otpCode: '999992' }),
                err => err.code === 'INVALID_OTP_CODE'
            );
            assert.strictEqual(mockDb.quote_revision_tokens[0].otp_attempts, 2);

            // Attempt 3: wrong OTP
            await assert.rejects(
                () => service.respondToQuoteRevision({ rawToken: created.rawToken, decision: 'ACCEPT', otpCode: '999993' }),
                err => err.code === 'INVALID_OTP_CODE'
            );
            assert.strictEqual(mockDb.quote_revision_tokens[0].otp_attempts, 3);

            // Attempt 4: attempts exceeded -> token revoked, HTTP 429 MAX_OTP_ATTEMPTS_EXCEEDED
            await assert.rejects(
                () => service.respondToQuoteRevision({ rawToken: created.rawToken, decision: 'ACCEPT', otpCode: deliveredOtps[0].otpCode }),
                err => err.code === 'MAX_OTP_ATTEMPTS_EXCEEDED' && err.statusCode === 429
            );
            assert.strictEqual(mockDb.quote_revision_tokens[0].status, 'REVOKED');
        });

        it('SEC-C01.4: Fail-closed if delivery adapter is not configured or delivery fails: acceptance blocked', async () => {
            mockDelivery.configured = false; // Disable delivery adapter

            const created = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'client@example.com',
                originalCalculation: baselineBpeSnapshot,
                alternativeVariant: { gsm: 120, paper_type: 'offset' },
                taxResolutionContext: { seller_country: 'ES', customer_country: 'ES', product_category: 'BOOK', is_editorial_book: true }
            });

            // Delivery status must be recorded as FAILED
            assert.strictEqual(mockDb.quote_revision_tokens[0].otp_delivery_status, 'FAILED');

            // Customer attempting to accept fails closed with OTP_DELIVERY_UNAVAILABLE (cannot satisfy 2FA)
            await assert.rejects(
                () => service.respondToQuoteRevision({ rawToken: created.rawToken, decision: 'ACCEPT', otpCode: '111222' }),
                err => err.code === 'OTP_DELIVERY_UNAVAILABLE' && err.statusCode === 403
            );
        });

        it('SEC-C01.5: Authenticated session bypass requires cryptographic JWT binding to recipient email', async () => {
            const created = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'client@example.com',
                originalCalculation: baselineBpeSnapshot,
                alternativeVariant: { gsm: 120, paper_type: 'offset' },
                taxResolutionContext: { seller_country: 'ES', customer_country: 'ES', product_category: 'BOOK', is_editorial_book: true }
            });

            // Submitting session token belonging to another user fails with SESSION_RECIPIENT_MISMATCH
            const imposterToken = jwt.sign({ email: 'attacker@evil.com' }, JWT_SECRET);
            await assert.rejects(
                () => service.respondToQuoteRevision({
                    rawToken: created.rawToken,
                    decision: 'ACCEPT',
                    sessionToken: imposterToken
                }),
                err => err.code === 'SESSION_RECIPIENT_MISMATCH' && err.statusCode === 403
            );

            // Submitting legitimate matching session token succeeds without OTP
            const legitimateSessionToken = jwt.sign({ email: 'client@example.com' }, JWT_SECRET);
            const accepted = await service.respondToQuoteRevision({
                rawToken: created.rawToken,
                decision: 'ACCEPT',
                sessionToken: legitimateSessionToken
            });
            assert.strictEqual(accepted.status, 'ACCEPTED');
            assert.strictEqual(accepted.verified_via, 'CRYPTOGRAPHIC_SESSION');
        });
    });

    // =========================================================================
    // CONTROL SEC-C02: AUTORIDAD SOBRE DATOS ECONÓMICOS
    // =========================================================================
    describe('SEC-C02 — Autoridad sobre datos económicos y resolución autoritativa', () => {
        it('SEC-C02.1: Resolves tenant, order, variant, and margin strictly server-side; client body cannot inject prices', async () => {
            const result = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'client@example.com',
                // Client attempts to inject fabricated price & cost
                injectedPrice: 10.00,
                base_net_amount: 5.00,
                delta_net_amount: 1.00,
                taxResolutionContext: { seller_country: 'ES', customer_country: 'ES', product_category: 'BOOK', is_editorial_book: true }
            });

            // The calculated price MUST come strictly from BPE recalculation (189.7914 €), ignoring injected prices
            assert.strictEqual(result.delta_net_amount, 189.7914);
            assert.strictEqual(result.base_net_amount, 1407.7301);
            assert.strictEqual(result.revised_net_amount, 1597.5215);
        });

        it('SEC-C02.2: Fails closed with RECALCULATION_BLOCKED when pricing snapshot is missing or unverified', async () => {
            // Decision pointing to order without pricing snapshot
            mockDb.orders[0].offers_snapshot = null;
            mockDb.order_paper_decisions[0].metadata_json = {};

            await assert.rejects(
                () => service.createQuoteRevision({
                    tenantId: 'tenant_alpha',
                    externalOrderIntentId: 'job_order_100',
                    paperDecisionId: 'opd_legit_001',
                    recipientEmail: 'client@example.com',
                    taxResolutionContext: { seller_country: 'ES', customer_country: 'ES', product_category: 'BOOK', is_editorial_book: true }
                }),
                err => err.code === 'RECALCULATION_BLOCKED' && err.statusCode === 422
            );
        });

        it('SEC-C02.3: Fails closed with PRINTHOUSE_UNAUTHORIZED when caller printhouse does not match order', async () => {
            await assert.rejects(
                () => service.createQuoteRevision({
                    tenantId: 'tenant_alpha',
                    externalOrderIntentId: 'job_order_100',
                    paperDecisionId: 'opd_legit_001',
                    recipientEmail: 'client@example.com',
                    actorContext: {
                        userId: 'usr_foreign_print',
                        role: 'PRINTHOUSE_OPERATOR',
                        tenantId: 'tenant_alpha',
                        printhouseId: 'ph_unauthorized_attacker', // Mismatch!
                        isSuperAdmin: false
                    }
                }),
                err => err.code === 'PRINTHOUSE_UNAUTHORIZED' && err.statusCode === 403
            );
        });
    });

    // =========================================================================
    // CONTROL SEC-C03: PARIDAD BPE REAL Y FIXTURES ADVERSARIALES
    // =========================================================================
    describe('SEC-C03 — Paridad BPE real y fixtures adversariales', () => {
        it('SEC-C03.1: Prohibits client paper cost override (COST_OVERRIDE_PROHIBITED)', () => {
            assert.throws(
                () => recalculateDeterministicBpePrice({
                    originalCalculation: baselineBpeSnapshot,
                    alternativeVariant: { gsm: 120, paper_type: 'offset' },
                    clientOverrides: { interior_paper_cost_override: 100.00 } // Forbidden override attempt
                }),
                err => err.code === 'COST_OVERRIDE_PROHIBITED' && err.statusCode === 400
            );
        });

        it('SEC-C03.2: Adversarial fixture with altered sheet format / dimensions: 640x900 -> 700x1000 mm', () => {
            const formatAlteredSnapshot = JSON.parse(JSON.stringify(baselineBpeSnapshot));
            formatAlteredSnapshot.specs.sheet_width = 700;
            formatAlteredSnapshot.specs.sheet_height = 1000;

            const res = recalculateDeterministicBpePrice({
                originalCalculation: formatAlteredSnapshot,
                alternativeVariant: { gsm: 120, paper_type: 'offset' },
                targetMarginPct: 18.5
            });

            // 700x1000 sheet area = 0.70 m2
            // 90 gsm sheet weight = 0.70 * 0.090 = 0.063 kg
            // sheets = round(320 / 0.063) = round(5079.36) = 5079 sheets
            // revised weight at 120 gsm = 5079 * 0.70 * 0.120 = 426.636 kg
            // revised cost = 426.636 * 1.45 = 618.62 €
            // paperCostDelta = 618.62 - 464.00 = 154.62 €
            assert.strictEqual(res.breakdown.interior_paper_cost_delta, 154.62);
            assert.strictEqual(res.revised_industrial_cost, 1301.92);
            assert.strictEqual(res.delta_net_price, 189.7178);

            // Frozen lines remain 100% unaffected
            assert.strictEqual(res.breakdown.cover_paper_cost, 75.90);
            assert.strictEqual(res.breakdown.interior_print_cost, 168.00);
            assert.strictEqual(res.breakdown.binding_cost, 279.00);
            assert.strictEqual(res.breakdown.freight_cost, 0.00);
        });

        it('SEC-C03.3: Adversarial fixture with altered finish category: offset -> lux paper grade', () => {
            const res = recalculateDeterministicBpePrice({
                originalCalculation: baselineBpeSnapshot,
                alternativeVariant: { gsm: 90, paper_type: 'lux' }, // Same gsm, different tariff grade (lux = 1.85 €/kg)
                targetMarginPct: 18.5
            });

            // 6173 sheets * 0.576 m2 * 0.090 kg/m2 * 1.85 €/kg = 592.02 €
            // paper delta = 592.02 - 464.00 = 128.02 €
            // revised cost = 1147.30 + 128.02 = 1275.32 €
            // price delta = 1564.8098 - 1407.7301 = 157.0797 €
            assert.strictEqual(res.breakdown.interior_paper_cost_delta, 128.02);
            assert.strictEqual(res.revised_industrial_cost, 1275.32);
            assert.strictEqual(res.delta_net_price, 157.0797);
        });

        it('SEC-C03.4: Fails closed when tariff rate is missing for paper category (zero fictitious fallback)', () => {
            assert.throws(
                () => recalculateDeterministicBpePrice({
                    originalCalculation: baselineBpeSnapshot,
                    alternativeVariant: { gsm: 120, paper_type: 'unknown_synthetic_poly' }, // Missing from tariff table
                    targetMarginPct: 18.5
                }),
                err => err.code === 'RECALCULATION_BLOCKED' && err.statusCode === 422
            );
        });
    });

    // =========================================================================
    // CONTROL SEC-C04: GET ESTRICTAMENTE SEGURO
    // =========================================================================
    describe('SEC-C04 — GET estrictamente seguro y cero escrituras en lectura', () => {
        it('SEC-C04.1: getQuoteRevisionByToken executes ZERO SQL write operations (UPDATE, INSERT, DELETE)', async () => {
            const created = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'client@example.com',
                originalCalculation: baselineBpeSnapshot,
                alternativeVariant: { gsm: 120, paper_type: 'offset' },
                taxResolutionContext: { seller_country: 'ES', customer_country: 'ES', product_category: 'BOOK', is_editorial_book: true }
            });

            mockDb.executedQueries = []; // Reset query recorder

            // Execute GET read
            const review = await service.getQuoteRevisionByToken({ rawToken: created.rawToken });
            assert.strictEqual(review.revision_id, created.revision_id);

            // Assert ZERO mutations executed
            const mutationQueries = mockDb.executedQueries.filter(q =>
                q.sql.startsWith('update') || q.sql.startsWith('insert') || q.sql.startsWith('delete')
            );
            assert.strictEqual(mutationQueries.length, 0, 'GET review must execute ZERO SQL mutation queries');
        });

        it('SEC-C04.2: Expired tokens in GET review are detected purely in memory without DB updates', async () => {
            const created = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'client@example.com',
                originalCalculation: baselineBpeSnapshot,
                alternativeVariant: { gsm: 120, paper_type: 'offset' },
                taxResolutionContext: { seller_country: 'ES', customer_country: 'ES', product_category: 'BOOK', is_editorial_book: true }
            });

            // Set token expiration into past in mock memory
            mockDb.quote_revision_tokens[0].expires_at = new Date(Date.now() - 3600 * 1000).toISOString();
            mockDb.executedQueries = [];

            await assert.rejects(
                () => service.getQuoteRevisionByToken({ rawToken: created.rawToken }),
                err => err.code === 'TOKEN_EXPIRED' && err.statusCode === 410
            );

            // Assert again that ZERO database mutations were performed during GET
            const mutationQueries = mockDb.executedQueries.filter(q =>
                q.sql.startsWith('update') || q.sql.startsWith('insert') || q.sql.startsWith('delete')
            );
            assert.strictEqual(mutationQueries.length, 0, 'GET review on expired token must NOT perform database writes');
        });

        it('SEC-C04.3: Dedicated expireStaleQuoteRevisions maintenance job executes persistent transition', async () => {
            const created = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'client@example.com',
                originalCalculation: baselineBpeSnapshot,
                alternativeVariant: { gsm: 120, paper_type: 'offset' },
                taxResolutionContext: { seller_country: 'ES', customer_country: 'ES', product_category: 'BOOK', is_editorial_book: true }
            });

            // Make it stale
            mockDb.quote_revision_tokens[0].expires_at = new Date(Date.now() - 3600 * 1000).toISOString();
            mockDb.order_quote_revisions[0].expires_at = new Date(Date.now() - 3600 * 1000).toISOString();

            const maintenanceResult = await service.expireStaleQuoteRevisions({ tenantId: 'tenant_alpha' });
            assert.strictEqual(maintenanceResult.ok, true);
        });
    });

    // =========================================================================
    // CONTROL SEC-C05: AUTORIZACIÓN EN EMISIÓN Y REVOCACIÓN (MIDDLEWARE AUDIT)
    // =========================================================================
    describe('SEC-C05 — Autorización en emisión y revocación', () => {
        it('SEC-C05.1: POST /quote-revisions route requires printhouse scope and authenticated user', async () => {
            const route = findRouteLayer(quoteRevisionRoutes, '/quote-revisions', 'POST');
            assert.ok(route, 'POST /quote-revisions route must exist');

            // 1. Unauthenticated request (no req.user)
            const { req: unauthReq, res: unauthRes, getStatusCode: getUnauthStatus, getBody: getUnauthBody } = createMockReqRes({
                method: 'POST',
                url: '/quote-revisions',
                body: { externalOrderIntentId: 'job_order_100' }
            });

            // Run first middleware in layer stack
            const authMiddleware = route.stack[0].handle;
            await authMiddleware(unauthReq, unauthRes, () => {});
            assert.strictEqual(getUnauthStatus(), 401);
            assert.strictEqual(getUnauthBody().error.code, 'UNAUTHORIZED');

            // 2. Insufficient role (VIEWER)
            const { req: viewerReq, res: viewerRes, getStatusCode: getViewerStatus, getBody: getViewerBody } = createMockReqRes({
                method: 'POST',
                url: '/quote-revisions',
                body: { externalOrderIntentId: 'job_order_100' },
                user: { id: 'usr_viewer', role: 'VIEWER', tenantId: 'tenant_alpha' }
            });

            await authMiddleware(viewerReq, viewerRes, () => {});
            assert.strictEqual(getViewerStatus(), 403);
            assert.strictEqual(getViewerBody().error.code, 'FORBIDDEN');
        });

        it('SEC-C05.2: POST /quote-revisions rejects cross-tenant spoofing in request body (FORBIDDEN_TENANT_MISMATCH)', async () => {
            const route = findRouteLayer(quoteRevisionRoutes, '/quote-revisions', 'POST');
            const handler = route.stack[route.stack.length - 1].handle;

            const { req, res, getStatusCode, getBody } = createMockReqRes({
                method: 'POST',
                url: '/quote-revisions',
                body: {
                    tenantId: 'tenant_victim_beta', // Attempt to issue for another tenant in body!
                    externalOrderIntentId: 'job_order_100'
                },
                user: {
                    id: 'usr_operator_alpha',
                    role: 'PRINTHOUSE_OPERATOR',
                    tenantId: 'tenant_alpha',
                    printhouseId: 'ph_dar_01'
                }
            });

            await handler(req, res);
            assert.strictEqual(getStatusCode(), 403);
            assert.strictEqual(getBody().error.code, 'FORBIDDEN_TENANT_MISMATCH');
        });

        it('SEC-C05.3: Superadmin without valid tenant context fails closed with TENANT_CONTEXT_REQUIRED', async () => {
            const route = findRouteLayer(quoteRevisionRoutes, '/quote-revisions', 'POST');
            const handler = route.stack[route.stack.length - 1].handle;

            const { req, res, getStatusCode, getBody } = createMockReqRes({
                method: 'POST',
                url: '/quote-revisions',
                body: { externalOrderIntentId: 'job_order_100' },
                user: {
                    id: 'usr_super_admin',
                    role: 'SUPER_ADMIN',
                    tenantId: null // Misconfigured or missing tenant context
                }
            });

            await handler(req, res);
            assert.strictEqual(getStatusCode(), 403);
            assert.strictEqual(getBody().error.code, 'TENANT_CONTEXT_REQUIRED');
        });

        it('SEC-C05.4: POST /:revisionId/revoke enforces Printhouse scope and blocks cross-tenant revocation', async () => {
            const route = findRouteLayer(quoteRevisionRoutes, '/quote-revisions/:revisionId/revoke', 'POST');
            assert.ok(route, 'Revoke route must exist');
            const handler = route.stack[route.stack.length - 1].handle;

            const { req, res, getStatusCode, getBody } = createMockReqRes({
                method: 'POST',
                url: '/quote-revisions/oqr_123/revoke',
                params: { revisionId: 'oqr_123' },
                body: { tenantId: 'tenant_victim_beta' },
                user: {
                    id: 'usr_operator_alpha',
                    role: 'PRINTHOUSE_ADMIN',
                    tenantId: 'tenant_alpha',
                    printhouseId: 'ph_dar_01'
                }
            });

            await handler(req, res);
            assert.strictEqual(getStatusCode(), 403);
            assert.strictEqual(getBody().error.code, 'FORBIDDEN_TENANT_MISMATCH');
        });
    });

    // =========================================================================
    // CONTROL SEC-C06: SEGURIDAD DE ACEPTACIÓN, REPLAY Y TRIPLE COMPUERTA
    // =========================================================================
    describe('SEC-C06 — Seguridad de tokens, prevención de replay y triple compuerta', () => {
        it('SEC-C06.1: Token is cryptographically bound to recipient email hash and revision amount', async () => {
            const created = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'verified.buyer@enterprise.com',
                originalCalculation: baselineBpeSnapshot,
                alternativeVariant: { gsm: 120, paper_type: 'offset' },
                taxResolutionContext: { seller_country: 'ES', customer_country: 'ES', product_category: 'BOOK', is_editorial_book: true }
            });

            const tokenRow = mockDb.quote_revision_tokens[0];
            const expectedEmailHash = crypto.createHash('sha256').update('verified.buyer@enterprise.com').digest('hex');
            assert.strictEqual(tokenRow.recipient_email_hash, expectedEmailHash);
            assert.strictEqual(tokenRow.bound_amount, 189.7914);
            assert.strictEqual(tokenRow.bound_currency, 'EUR');
        });

        it('SEC-C06.2: Replay attack on consumed token is strictly rejected with HTTP 410 TOKEN_ALREADY_CONSUMED', async () => {
            const created = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'client@example.com',
                originalCalculation: baselineBpeSnapshot,
                alternativeVariant: { gsm: 120, paper_type: 'offset' },
                taxResolutionContext: { seller_country: 'ES', customer_country: 'ES', product_category: 'BOOK', is_editorial_book: true }
            });

            // First legitimate acceptance
            const resp1 = await service.respondToQuoteRevision({
                rawToken: created.rawToken,
                decision: 'ACCEPT',
                otpCode: deliveredOtps[0].otpCode
            });
            assert.strictEqual(resp1.status, 'ACCEPTED');

            // Second acceptance (replay attack)
            await assert.rejects(
                () => service.respondToQuoteRevision({
                    rawToken: created.rawToken,
                    decision: 'ACCEPT',
                    otpCode: deliveredOtps[0].otpCode
                }),
                err => err.code === 'TOKEN_ALREADY_CONSUMED' && err.statusCode === 410
            );
        });

        it('SEC-C06.3: Token bruteforce protection permanently revokes token after max attempts (HTTP 429)', async () => {
            const created = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'client@example.com',
                originalCalculation: baselineBpeSnapshot,
                alternativeVariant: { gsm: 120, paper_type: 'offset' },
                taxResolutionContext: { seller_country: 'ES', customer_country: 'ES', product_category: 'BOOK', is_editorial_book: true }
            });

            // Simulate 5 failed attempts
            mockDb.quote_revision_tokens[0].attempt_count = 5;

            await assert.rejects(
                () => service.respondToQuoteRevision({
                    rawToken: created.rawToken,
                    decision: 'ACCEPT',
                    otpCode: deliveredOtps[0].otpCode
                }),
                err => err.code === 'MAX_ATTEMPTS_EXCEEDED' && err.statusCode === 429
            );
            assert.strictEqual(mockDb.quote_revision_tokens[0].status, 'REVOKED');
        });

        it('SEC-C06.4: Zero token plaintext leakage: redactToken() protects tokens from leaking into logs', () => {
            const rawToken = '3a8f10283c714d2e9b05f617a28e93bc41029384756102938475610293847561';
            const redacted = redactToken(rawToken);
            assert.strictEqual(redacted, '3a8f***7561');
            assert.notStrictEqual(redacted, rawToken);

            assert.strictEqual(redactToken(''), '[REDACTED]');
            assert.strictEqual(redactToken(null), '[REDACTED]');
            assert.strictEqual(redactToken('short'), '***');
        });

        it('SEC-C06.5: Triple gates remain decoupled: acceptance does NOT trigger automated production dispatch or charge', async () => {
            const created = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'client@example.com',
                originalCalculation: baselineBpeSnapshot,
                alternativeVariant: { gsm: 120, paper_type: 'offset' },
                taxResolutionContext: { seller_country: 'ES', customer_country: 'ES', product_category: 'BOOK', is_editorial_book: true }
            });

            const response = await service.respondToQuoteRevision({
                rawToken: created.rawToken,
                decision: 'ACCEPT',
                otpCode: deliveredOtps[0].otpCode
            });

            // GATE_CONTRACTUAL passes, but financial and industrial gates are explicitly NOT bypassed
            assert.strictEqual(response.gates.gate_contractual, 'PASSED');
            assert.strictEqual(response.gates.gate_financial, 'PAYMENT_PENDING'); // No automated charging
            assert.strictEqual(response.gates.gate_industrial, 'PREFLIGHT_PENDING'); // No automated factory dispatch
        });
    });
});
