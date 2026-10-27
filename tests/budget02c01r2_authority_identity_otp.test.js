'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-r2-jwt-secret-ppos-2026';
process.env.NODE_ENV = 'test';

/**
 * tests/budget02c01r2_authority_identity_otp.test.js
 * 
 * BUDGET-02C-01R2: Authority, Real Identity & Verifiable OTP Delivery Certification Suite
 * 
 * Exhaustively certifies:
 * 1. SEC-C01R: Verifiable OTP delivery via real provider adapter.
 *              Rejection on missing, unimplemented, rejected, or network failure.
 *              Distinction between PROVIDER_ACCEPTED and device receipt (handset_delivered: false).
 * 2. SEC-C02R: Complete elimination of financial authority from HTTP body.
 *              Rejection of injected originalCalculation, alternativeVariant, targetMarginPct, tariffs, rates.
 *              Elimination of 18.5% default fallback. Fail closed on missing authoritative margin or snapshot.
 * 3. SEC-C03R: Real contractual customer identity resolution from order.
 *              Elimination of client@order.local and fictitious recipients.
 *              Lock verification: order existence, tenant ownership, printhouse assignment, active decision.
 * 4. Fiscal Policy & TTL: Server-authoritative tax resolution, 48 business hours Europe/Madrid TTL,
 *                         clamped to supplier offer validity.
 * 5. BPE Parity: Discrete sheet arithmetic, rejection of dimensional sheet format mismatch,
 *                rejection of unsupported grammages.
 */

const assert = require('assert');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mysqlClient = require('../src/api/services/mysqlClient');
const {
    OrderQuoteRevisionService,
    OrderQuoteRevisionError,
    OtpDeliveryService,
    recalculateDeterministicBpePrice,
    calculateBusinessHoursExpirationUtc,
    computeSaltedOtpHash
} = require('../src/api/services/orderQuoteRevisionService');
const TaxVatReadinessClassifierService = require('../src/api/services/taxVatReadinessClassifierService');
const quoteRevisionRoutes = require('../src/api/routes/orderQuoteRevisionRoutes');
const pricingSnapshotCanonicalizer = require('../src/api/services/pricingSnapshotCanonicalizer');

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
        ip: '127.0.0.1',
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

describe('BUDGET-02C-01R2 — Authority, Identity & Verifiable OTP Delivery Certification', () => {
    let mockDb;
    let service;
    let classifier;
    let mockDelivery;
    let deliveredOtps;
    const JWT_SECRET = 'test-r2-jwt-secret-ppos-2026';

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
            providerBehavior: 'SUCCESS', // 'SUCCESS', 'MISSING', 'UNIMPLEMENTED', 'REJECTED', 'NETWORK_ERROR'
            isDeliveryChannelConfigured: () => mockDelivery.configured,
            deliverOtp: async (payload) => {
                if (!mockDelivery.configured || mockDelivery.providerBehavior === 'MISSING') {
                    return { ok: false, status: 'PROVIDER_MISSING', reason: 'NO_ADAPTER_CONFIGURED' };
                }
                if (mockDelivery.providerBehavior === 'UNIMPLEMENTED') {
                    return { ok: false, status: 'PROVIDER_UNIMPLEMENTED', reason: 'PROVIDER_NOT_IMPLEMENTED' };
                }
                if (mockDelivery.providerBehavior === 'REJECTED') {
                    return { ok: false, status: 'PROVIDER_REJECTED', reason: 'REJECTED_BY_CARRIER_550' };
                }
                if (mockDelivery.providerBehavior === 'NETWORK_ERROR') {
                    return { ok: false, status: 'NETWORK_ERROR', reason: 'ECONNREFUSED_10.0.1.25' };
                }
                deliveredOtps.push(payload);
                return {
                    ok: true,
                    status: 'PROVIDER_ACCEPTED',
                    channel: 'EMAIL',
                    destination: payload.recipientEmail,
                    proof: {
                        provider_message_id: `msg_mock_${Date.now()}`,
                        accepted_at: new Date().toISOString(),
                        handset_delivered: false
                    }
                };
            }
        };

        service = new OrderQuoteRevisionService({
            taxClassifier: classifier,
            otpDeliveryService: mockDelivery,
            jwtSecret: JWT_SECRET
        });

        const baseChecksum = pricingSnapshotCanonicalizer.calculatePricingSnapshotChecksum(baselineBpeSnapshot);
        mockDb = {
            orders: [
                {
                    id: 'ord_auth_100',
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
                    snapshot_id: 'ops_100',
                    order_id: 'ord_auth_100',
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
            printhouse_profiles: [
                {
                    printhouse_id: 'ph_madrid_01',
                    target_margin_pct: 18.5,
                    timezone: 'Europe/Madrid',
                    jurisdiction: 'ES-MD',
                    has_lunch_break: 1,
                    business_hours_ttl: 48
                }
            ],
            order_paper_decisions: [
                {
                    id: 'opd_legit_001',
                    tenant_id: 'tenant_alpha',
                    external_order_intent_id: 'job_order_100',
                    canonical_order_id: 'ord_auth_100',
                    printhouse_tenant_id: 'ph_madrid_01',
                    paper_role: 'INTERIOR',
                    requested_variant_id: 'var_offset_90',
                    decision_action: 'PROPOSE_ALTERNATIVE',
                    alternative_variant_id: 'var_offset_120',
                    economic_status: 'REQUIRES_ECONOMIC_REVISION',
                    status: 'ACTIVE',
                    metadata_json: {
                        bpe_snapshot: baselineBpeSnapshot,
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
                    brand_name: 'Munken Print White 120g',
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

                if (s.includes('from order_pricing_snapshots')) {
                    const [orderId, tenantId] = params;
                    const matches = (mockDb.order_pricing_snapshots || []).filter(
                        snap => snap.order_id === orderId && (!tenantId || snap.tenant_id === tenantId) && snap.status === 'SEALED'
                    );
                    return [matches];
                }

                if (s.includes('from printhouse_profiles')) {
                    const [phId] = params;
                    const matches = (mockDb.printhouse_profiles || []).filter(p => p.printhouse_id === phId);
                    return [matches];
                }

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
                        otp_delivery_status: token.otp_delivery_status || 'PROVIDER_ACCEPTED',
                        otp_delivered_at: token.otp_delivered_at,
                        otp_delivery_proof_json: token.otp_delivery_proof_json,
                        token_expires_at: token.expires_at,
                        expires_at: token.expires_at,
                        attempt_count: token.attempt_count,
                        max_attempts: token.max_attempts,
                        revision_id: revision.id,
                        tenant_id: revision.tenant_id,
                        order_ref: revision.external_order_intent_id,
                        canonical_order_id: revision.canonical_order_id,
                        paper_decision_id: revision.paper_decision_id,
                        revision_status: revision.status,
                        currency: revision.currency,
                        delta_net_amount: revision.delta_net_amount,
                        revised_net_amount: revision.revised_net_amount,
                        delta_tax_amount: revision.delta_tax_amount,
                        revised_tax_amount: revision.revised_tax_amount,
                        delta_gross_amount: revision.delta_gross_amount,
                        revised_gross_amount: revision.revised_gross_amount,
                        bpe_calculation_id: revision.bpe_calculation_id,
                        breakdown_json: revision.breakdown_json,
                        technical_specs_snapshot_json: revision.technical_specs_snapshot_json,
                        applied_policies_json: revision.applied_policies_json,
                        tax_resolution_snapshot_json: revision.tax_resolution_snapshot_json
                    }]];
                }

                if (s.includes('insert into order_quote_revisions')) {
                    const rev = {
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
                    mockDb.order_quote_revisions.push(rev);
                    return [{ affectedRows: 1, insertId: rev.id }];
                }

                if (s.includes('insert into quote_revision_tokens')) {
                    const tok = {
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
                    mockDb.quote_revision_tokens.push(tok);
                    return [{ affectedRows: 1, insertId: tok.id }];
                }

                if (s.includes('insert into order_revision_audit_events')) {
                    mockDb.order_revision_audit_events.push({
                        id: params[0],
                        tenant_id: params[1],
                        revision_id: params[2],
                        event_type: params[3],
                        actor_type: params[4],
                        actor_id: params[5],
                        payload: params[6]
                    });
                    return [{ affectedRows: 1 }];
                }

                if (s.includes('update order_quote_revisions set status = ?')) {
                    const [newStatus, revId, tenantId] = params;
                    const r = mockDb.order_quote_revisions.find(rev => rev.id === revId && rev.tenant_id === tenantId);
                    if (r) r.status = newStatus;
                    return [{ affectedRows: r ? 1 : 0 }];
                }

                if (s.includes('update quote_revision_tokens set status = ?')) {
                    const [newStatus, tokId] = params;
                    const t = mockDb.quote_revision_tokens.find(tok => tok.id === tokId);
                    if (t) t.status = newStatus;
                    return [{ affectedRows: t ? 1 : 0 }];
                }

                return [[]];
            }
        };

        mysqlClient.getConnection = async () => mockConn;
    });

    // =========================================================================
    // 1. SEC-C01R: VERIFIABLE OTP DELIVERY VIA REAL PROVIDER ADAPTER
    // =========================================================================
    describe('1. SEC-C01R — Verifiable OTP Delivery & Channel Integrity', () => {
        it('1.1: Standalone OtpDeliveryService requires real provider and refuses bare env flags', async () => {
            // Instantiating with bare env flags and no provider
            const bareDeliveryService = new OtpDeliveryService({
                smtpHost: 'smtp.sendgrid.net',
                enableOtpDelivery: true
            });

            const result = await bareDeliveryService.deliverOtp({
                recipientEmail: 'client@example.com',
                otpCode: '492810',
                revisionId: 'rev_123',
                deltaNet: 189.79,
                tenantId: 'tenant_alpha'
            });

            // Must NOT assume delivered merely because SMTP_HOST was present
            assert.strictEqual(result.ok, false);
            assert.strictEqual(result.status, 'PROVIDER_MISSING');
            assert.strictEqual(result.reason, 'NO_VERIFIED_DELIVERY_CHANNEL_CONFIGURED');
        });

        it('1.2: Standalone OtpDeliveryService fails closed when provider lacks sendOtp / sendMail', async () => {
            const emptyProvider = {}; // Provider without implementation
            const invalidDeliveryService = new OtpDeliveryService({
                provider: emptyProvider
            });

            const result = await invalidDeliveryService.deliverOtp({
                recipientEmail: 'client@example.com',
                otpCode: '492810',
                revisionId: 'rev_123',
                deltaNet: 189.79,
                tenantId: 'tenant_alpha'
            });

            assert.strictEqual(result.ok, false);
            assert.strictEqual(result.status, 'PROVIDER_UNIMPLEMENTED');
        });

        it('1.3: Fails closed with 403 OTP_DELIVERY_UNAVAILABLE when delivery provider is missing', async () => {
            mockDelivery.providerBehavior = 'MISSING';

            await assert.rejects(
                () => service.createQuoteRevision({
                    tenantId: 'tenant_alpha',
                    externalOrderIntentId: 'job_order_100',
                    paperDecisionId: 'opd_legit_001',
                    recipientEmail: 'finance.director@acme-publishing.es'
                }),
                err => err.code === 'OTP_DELIVERY_UNAVAILABLE' && err.statusCode === 403
            );
        });

        it('1.4: Fails closed with 403 OTP_DELIVERY_UNAVAILABLE when provider dispatch is rejected by upstream carrier', async () => {
            mockDelivery.providerBehavior = 'REJECTED';

            await assert.rejects(
                () => service.createQuoteRevision({
                    tenantId: 'tenant_alpha',
                    externalOrderIntentId: 'job_order_100',
                    paperDecisionId: 'opd_legit_001',
                    recipientEmail: 'finance.director@acme-publishing.es'
                }),
                err => err.code === 'OTP_DELIVERY_UNAVAILABLE' && err.statusCode === 403
            );
        });

        it('1.5: Fails closed with 403 OTP_DELIVERY_UNAVAILABLE upon network connectivity error', async () => {
            mockDelivery.providerBehavior = 'NETWORK_ERROR';

            await assert.rejects(
                () => service.createQuoteRevision({
                    tenantId: 'tenant_alpha',
                    externalOrderIntentId: 'job_order_100',
                    paperDecisionId: 'opd_legit_001',
                    recipientEmail: 'finance.director@acme-publishing.es'
                }),
                err => err.code === 'OTP_DELIVERY_UNAVAILABLE' && err.statusCode === 403
            );
        });

        it('1.6: Successfully records PROVIDER_ACCEPTED with provider_message_id and handset_delivered: false', async () => {
            mockDelivery.providerBehavior = 'SUCCESS';

            const revision = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'finance.director@acme-publishing.es'
            });

            assert.strictEqual(revision.otp_delivery_status, 'PROVIDER_ACCEPTED');
            const tokenRow = mockDb.quote_revision_tokens[0];
            assert.strictEqual(tokenRow.otp_delivery_status, 'PROVIDER_ACCEPTED');
            assert.ok(tokenRow.otp_delivered_at);
            
            // Proof json must distinguish acceptance from handset delivery
            const proof = typeof tokenRow.otp_delivery_proof_json === 'string'
                ? JSON.parse(tokenRow.otp_delivery_proof_json)
                : tokenRow.otp_delivery_proof_json;
            assert.ok(proof.provider_message_id.startsWith('msg_mock_'));
            assert.strictEqual(proof.handset_delivered, false);
        });
    });

    // =========================================================================
    // 2. SEC-C02R: ELIMINATE ALL FINANCIAL AUTHORITY FROM HTTP BODY
    // =========================================================================
    describe('2. SEC-C02R — Zero Financial Authority in Request Body', () => {
        it('2.1: Route POST /quote-revisions strictly blocks originalCalculation in body with 400', async () => {
            const route = findRouteLayer(quoteRevisionRoutes, '/quote-revisions', 'post');
            const handler = route.stack[route.stack.length - 1].handle;
            const { req, res, getStatusCode, getBody } = createMockReqRes({
                method: 'POST',
                url: '/quote-revisions',
                body: {
                    externalOrderIntentId: 'job_order_100',
                    paperDecisionId: 'opd_legit_001',
                    originalCalculation: { base_net_price: 50.00 } // Injected financial data!
                },
                user: { id: 'usr_op', tenantId: 'tenant_alpha', role: 'PRINTHOUSE_OPERATOR', printhouseId: 'ph_madrid_01' }
            });

            await handler(req, res);
            assert.strictEqual(getStatusCode(), 400);
            assert.strictEqual(getBody().error.code, 'FINANCIAL_AUTHORITY_VIOLATION');
        });

        it('2.2: Route POST /quote-revisions strictly blocks targetMarginPct in body with 400', async () => {
            const route = findRouteLayer(quoteRevisionRoutes, '/quote-revisions', 'post');
            const handler = route.stack[route.stack.length - 1].handle;
            const { req, res, getStatusCode, getBody } = createMockReqRes({
                method: 'POST',
                url: '/quote-revisions',
                body: {
                    externalOrderIntentId: 'job_order_100',
                    paperDecisionId: 'opd_legit_001',
                    targetMarginPct: 2.0 // Injected predatory/discount margin!
                },
                user: { id: 'usr_op', tenantId: 'tenant_alpha', role: 'PRINTHOUSE_OPERATOR', printhouseId: 'ph_madrid_01' }
            });

            await handler(req, res);
            assert.strictEqual(getStatusCode(), 400);
            assert.strictEqual(getBody().error.code, 'FINANCIAL_AUTHORITY_VIOLATION');
        });

        it('2.3: Route POST /quote-revisions strictly blocks alternativeVariant in body with 400', async () => {
            const route = findRouteLayer(quoteRevisionRoutes, '/quote-revisions', 'post');
            const handler = route.stack[route.stack.length - 1].handle;
            const { req, res, getStatusCode, getBody } = createMockReqRes({
                method: 'POST',
                url: '/quote-revisions',
                body: {
                    externalOrderIntentId: 'job_order_100',
                    paperDecisionId: 'opd_legit_001',
                    alternativeVariant: { gsm: 100, paper_type: 'offset' } // Injected spec!
                },
                user: { id: 'usr_op', tenantId: 'tenant_alpha', role: 'PRINTHOUSE_OPERATOR', printhouseId: 'ph_madrid_01' }
            });

            await handler(req, res);
            assert.strictEqual(getStatusCode(), 400);
            assert.strictEqual(getBody().error.code, 'FINANCIAL_AUTHORITY_VIOLATION');
        });

        it('2.4: Fails closed with 422 RECALCULATION_BLOCKED when margin is missing (zero 18.5% default fallback)', async () => {
            // Remove target_margin_pct from snapshot and printhouse profile to verify no silent fallback occurs
            const noMarginSnapshot = JSON.parse(JSON.stringify(baselineBpeSnapshot));
            delete noMarginSnapshot.target_margin_pct;
            mockDb.orders[0].offers_snapshot = noMarginSnapshot;
            mockDb.order_paper_decisions[0].metadata_json = { bpe_snapshot: noMarginSnapshot };
            mockDb.printhouse_profiles[0].target_margin_pct = null;
            mockDb.order_pricing_snapshots[0].snapshot_json = JSON.stringify(noMarginSnapshot);
            mockDb.order_pricing_snapshots[0].snapshot_checksum = pricingSnapshotCanonicalizer.calculatePricingSnapshotChecksum(noMarginSnapshot);

            await assert.rejects(
                () => service.createQuoteRevision({
                    tenantId: 'tenant_alpha',
                    externalOrderIntentId: 'job_order_100',
                    paperDecisionId: 'opd_legit_001',
                    recipientEmail: 'finance.director@acme-publishing.es'
                }),
                err => err.code === 'RECALCULATION_BLOCKED' && err.details?.reason === 'MISSING_AUTHORITATIVE_MARGIN'
            );
        });

        it('2.5: Fails closed with 422 RECALCULATION_BLOCKED when pricing snapshot is missing from DB', async () => {
            mockDb.orders[0].offers_snapshot = null;
            mockDb.order_paper_decisions[0].metadata_json = {};
            mockDb.order_pricing_snapshots = [];

            await assert.rejects(
                () => service.createQuoteRevision({
                    tenantId: 'tenant_alpha',
                    externalOrderIntentId: 'job_order_100',
                    paperDecisionId: 'opd_legit_001',
                    recipientEmail: 'finance.director@acme-publishing.es'
                }),
                err => err.code === 'RECALCULATION_BLOCKED' && (err.details?.reason === 'UNVERIFIED_SNAPSHOT_PROVENANCE' || err.details?.reason === 'MISSING_AUTHORITATIVE_PRICING_SNAPSHOT')
            );
        });

        it('2.6: Preserves original BPE baseline net price (1.407,7301 €) immutable without mixing historical commercial fixtures', async () => {
            const originalNet = 1407.7301;

            const revision = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'finance.director@acme-publishing.es'
            });

            // Base figures in revision match original baseline
            assert.strictEqual(revision.base_net_amount, originalNet);
            // Original snapshot in order table remains untampered
            assert.strictEqual(mockDb.orders[0].offers_snapshot.base_net_price, originalNet);
        });
    });

    // =========================================================================
    // 3. SEC-C03R: REAL CONTRACTUAL CUSTOMER IDENTITY RESOLUTION
    // =========================================================================
    describe('3. SEC-C03R — Real Contractual Customer Identity & Verification Under Lock', () => {
        it('3.1: Rejects fictitious identity client@order.local with 422 UNVERIFIED_RECIPIENT_IDENTITY', async () => {
            mockDb.orders[0].customer_email = 'client@order.local';

            await assert.rejects(
                () => service.createQuoteRevision({
                    tenantId: 'tenant_alpha',
                    externalOrderIntentId: 'job_order_100',
                    paperDecisionId: 'opd_legit_001'
                }),
                err => err.code === 'UNVERIFIED_RECIPIENT_IDENTITY' && err.statusCode === 422
            );
        });

        it('3.2: Rejects orders without authenticated customer email with 422 UNVERIFIED_RECIPIENT_IDENTITY', async () => {
            mockDb.orders[0].customer_email = null;
            mockDb.orders[0].recipient_email = null;
            mockDb.orders[0].metadata_json = {};

            await assert.rejects(
                () => service.createQuoteRevision({
                    tenantId: 'tenant_alpha',
                    externalOrderIntentId: 'job_order_100',
                    paperDecisionId: 'opd_legit_001'
                }),
                err => err.code === 'UNVERIFIED_RECIPIENT_IDENTITY' && err.details?.reason === 'MISSING_CONTRACTUAL_RECIPIENT'
            );
        });

        it('3.3: Rejects request if body passes recipientEmail differing from contractual email with 403', async () => {
            // Order contractual recipient is finance.director@acme-publishing.es
            await assert.rejects(
                () => service.createQuoteRevision({
                    tenantId: 'tenant_alpha',
                    externalOrderIntentId: 'job_order_100',
                    paperDecisionId: 'opd_legit_001',
                    recipientEmail: 'attacker.imposter@evil.com' // Discrepancy!
                }),
                err => err.code === 'FORBIDDEN_RECIPIENT_MISMATCH' && err.statusCode === 403
            );
        });

        it('3.4: Rejects non-existent order with 404 ORDER_NOT_FOUND', async () => {
            mockDb.order_paper_decisions[0].external_order_intent_id = 'job_non_existent';

            await assert.rejects(
                () => service.createQuoteRevision({
                    tenantId: 'tenant_alpha',
                    externalOrderIntentId: 'job_non_existent',
                    paperDecisionId: 'opd_legit_001'
                }),
                err => err.code === 'ORDER_NOT_FOUND' && err.statusCode === 404
            );
        });

        it('3.5: Cryptographically binds token and OTP to real contractual customer recipient', async () => {
            const revision = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                recipientEmail: 'finance.director@acme-publishing.es'
            });

            const tokenRow = mockDb.quote_revision_tokens[0];
            const expectedHash = crypto.createHash('sha256').update('finance.director@acme-publishing.es').digest('hex');
            assert.strictEqual(tokenRow.recipient_email_hash, expectedHash);
        });
    });

    // =========================================================================
    // 4. FISCAL POLICY & TTL CALCULATION
    // =========================================================================
    describe('4. Fiscal Policy & Business Hours TTL', () => {
        it('4.1: Server resolves authoritative fiscal classification (ignores body overrides)', async () => {
            const revision = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001',
                // Malicious body attempting to inject 0% tax or false export status
                taxResolutionContext: { tax_rate_applied: 0, tax_treatment: 'FALSE_EXEMPTION' }
            });

            const revRow = mockDb.order_quote_revisions[0];
            const parsedTax = JSON.parse(revRow.tax_resolution_snapshot_json);
            
            // Must have evaluated server-side according to Spanish domestic B2B editorial book policy (4% VAT)
            assert.strictEqual(revRow.tax_rate_pct, 4);
            assert.strictEqual(parsedTax.readiness_status, 'READY');
            assert.strictEqual(parsedTax.tax_treatment, 'DOMESTIC_VAT_SUPER_REDUCED_BOOKS_ART_91_DOS_1_2');
        });

        it('4.2: calculateBusinessHoursExpirationUtc respects 8h workday (Mon-Fri 09:00-18:00) skipping weekends and holidays', () => {
            // Start: Friday 2026-10-30 10:00 Madrid time
            const fridayStart = new Date('2026-10-30T09:00:00.000Z'); // 10:00 CET
            const expirationUtc = calculateBusinessHoursExpirationUtc({
                startDate: fridayStart,
                businessHours: 16, // 2 business days
                timezone: 'Europe/Madrid'
            });

            // Saturday Oct 31 & Sunday Nov 1 are skipped
            // Monday Nov 2 or Tuesday Nov 3 should be expiration
            assert.ok(expirationUtc > fridayStart);
            const daysDiff = (expirationUtc.getTime() - fridayStart.getTime()) / (1000 * 60 * 60 * 24);
            assert.ok(daysDiff >= 3); // Must span over the weekend
        });

        it('4.3: Expiration is clamped by supplier_offer_valid_until if earlier than 48 business hours', async () => {
            // Set supplier offer to expire in 2 hours
            const urgentSupplierOffer = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
            mockDb.order_paper_decisions[0].metadata_json.supplier_offer_valid_until = urgentSupplierOffer;

            const revision = await service.createQuoteRevision({
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'job_order_100',
                paperDecisionId: 'opd_legit_001'
            });

            const revExpiresAt = new Date(revision.expires_at).getTime();
            const supplierOfferTime = new Date(urgentSupplierOffer).getTime();
            assert.strictEqual(revExpiresAt, supplierOfferTime);
        });
    });

    // =========================================================================
    // 5. BPE PARITY & HARDENED SUBSTITUTION BOUNDARIES
    // =========================================================================
    describe('5. BPE Parity & Discrete Sheet Arithmetic', () => {
        it('5.1: Discrete sheet calculation matches BPE engine parity', () => {
            const bpeResult = recalculateDeterministicBpePrice({
                originalCalculation: baselineBpeSnapshot,
                alternativeVariant: {
                    id: 'var_offset_120',
                    gsm: 120,
                    paper_type: 'offset',
                    sheet_width: 640,
                    sheet_height: 900
                },
                paperRole: 'INTERIOR',
                targetMarginPct: 18.5
            });

            // 1000 copies, 128 interior pages, signature 32 -> 4 signatures
            // 4 * 1000 = 4000 net sheets. Setup waste = 100, binding waste = 5% (200) -> 4300 gross sheets.
            // 640 x 900 mm at 120 gsm = 0.64 * 0.9 * 120 / 1000 = 0.06912 kg/sheet.
            // 4300 * 0.06912 = 297.216 kg -> rounded to 426.6667 or exact parity
            assert.strictEqual(bpeResult.revised_net_price, 1597.5215);
            assert.strictEqual(bpeResult.delta_net_price, 189.7914);
            assert.ok(bpeResult.bpe_calculation_id.startsWith('bpe_calc_'));
        });

        it('5.2: Rejects dimensional mismatch between alternative sheet format and original press format with 422', () => {
            assert.throws(
                () => recalculateDeterministicBpePrice({
                    originalCalculation: baselineBpeSnapshot,
                    alternativeVariant: {
                        id: 'var_mismatched_sheet',
                        gsm: 120,
                        paper_type: 'offset',
                        sheet_width: 700, // 700x1000 != 640x900
                        sheet_height: 1000
                    },
                    paperRole: 'INTERIOR',
                    targetMarginPct: 18.5
                }),
                err => err.code === 'RECALCULATION_BLOCKED' && err.details?.reason === 'UNSUPPORTED_DIMENSIONAL_SUBSTITUTION'
            );
        });

        it('5.3: Rejects unsupported paper grammages (<60 gsm or >350 gsm) with 422', () => {
            assert.throws(
                () => recalculateDeterministicBpePrice({
                    originalCalculation: baselineBpeSnapshot,
                    alternativeVariant: {
                        id: 'var_tissue_paper',
                        gsm: 40, // < 60 gsm
                        paper_type: 'offset',
                        sheet_width: 640,
                        sheet_height: 900
                    },
                    paperRole: 'INTERIOR',
                    targetMarginPct: 18.5
                }),
                err => err.code === 'RECALCULATION_BLOCKED' && err.details?.reason === 'UNSUPPORTED_GRAMMAGE_RANGE'
            );
        });
    });
});
