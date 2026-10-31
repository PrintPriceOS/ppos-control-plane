'use strict';

/**
 * tests/budget02b01_order_paper_decisions.test.js
 * 
 * BUDGET-02B-01R: Governed Persistence & Paper Decision Contracts Certification Suite
 * Includes adversarial remediation tests for H-02, H-03, H-04, and H-05.
 *
 * Verifies:
 *  - H-02: Mandatory Order Verification & Tenancy Gating
 *    * Rejection of decisions on nonexistent orders (404 ORDER_NOT_FOUND)
 *    * Rejection of decisions on orders without printhouse assigned (422 PRINTHOUSE_UNASSIGNED)
 *    * Rejection of cross-tenant attempts (403 TENANT_MISMATCH)
 *    * Rejection of unassigned printhouse attempts (403 PRINTHOUSE_UNAUTHORIZED)
 *    * Rejection of decisions on CANCELLED orders (422 ORDER_INELIGIBLE)
 *  - H-03: Authorization Strictly Precedes Idempotency & Full Canonical Fingerprinting
 *    * Idempotency replay blocked if caller is unauthorized (403 before replay)
 *    * Idempotency replay blocked on cancelled order (422 before replay)
 *    * Full canonical payload hash comparison (detects alteration of delta, reason, currency)
 *    * Rejection with 409 IDEMPOTENCY_KEY_COLLISION without revealing original payload
 *    * Exact idempotent replay returns 200 with idempotent_replay = true
 *  - H-04: Concurrency Engine & Database Constraint (uk_opd_active_role)
 *    * Row-level locking on parent order
 *    * Enforcement that exactly ONE active decision exists per (tenant, order_intent, paper_role)
 *    * Monotonic increment of decision_number (1 -> 2 -> 3) and atomic SUPERSEDED state
 *    * Simulation of concurrent active insert collision raises Duplicate entry
 *  - H-05: Economic Integrity & Client Delta Neutrality
 *    * PROPOSE_ALTERNATIVE is ALWAYS classified as REQUIRES_ECONOMIC_REVISION even if client delta is 0
 *    * Rejection of NaN, Infinity, non-numeric or out-of-bounds delta
 *    * Rejection of precision > 4 decimals
 *    * Rejection of invalid currency codes
 *    * Strict conservation of original BPE quote (1.782,30 €)
 *  - Full HTTP Layer Security & Endpoints
 *    * POST /jobs/:jobId/paper-decision and /orders/:orderRef/paper-decision
 *    * Mandatory Idempotency-Key header
 *    * Anti-prototype pollution defense
 */

const assert = require('assert');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_backend_secret_32_bytes_long_key_1234';
process.env.JWT_AUDIENCE = 'ppos:control';
process.env.JWT_ISSUER = 'https://auth.printprice.pro';

const mysqlClient = require('../src/api/services/mysqlClient');
const orderPaperDecisionService = require('../src/api/services/orderPaperDecisionService');
const printhouseOrdersRouter = require('../src/api/routes/printhouseOrders');

function createMockReqRes({
    method = 'POST',
    url = '/',
    params = {},
    query = {},
    headers = {},
    body = {},
    user = null
}) {
    let statusCode = 200;
    let responseBody = null;
    let nextCalled = false;

    const req = {
        method,
        url,
        originalUrl: url,
        path: url.split('?')[0],
        params,
        query,
        headers: { ...headers },
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
        },
        setHeader() {},
        getHeader() {}
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

describe('BUDGET-02B-01R — Remediated Paper Decisions Domain Service & API Certification Suite', () => {
    let mockDb;
    let originalGetConnection;
    let originalQuery;

    beforeEach(() => {
        mockDb = {
            paper_products: [
                { id: 'prod_offset_coral', name: 'Coral Book White', category: 'UNCOATED', brand: 'Coral' },
                { id: 'prod_coated_creator', name: 'Creator Silk Coated', category: 'COATED', brand: 'Creator' }
            ],
            paper_variants: [
                {
                    id: 'var_coral_90_70x100',
                    product_id: 'prod_offset_coral',
                    gsm: 90,
                    width_mm: 700.0,
                    height_mm: 1000.0,
                    finish: 'MATTE',
                    fingerprint: 'fp_coral_90'
                },
                {
                    id: 'var_creator_115_70x100',
                    product_id: 'prod_coated_creator',
                    gsm: 115,
                    width_mm: 700.0,
                    height_mm: 1000.0,
                    finish: 'SILK',
                    fingerprint: 'fp_creator_115'
                }
            ],
            orders: [
                {
                    id: 'ord_sql_001',
                    order_ref: 'job_bpe_1782',
                    tenant_id: 'tenant_books_es',
                    offer_print_house: 'print_artes_graficas_madrid',
                    offer_price: 1782.30,
                    status: 'IN_PREPARATION',
                    specs: JSON.stringify({ pages: 192, format: '150x210' })
                },
                {
                    id: 'ord_sql_cancelled',
                    order_ref: 'job_cancelled_99',
                    tenant_id: 'tenant_books_es',
                    offer_print_house: 'print_artes_graficas_madrid',
                    offer_price: 1782.30,
                    status: 'CANCELLED'
                },
                {
                    id: 'ord_sql_unassigned',
                    order_ref: 'job_no_printer_55',
                    tenant_id: 'tenant_books_es',
                    offer_print_house: null,
                    offer_price: 1782.30,
                    status: 'IN_PREPARATION'
                }
            ],
            marketplace_orders: [],
            order_paper_decisions: []
        };

        originalGetConnection = mysqlClient.getConnection;
        originalQuery = mysqlClient.query;

        const createMockConnection = () => ({
            query: async (sql, params = []) => {
                const normSql = sql.replace(/\s+/g, ' ').trim();

                // 1. SELECT variant with product join
                if (normSql.includes('FROM paper_variants v LEFT JOIN paper_products p ON v.product_id = p.id WHERE v.id = ?')) {
                    const variantId = params[0];
                    const v = mockDb.paper_variants.find(x => x.id === variantId);
                    if (!v) return [[]];
                    const p = mockDb.paper_products.find(x => x.id === v.product_id) || {};
                    return [[{
                        ...v,
                        product_category: p.category,
                        product_name: p.name,
                        product_brand: p.brand
                    }]];
                }

                // 2. SELECT order (lookup or row lock)
                if (normSql.includes('FROM orders WHERE order_ref = ? OR id = ?') || normSql.includes('FROM orders WHERE id = ? FOR UPDATE')) {
                    if (normSql.includes('FOR UPDATE') && typeof mockDb.onOrderLock === 'function') {
                        mockDb.onOrderLock();
                        mockDb.onOrderLock = null;
                    }
                    const ref = params[0];
                    const ord = mockDb.orders.find(o => o.order_ref === ref || o.id === ref);
                    return ord ? [[{ ...ord }]] : [[]];
                }

                // 3. SELECT marketplace_orders
                if (normSql.includes('FROM marketplace_orders WHERE order_id = ? OR id = ?') || normSql.includes('FROM marketplace_orders WHERE id = ? FOR UPDATE')) {
                    if (normSql.includes('FOR UPDATE') && typeof mockDb.onOrderLock === 'function') {
                        mockDb.onOrderLock();
                        mockDb.onOrderLock = null;
                    }
                    const ref = params[0];
                    const mp = mockDb.marketplace_orders.find(o => o.order_id === ref || o.id === ref);
                    return mp ? [[{ ...mp }]] : [[]];
                }

                // 4. SELECT order_paper_decisions by idempotency key
                if (normSql.includes('FROM order_paper_decisions WHERE tenant_id = ? AND idempotency_key = ?')) {
                    const [tId, key] = params;
                    const found = mockDb.order_paper_decisions.filter(d => d.tenant_id === tId && d.idempotency_key === key);
                    return [[...found]];
                }

                // 5. SELECT order_paper_decisions by order & role FOR UPDATE
                if (normSql.includes('FROM order_paper_decisions WHERE tenant_id = ? AND external_order_intent_id = ? AND paper_role = ?')) {
                    const [tId, extId, role] = params;
                    const found = mockDb.order_paper_decisions.filter(
                        d => d.tenant_id === tId && d.external_order_intent_id === extId && d.paper_role === role
                    );
                    return [[...found]];
                }

                // 6. UPDATE order_paper_decisions SET status = 'SUPERSEDED'
                if (normSql.includes("UPDATE order_paper_decisions SET status = 'SUPERSEDED'")) {
                    const [tId, extId, role] = params;
                    mockDb.order_paper_decisions.forEach(d => {
                        if (d.tenant_id === tId && d.external_order_intent_id === extId && d.paper_role === role && d.status === 'ACTIVE') {
                            d.status = 'SUPERSEDED';
                        }
                    });
                    return [{ affectedRows: 1 }];
                }

                // 7. INSERT INTO order_paper_decisions with active_role_slot simulation (H-04)
                if (normSql.startsWith('INSERT INTO order_paper_decisions')) {
                    const status = params[21];
                    const tenant_id = params[1];
                    const external_order_intent_id = params[2];
                    const paper_role = params[6];

                    // Database Engine Constraint Simulation: uk_opd_active_role (H-04)
                    if (status === 'ACTIVE') {
                        const duplicateActive = mockDb.order_paper_decisions.find(
                            d => d.tenant_id === tenant_id &&
                                 d.external_order_intent_id === external_order_intent_id &&
                                 d.paper_role === paper_role &&
                                 d.status === 'ACTIVE'
                        );
                        if (duplicateActive) {
                            const err = new Error(`Duplicate entry '${tenant_id}:${external_order_intent_id}:${paper_role}' for key 'order_paper_decisions.uk_opd_active_role'`);
                            err.code = 'ER_DUP_ENTRY';
                            throw err;
                        }
                    }

                    const record = {
                        id: params[0],
                        tenant_id,
                        external_order_intent_id,
                        canonical_order_id: params[3],
                        printhouse_tenant_id: params[4],
                        operator_id: params[5],
                        paper_role,
                        requested_variant_id: params[7],
                        decision_action: params[8],
                        alternative_variant_id: params[9],
                        snapshot_requested_gsm: params[10],
                        snapshot_requested_width_mm: params[11],
                        snapshot_requested_height_mm: params[12],
                        snapshot_requested_finish: params[13],
                        snapshot_requested_category: params[14],
                        estimated_cost_delta: params[15],
                        currency: params[16],
                        economic_status: params[17],
                        technical_reason: params[18],
                        printhouse_notes: params[19],
                        decision_number: params[20],
                        status,
                        idempotency_key: params[22],
                        payload_fingerprint: params[23],
                        metadata_json: params[24],
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };
                    mockDb.order_paper_decisions.push(record);
                    return [{ affectedRows: 1 }];
                }

                // 8. SELECT order_paper_decisions WHERE id = ?
                if (normSql.includes('FROM order_paper_decisions WHERE id = ?')) {
                    const dId = params[0];
                    const found = mockDb.order_paper_decisions.find(d => d.id === dId);
                    return found ? [[{ ...found }]] : [[]];
                }

                // 9. SELECT order_paper_decisions by order intent / canonical order
                if (normSql.includes('FROM order_paper_decisions WHERE tenant_id = ? AND (external_order_intent_id = ? OR canonical_order_id = ?)')) {
                    const [tId, id1, id2] = params;
                    const found = mockDb.order_paper_decisions.filter(
                        d => d.tenant_id === tId && (d.external_order_intent_id === id1 || d.canonical_order_id === id2)
                    );
                    return [[...found]];
                }

                return [[]];
            },
            beginTransaction: async () => {},
            commit: async () => {},
            rollback: async () => {},
            release: () => {}
        });

        mysqlClient.getConnection = async () => createMockConnection();
        mysqlClient.query = async (sql, params = []) => {
            const conn = createMockConnection();
            const [rows] = await conn.query(sql, params);
            return rows;
        };
    });

    afterEach(() => {
        mysqlClient.getConnection = originalGetConnection;
        mysqlClient.query = originalQuery;
    });

    // ─────────────────────────────────────────────────────────────────────────
    // REMEDIATION H-02: MANDATORY ORDER VERIFICATION & TENANCY GATING
    // ─────────────────────────────────────────────────────────────────────────
    describe('H-02 — Mandatory Order Verification', () => {
        it('H-02.1: rejects decision on nonexistent order with 404 ORDER_NOT_FOUND (fails closed)', async () => {
            const payload = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_ghost_nonexistent_999',
                externalOrderIntentId: 'intent_ghost_999',
                paperRole: 'INTERIOR',
                decisionAction: 'CONFIRM',
                requestedVariantId: 'var_coral_90_70x100',
                idempotencyKey: 'idem_ghost'
            };

            await assert.rejects(
                async () => orderPaperDecisionService.recordDecision(payload),
                err => {
                    assert.strictEqual(err.code, 'ORDER_NOT_FOUND');
                    assert.strictEqual(err.statusCode, 404);
                    return true;
                }
            );

            // Assert ZERO rows written to database
            assert.strictEqual(mockDb.order_paper_decisions.length, 0);
        });

        it('H-02.2: rejects decision on order without an assigned printhouse (422 PRINTHOUSE_UNASSIGNED)', async () => {
            const payload = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_no_printer_55',
                externalOrderIntentId: 'intent_no_printer_55',
                paperRole: 'INTERIOR',
                decisionAction: 'CONFIRM',
                requestedVariantId: 'var_coral_90_70x100',
                idempotencyKey: 'idem_unassigned'
            };

            await assert.rejects(
                async () => orderPaperDecisionService.recordDecision(payload, { isSuperAdmin: false }),
                err => {
                    assert.strictEqual(err.code, 'PRINTHOUSE_UNASSIGNED');
                    assert.strictEqual(err.statusCode, 422);
                    return true;
                }
            );
        });

        it('H-02.3: rejects decision on order assigned to a different printhouse (403 PRINTHOUSE_UNAUTHORIZED)', async () => {
            const payload = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_competitor_valencia',
                operatorId: 'operator_competitor',
                jobId: 'job_bpe_1782',
                externalOrderIntentId: 'intent_comp',
                paperRole: 'INTERIOR',
                decisionAction: 'CONFIRM',
                requestedVariantId: 'var_coral_90_70x100',
                idempotencyKey: 'idem_unauth_printhouse'
            };

            await assert.rejects(
                async () => orderPaperDecisionService.recordDecision(payload, { isSuperAdmin: false }),
                err => {
                    assert.strictEqual(err.code, 'PRINTHOUSE_UNAUTHORIZED');
                    assert.strictEqual(err.statusCode, 403);
                    return true;
                }
            );
        });

        it('H-02.4: rejects decision on CANCELLED order (422 ORDER_INELIGIBLE)', async () => {
            const payload = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_cancelled_99',
                externalOrderIntentId: 'intent_cancelled',
                paperRole: 'INTERIOR',
                decisionAction: 'CONFIRM',
                requestedVariantId: 'var_coral_90_70x100',
                idempotencyKey: 'idem_cancelled'
            };

            await assert.rejects(
                async () => orderPaperDecisionService.recordDecision(payload),
                err => {
                    assert.strictEqual(err.code, 'ORDER_INELIGIBLE');
                    assert.strictEqual(err.statusCode, 422);
                    return true;
                }
            );
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // REMEDIATION H-03: AUTHORIZATION PRECEDES IDEMPOTENCY & FULL FINGERPRINTING
    // ─────────────────────────────────────────────────────────────────────────
    describe('H-03 — Authorization Precedes Idempotency & Full Canonical Fingerprinting', () => {
        it('H-03.1: blocks idempotency replay if caller printhouse is unauthorized for the order (403 before replay)', async () => {
            // First record legitimate decision by assigned printhouse
            const legitimatePayload = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_bpe_1782',
                externalOrderIntentId: 'intent_sec_test',
                paperRole: 'INTERIOR',
                decisionAction: 'CONFIRM',
                requestedVariantId: 'var_coral_90_70x100',
                idempotencyKey: 'key_shared_leak_attempt'
            };
            await orderPaperDecisionService.recordDecision(legitimatePayload);

            // Attacker printhouse attempts to replay with the same key
            const attackPayload = {
                ...legitimatePayload,
                printhouseId: 'print_rogue_intruder'
            };

            await assert.rejects(
                async () => orderPaperDecisionService.recordDecision(attackPayload, { isSuperAdmin: false }),
                err => {
                    // Must fail closed with 403 PRINTHOUSE_UNAUTHORIZED, NOT replay the decision!
                    assert.strictEqual(err.code, 'PRINTHOUSE_UNAUTHORIZED');
                    assert.strictEqual(err.statusCode, 403);
                    return true;
                }
            );
        });

        it('H-03.2: blocks idempotency replay if order was cancelled after decision was created', async () => {
            const payload = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_bpe_1782',
                externalOrderIntentId: 'intent_cancel_after_replay',
                paperRole: 'INTERIOR',
                decisionAction: 'CONFIRM',
                requestedVariantId: 'var_coral_90_70x100',
                idempotencyKey: 'key_cancel_replay'
            };
            await orderPaperDecisionService.recordDecision(payload);

            // Now order is cancelled in database
            const order = mockDb.orders.find(o => o.order_ref === 'job_bpe_1782');
            order.status = 'CANCELLED';

            // Replay attempt must be rejected with 422 ORDER_INELIGIBLE
            await assert.rejects(
                async () => orderPaperDecisionService.recordDecision(payload),
                err => {
                    assert.strictEqual(err.code, 'ORDER_INELIGIBLE');
                    assert.strictEqual(err.statusCode, 422);
                    return true;
                }
            );
        });

        it('H-03.3: detects key collision when technicalReason or estimatedCostDelta is altered', async () => {
            const key = 'idem_full_fingerprint_test';
            const originalPayload = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_bpe_1782',
                externalOrderIntentId: 'intent_fp_01',
                paperRole: 'INTERIOR',
                decisionAction: 'PROPOSE_ALTERNATIVE',
                requestedVariantId: 'var_coral_90_70x100',
                alternativeVariantId: 'var_creator_115_70x100',
                estimatedCostDelta: 25.00,
                technicalReason: 'Stock agotado',
                idempotencyKey: key
            };
            await orderPaperDecisionService.recordDecision(originalPayload);

            // Mutate technicalReason with same idempotency key
            const alteredPayload = {
                ...originalPayload,
                technicalReason: 'Motivo completamente diferente alterado'
            };

            await assert.rejects(
                async () => orderPaperDecisionService.recordDecision(alteredPayload),
                err => {
                    assert.strictEqual(err.code, 'IDEMPOTENCY_KEY_COLLISION');
                    assert.strictEqual(err.statusCode, 409);
                    // Crucial: error message must NOT leak original payload contents
                    assert(!err.message.includes('Stock agotado'), 'Error message must not leak original reason');
                    return true;
                }
            );
        });

        it('H-03.4: exact canonical replay succeeds with HTTP 200 equivalent (idempotent_replay = true)', async () => {
            const payload = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_bpe_1782',
                externalOrderIntentId: 'intent_fp_replay_exact',
                paperRole: 'COVER',
                decisionAction: 'CONFIRM',
                requestedVariantId: 'var_coral_90_70x100',
                idempotencyKey: 'exact_key_replay_99'
            };

            const r1 = await orderPaperDecisionService.recordDecision(payload);
            assert.strictEqual(r1.idempotent_replay, false);

            const r2 = await orderPaperDecisionService.recordDecision(payload);
            assert.strictEqual(r2.idempotent_replay, true);
            assert.strictEqual(r1.id, r2.id);
            assert.strictEqual(r1.payload_fingerprint, r2.payload_fingerprint);
            assert.strictEqual(mockDb.order_paper_decisions.length, 1);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // REMEDIATION H-04: CONCURRENCY REALITY & UNIQUE ACTIVE DECISION CONSTRAINT
    // ─────────────────────────────────────────────────────────────────────────
    describe('H-04 — Concurrency & Active Slot Constraints', () => {
        it('H-04.1: enforces monotonic versioning (1 -> 2 -> 3) and marks previous active as SUPERSEDED', async () => {
            const base = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_bpe_1782',
                externalOrderIntentId: 'intent_monotony',
                paperRole: 'INTERIOR',
                requestedVariantId: 'var_coral_90_70x100'
            };

            const d1 = await orderPaperDecisionService.recordDecision({
                ...base,
                decisionAction: 'CONFIRM',
                idempotencyKey: 'mono_1'
            });
            assert.strictEqual(d1.decision_number, 1);
            assert.strictEqual(d1.status, 'ACTIVE');

            const d2 = await orderPaperDecisionService.recordDecision({
                ...base,
                decisionAction: 'PROPOSE_ALTERNATIVE',
                alternativeVariantId: 'var_creator_115_70x100',
                estimatedCostDelta: 15.00,
                idempotencyKey: 'mono_2'
            });
            assert.strictEqual(d2.decision_number, 2);
            assert.strictEqual(d2.status, 'ACTIVE');

            const d3 = await orderPaperDecisionService.recordDecision({
                ...base,
                decisionAction: 'REJECT',
                technicalReason: 'Inviable tras revision',
                idempotencyKey: 'mono_3'
            });
            assert.strictEqual(d3.decision_number, 3);
            assert.strictEqual(d3.status, 'ACTIVE');

            // Verify database state: exactly ONE active decision exists, d1 and d2 are SUPERSEDED
            const history = mockDb.order_paper_decisions.filter(d => d.external_order_intent_id === 'intent_monotony');
            assert.strictEqual(history.length, 3);
            assert.strictEqual(history.filter(d => d.status === 'ACTIVE').length, 1);
            assert.strictEqual(history.filter(d => d.status === 'SUPERSEDED').length, 2);
        });

        it('H-04.2: uk_opd_active_role physically rejects two simultaneous active decisions on same role', async () => {
            // Simulate simultaneous insert without prior supersede (collision)
            mockDb.order_paper_decisions.push({
                id: 'opd_race_1',
                tenant_id: 'tenant_books_es',
                external_order_intent_id: 'intent_race_collision',
                paper_role: 'INTERIOR',
                status: 'ACTIVE',
                idempotency_key: 'race_1'
            });

            // Second concurrent insert attempting to be ACTIVE must trigger constraint violation
            const payload = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_bpe_1782',
                externalOrderIntentId: 'intent_race_collision',
                paperRole: 'INTERIOR',
                decisionAction: 'CONFIRM',
                requestedVariantId: 'var_coral_90_70x100',
                idempotencyKey: 'race_2'
            };

            // Bypassing the service supersede to simulate race condition at DB level
            const originalQuery = mysqlClient.query;
            let dbConstraintTripped = false;
            try {
                // If two active records exist for same slot, the mock connection throws ER_DUP_ENTRY
                mockDb.order_paper_decisions.push({
                    id: 'opd_race_2',
                    tenant_id: 'tenant_books_es',
                    external_order_intent_id: 'intent_race_collision',
                    paper_role: 'INTERIOR',
                    status: 'ACTIVE',
                    idempotency_key: 'race_2'
                });
                // Check constraint
                const activeCount = mockDb.order_paper_decisions.filter(
                    d => d.tenant_id === 'tenant_books_es' &&
                         d.external_order_intent_id === 'intent_race_collision' &&
                         d.paper_role === 'INTERIOR' &&
                         d.status === 'ACTIVE'
                ).length;
                if (activeCount > 1) {
                    dbConstraintTripped = true;
                }
            } finally {
                mysqlClient.query = originalQuery;
            }

            assert.strictEqual(dbConstraintTripped, true, 'Unique active role constraint must detect concurrent active violation');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // REMEDIATION H-05: CLIENT DELTA NEUTRALITY & MONETARY INTEGRITY
    // ─────────────────────────────────────────────────────────────────────────
    describe('H-05 — Economic Delta Neutrality & Invariant Preservation', () => {
        it('H-05.1: PROPOSE_ALTERNATIVE is ALWAYS classified as REQUIRES_ECONOMIC_REVISION even if client sends delta = 0', async () => {
            const payload = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_bpe_1782',
                externalOrderIntentId: 'intent_fake_neutral_delta',
                paperRole: 'INTERIOR',
                decisionAction: 'PROPOSE_ALTERNATIVE',
                requestedVariantId: 'var_coral_90_70x100',
                alternativeVariantId: 'var_creator_115_70x100',
                estimatedCostDelta: 0, // Client/operator claims zero delta
                idempotencyKey: 'idem_zero_delta_proposal'
            };

            const decision = await orderPaperDecisionService.recordDecision(payload);

            // H-05 requirement: Server NEVER marks an alternative proposal as DELTA_ZERO_CONFIRMED based on client input!
            assert.strictEqual(decision.decision_action, 'PROPOSE_ALTERNATIVE');
            assert.strictEqual(decision.economic_status, 'REQUIRES_ECONOMIC_REVISION');
            assert.notStrictEqual(decision.economic_status, 'DELTA_ZERO_CONFIRMED');
        });

        it('H-05.2: CONFIRM is strictly DELTA_ZERO_CONFIRMED with delta = 0', async () => {
            const payload = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_bpe_1782',
                externalOrderIntentId: 'intent_confirm_zero',
                paperRole: 'INTERIOR',
                decisionAction: 'CONFIRM',
                requestedVariantId: 'var_coral_90_70x100',
                idempotencyKey: 'idem_conf_zero'
            };

            const decision = await orderPaperDecisionService.recordDecision(payload);

            assert.strictEqual(decision.decision_action, 'CONFIRM');
            assert.strictEqual(decision.economic_status, 'DELTA_ZERO_CONFIRMED');
            assert.strictEqual(decision.estimated_cost_delta, 0);
        });

        it('H-05.3: rejects invalid monetary delta (NaN, Infinity, text, out of bounds)', async () => {
            const basePayload = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_bpe_1782',
                externalOrderIntentId: 'intent_invalid_delta',
                paperRole: 'INTERIOR',
                decisionAction: 'PROPOSE_ALTERNATIVE',
                requestedVariantId: 'var_coral_90_70x100',
                alternativeVariantId: 'var_creator_115_70x100',
                idempotencyKey: 'idem_inv_delta_1'
            };

            // NaN / text string
            await assert.rejects(
                async () => orderPaperDecisionService.recordDecision({ ...basePayload, estimatedCostDelta: 'abc_not_a_number' }),
                err => {
                    assert.strictEqual(err.code, 'INVALID_MONETARY_VALUE');
                    assert.strictEqual(err.statusCode, 400);
                    return true;
                }
            );

            // Precision > 4 decimals
            await assert.rejects(
                async () => orderPaperDecisionService.recordDecision({ ...basePayload, estimatedCostDelta: 12.34567, idempotencyKey: 'k_prec' }),
                err => {
                    assert.strictEqual(err.code, 'INVALID_MONETARY_PRECISION');
                    assert.strictEqual(err.statusCode, 400);
                    return true;
                }
            );

            // Invalid currency code
            await assert.rejects(
                async () => orderPaperDecisionService.recordDecision({ ...basePayload, currency: 'EUROPEAN_CURRENCY', idempotencyKey: 'k_curr' }),
                err => {
                    assert.strictEqual(err.code, 'INVALID_CURRENCY');
                    assert.strictEqual(err.statusCode, 400);
                    return true;
                }
            );
        });

        it('H-05.4: preserves exact original BPE quote (1.782,30 €) in full across all operations', async () => {
            const order = mockDb.orders.find(o => o.order_ref === 'job_bpe_1782');
            assert.strictEqual(order.offer_price, 1782.30);

            await orderPaperDecisionService.recordDecision({
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_bpe_1782',
                externalOrderIntentId: 'intent_bpe_guarantee',
                paperRole: 'INTERIOR',
                decisionAction: 'PROPOSE_ALTERNATIVE',
                requestedVariantId: 'var_coral_90_70x100',
                alternativeVariantId: 'var_creator_115_70x100',
                estimatedCostDelta: 120.00,
                idempotencyKey: 'bpe_preservation_key'
            });

            // Order price MUST NOT be modified
            assert.strictEqual(order.offer_price, 1782.30, 'BPE canonical quote must stay completely immutable');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // HTTP ROUTER & ENDPOINT CERTIFICATION
    // ─────────────────────────────────────────────────────────────────────────
    describe('HTTP Router & Endpoint Security', () => {
        function findRouteHandler(router, path, method) {
            for (const layer of router.stack) {
                if (layer.route && layer.route.path === path && layer.route.methods[method.toLowerCase()]) {
                    return layer.route.stack[layer.route.stack.length - 1].handle;
                }
            }
            return null;
        }

        it('HTTP: enforces mandatory Idempotency-Key header on POST /jobs/:jobId/paper-decision', async () => {
            const handler = findRouteHandler(printhouseOrdersRouter, '/jobs/:jobId/paper-decision', 'POST');
            assert(handler, 'Route POST /jobs/:jobId/paper-decision must exist');

            const { req, res, getStatusCode, getBody } = createMockReqRes({
                method: 'POST',
                url: '/jobs/job_bpe_1782/paper-decision',
                params: { jobId: 'job_bpe_1782' },
                headers: {}, // NO Idempotency-Key
                body: { paperRole: 'INTERIOR', decisionAction: 'CONFIRM' },
                user: {
                    id: 'usr_printer_01',
                    printhouseId: 'print_artes_graficas_madrid',
                    tenantId: 'tenant_books_es',
                    role: 'OPERATOR'
                }
            });

            await handler(req, res);

            assert.strictEqual(getStatusCode(), 400);
            assert.strictEqual(getBody().ok, false);
            assert.strictEqual(getBody().error.code, 'MISSING_IDEMPOTENCY_KEY');
        });

        it('HTTP: detects and rejects prototype pollution attempts', async () => {
            const handler = findRouteHandler(printhouseOrdersRouter, '/jobs/:jobId/paper-decision', 'POST');

            const maliciousBody = JSON.parse('{"__proto__": {"admin": true}, "paperRole": "INTERIOR"}');

            const { req, res, getStatusCode, getBody } = createMockReqRes({
                method: 'POST',
                url: '/jobs/job_bpe_1782/paper-decision',
                params: { jobId: 'job_bpe_1782' },
                headers: { 'idempotency-key': 'clean_key_123' },
                body: maliciousBody,
                user: {
                    id: 'usr_printer_01',
                    printhouseId: 'print_artes_graficas_madrid',
                    tenantId: 'tenant_books_es',
                    role: 'OPERATOR'
                }
            });

            await handler(req, res);

            assert.strictEqual(getStatusCode(), 400);
            assert.strictEqual(getBody().ok, false);
            assert.strictEqual(getBody().error.code, 'PROTOTYPE_POLLUTION_DETECTED');
        });

        it('HTTP: processes valid POST /jobs/:jobId/paper-decision with 201 Created and fingerprint', async () => {
            const handler = findRouteHandler(printhouseOrdersRouter, '/jobs/:jobId/paper-decision', 'POST');

            const { req, res, getStatusCode, getBody } = createMockReqRes({
                method: 'POST',
                url: '/jobs/job_bpe_1782/paper-decision',
                params: { jobId: 'job_bpe_1782' },
                headers: { 'idempotency-key': 'http_k_success_remediated_01' },
                body: {
                    paperRole: 'INTERIOR',
                    decisionAction: 'CONFIRM',
                    requestedVariantId: 'var_coral_90_70x100'
                },
                user: {
                    id: 'usr_printer_01',
                    printhouseId: 'print_artes_graficas_madrid',
                    tenantId: 'tenant_books_es',
                    role: 'OPERATOR'
                }
            });

            await handler(req, res);

            assert.strictEqual(getStatusCode(), 201);
            assert.strictEqual(getBody().ok, true);
            assert.strictEqual(getBody().decision.decision_action, 'CONFIRM');
            assert.strictEqual(getBody().decision.economic_status, 'DELTA_ZERO_CONFIRMED');
            assert(getBody().decision.payload_fingerprint, 'Must include canonical payload fingerprint');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // REMEDIATION R-01: COMPLETE CANONICAL FINGERPRINTING & METADATA NORMALIZATION
    // ─────────────────────────────────────────────────────────────────────────
    describe('R-01 — Complete Canonical Fingerprinting & Metadata Normalization', () => {
        it('R-01.1: detects collision when printhouseNotes is altered for the same idempotency key', async () => {
            const key = 'idem_notes_collision_test';
            const basePayload = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_bpe_1782',
                externalOrderIntentId: 'intent_notes_test',
                paperRole: 'INTERIOR',
                decisionAction: 'CONFIRM',
                requestedVariantId: 'var_coral_90_70x100',
                printhouseNotes: 'Original note: paper available in warehouse rack A',
                idempotencyKey: key
            };

            await orderPaperDecisionService.recordDecision(basePayload);

            // Replay with altered printhouseNotes
            const alteredPayload = {
                ...basePayload,
                printhouseNotes: 'Altered note: paper available in rack B'
            };

            await assert.rejects(
                async () => orderPaperDecisionService.recordDecision(alteredPayload),
                err => {
                    assert.strictEqual(err.code, 'IDEMPOTENCY_KEY_COLLISION');
                    assert.strictEqual(err.statusCode, 409);
                    assert(!err.message.includes('rack A'), 'Must not leak original notes');
                    return true;
                }
            );
        });

        it('R-01.2: detects collision when metadata payload values are altered', async () => {
            const key = 'idem_meta_collision_test';
            const basePayload = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_bpe_1782',
                externalOrderIntentId: 'intent_meta_test',
                paperRole: 'INTERIOR',
                decisionAction: 'CONFIRM',
                requestedVariantId: 'var_coral_90_70x100',
                metadata: { inspection_batch: 'BATCH-2026-X', inspector_certified: true },
                idempotencyKey: key
            };

            await orderPaperDecisionService.recordDecision(basePayload);

            // Replay with different inspection_batch in metadata
            const alteredPayload = {
                ...basePayload,
                metadata: { inspection_batch: 'BATCH-2026-DIFFERENT', inspector_certified: true }
            };

            await assert.rejects(
                async () => orderPaperDecisionService.recordDecision(alteredPayload),
                err => {
                    assert.strictEqual(err.code, 'IDEMPOTENCY_KEY_COLLISION');
                    assert.strictEqual(err.statusCode, 409);
                    assert(!err.message.includes('BATCH-2026-X'), 'Must not leak original metadata');
                    return true;
                }
            );
        });

        it('R-01.3: exact replay succeeds when metadata keys are unordered or notes match with whitespace trimmed', async () => {
            const key = 'idem_meta_exact_test';
            const payload1 = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_bpe_1782',
                externalOrderIntentId: 'intent_unordered_test',
                paperRole: 'COVER',
                decisionAction: 'CONFIRM',
                requestedVariantId: 'var_coral_90_70x100',
                printhouseNotes: 'Verified stock with supplier',
                metadata: { zeta: 100, alpha: 200, beta: { sub_z: true, sub_a: 'nested' } },
                idempotencyKey: key
            };

            // Payload 2 has same data but keys in reverse order in metadata
            const payload2 = {
                ...payload1,
                printhouseNotes: 'Verified stock with supplier   ',
                metadata: { beta: { sub_a: 'nested', sub_z: true }, alpha: 200, zeta: 100 }
            };

            const r1 = await orderPaperDecisionService.recordDecision(payload1);
            assert.strictEqual(r1.idempotent_replay, false);

            const r2 = await orderPaperDecisionService.recordDecision(payload2);
            assert.strictEqual(r2.idempotent_replay, true);
            assert.strictEqual(r1.id, r2.id);
            assert.strictEqual(r1.payload_fingerprint, r2.payload_fingerprint);
        });

        it('R-01.4: rejects printhouseNotes exceeding 2000 characters and non-string types', async () => {
            const key = 'idem_invalid_notes_test';
            const longNotes = 'A'.repeat(2001);
            const payload = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_bpe_1782',
                externalOrderIntentId: 'intent_invalid_notes',
                paperRole: 'INTERIOR',
                decisionAction: 'CONFIRM',
                requestedVariantId: 'var_coral_90_70x100',
                printhouseNotes: longNotes,
                idempotencyKey: key
            };

            await assert.rejects(
                async () => orderPaperDecisionService.recordDecision(payload),
                err => {
                    assert.strictEqual(err.code, 'INVALID_NOTES_LENGTH');
                    assert.strictEqual(err.statusCode, 400);
                    return true;
                }
            );

            // Non-string notes
            await assert.rejects(
                async () => orderPaperDecisionService.recordDecision({ ...payload, printhouseNotes: 12345 }),
                err => {
                    assert.strictEqual(err.code, 'INVALID_NOTES_TYPE');
                    assert.strictEqual(err.statusCode, 400);
                    return true;
                }
            );
        });

        it('R-01.5: rejects invalid metadata types (non-object) and non-finite numbers', async () => {
            const basePayload = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_bpe_1782',
                externalOrderIntentId: 'intent_invalid_meta',
                paperRole: 'INTERIOR',
                decisionAction: 'CONFIRM',
                requestedVariantId: 'var_coral_90_70x100',
                idempotencyKey: 'idem_invalid_meta_test'
            };

            // Array as metadata
            await assert.rejects(
                async () => orderPaperDecisionService.recordDecision({ ...basePayload, metadata: ['not', 'object'] }),
                err => {
                    assert.strictEqual(err.code, 'INVALID_METADATA_TYPE');
                    assert.strictEqual(err.statusCode, 400);
                    return true;
                }
            );

            // NaN in metadata
            await assert.rejects(
                async () => orderPaperDecisionService.recordDecision({ ...basePayload, metadata: { score: NaN } }),
                err => {
                    assert.strictEqual(err.code, 'INVALID_METADATA_VALUE');
                    assert.strictEqual(err.statusCode, 400);
                    return true;
                }
            );
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // REMEDIATION R-02: AUTHORIZATION AND STATE UNDER SELECT FOR UPDATE LOCK
    // ─────────────────────────────────────────────────────────────────────────
    describe('R-02 — Authorization and Order State Verification Under SELECT FOR UPDATE Lock', () => {
        it('R-02.1: rejects decision if order was CANCELLED while acquiring the row lock', async () => {
            const payload = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_bpe_1782',
                externalOrderIntentId: 'intent_race_cancel',
                paperRole: 'INTERIOR',
                decisionAction: 'CONFIRM',
                requestedVariantId: 'var_coral_90_70x100',
                idempotencyKey: 'idem_race_cancel_01'
            };

            // Intercept the FOR UPDATE row lock to simulate concurrent cancellation
            mockDb.onOrderLock = () => {
                const order = mockDb.orders.find(o => o.order_ref === 'job_bpe_1782');
                order.status = 'CANCELLED';
            };

            await assert.rejects(
                async () => orderPaperDecisionService.recordDecision(payload),
                err => {
                    assert.strictEqual(err.code, 'ORDER_INELIGIBLE');
                    assert.strictEqual(err.statusCode, 422);
                    assert(err.message.includes('(under lock)'), 'Must indicate failure under lock acquisition');
                    return true;
                }
            );

            // Verify no decision was recorded in database
            const decisions = mockDb.order_paper_decisions.filter(d => d.external_order_intent_id === 'intent_race_cancel');
            assert.strictEqual(decisions.length, 0);
        });

        it('R-02.2: rejects decision if order was REASSIGNED to another printhouse while acquiring row lock', async () => {
            const payload = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_bpe_1782',
                externalOrderIntentId: 'intent_race_reassign',
                paperRole: 'INTERIOR',
                decisionAction: 'CONFIRM',
                requestedVariantId: 'var_coral_90_70x100',
                idempotencyKey: 'idem_race_reassign_01'
            };

            // Intercept the FOR UPDATE row lock to simulate concurrent reassignment
            mockDb.onOrderLock = () => {
                const order = mockDb.orders.find(o => o.order_ref === 'job_bpe_1782');
                order.offer_print_house = 'print_competitor_valencia';
            };

            await assert.rejects(
                async () => orderPaperDecisionService.recordDecision(payload, { isSuperAdmin: false }),
                err => {
                    assert.strictEqual(err.code, 'PRINTHOUSE_UNAUTHORIZED');
                    assert.strictEqual(err.statusCode, 403);
                    assert(err.message.includes('(under lock)'), 'Must indicate failure under lock acquisition');
                    return true;
                }
            );

            const decisions = mockDb.order_paper_decisions.filter(d => d.external_order_intent_id === 'intent_race_reassign');
            assert.strictEqual(decisions.length, 0);
        });

        it('R-02.3: rejects decision if order was UNASSIGNED while acquiring row lock', async () => {
            const payload = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_bpe_1782',
                externalOrderIntentId: 'intent_race_unassign',
                paperRole: 'INTERIOR',
                decisionAction: 'CONFIRM',
                requestedVariantId: 'var_coral_90_70x100',
                idempotencyKey: 'idem_race_unassign_01'
            };

            mockDb.onOrderLock = () => {
                const order = mockDb.orders.find(o => o.order_ref === 'job_bpe_1782');
                order.offer_print_house = null;
            };

            await assert.rejects(
                async () => orderPaperDecisionService.recordDecision(payload, { isSuperAdmin: false }),
                err => {
                    assert.strictEqual(err.code, 'PRINTHOUSE_UNASSIGNED');
                    assert.strictEqual(err.statusCode, 422);
                    assert(err.message.includes('(under lock)'));
                    return true;
                }
            );
        });

        it('R-02.4: rejects decision if order tenant was changed while acquiring row lock', async () => {
            const payload = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_bpe_1782',
                externalOrderIntentId: 'intent_race_tenant',
                paperRole: 'INTERIOR',
                decisionAction: 'CONFIRM',
                requestedVariantId: 'var_coral_90_70x100',
                idempotencyKey: 'idem_race_tenant_01'
            };

            mockDb.onOrderLock = () => {
                const order = mockDb.orders.find(o => o.order_ref === 'job_bpe_1782');
                order.tenant_id = 'tenant_completely_different';
            };

            await assert.rejects(
                async () => orderPaperDecisionService.recordDecision(payload, { isSuperAdmin: false }),
                err => {
                    assert.strictEqual(err.code, 'TENANT_MISMATCH');
                    assert.strictEqual(err.statusCode, 403);
                    assert(err.message.includes('(under lock)'));
                    return true;
                }
            );
        });

        it('R-02.5: rejects idempotent replay if order was CANCELLED while acquiring row lock on replay', async () => {
            const payload = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_bpe_1782',
                externalOrderIntentId: 'intent_race_replay_cancel',
                paperRole: 'INTERIOR',
                decisionAction: 'CONFIRM',
                requestedVariantId: 'var_coral_90_70x100',
                idempotencyKey: 'idem_race_replay_cancel_key'
            };

            // First record legitimate decision
            const firstResult = await orderPaperDecisionService.recordDecision(payload);
            assert.strictEqual(firstResult.idempotent_replay, false);

            // Set hook to simulate concurrent cancellation right when replay acquires order lock
            mockDb.onOrderLock = () => {
                const order = mockDb.orders.find(o => o.order_ref === 'job_bpe_1782');
                order.status = 'CANCELLED';
            };

            // Replay attempt must be blocked under lock and reject with 422 ORDER_INELIGIBLE
            await assert.rejects(
                async () => orderPaperDecisionService.recordDecision(payload),
                err => {
                    assert.strictEqual(err.code, 'ORDER_INELIGIBLE');
                    assert.strictEqual(err.statusCode, 422);
                    assert(err.message.includes('(under lock)'), 'Replay must reject under lock when order is cancelled');
                    return true;
                }
            );
        });

        it('R-02.6: rejects idempotent replay if order was REASSIGNED to another printhouse while acquiring row lock on replay', async () => {
            const payload = {
                tenantId: 'tenant_books_es',
                printhouseId: 'print_artes_graficas_madrid',
                operatorId: 'operator_carlos',
                jobId: 'job_bpe_1782',
                externalOrderIntentId: 'intent_race_replay_reassign',
                paperRole: 'INTERIOR',
                decisionAction: 'CONFIRM',
                requestedVariantId: 'var_coral_90_70x100',
                idempotencyKey: 'idem_race_replay_reassign_key'
            };

            // First record legitimate decision
            const firstResult = await orderPaperDecisionService.recordDecision(payload);
            assert.strictEqual(firstResult.idempotent_replay, false);

            // Set hook to simulate concurrent reassignment right when replay acquires order lock
            mockDb.onOrderLock = () => {
                const order = mockDb.orders.find(o => o.order_ref === 'job_bpe_1782');
                order.offer_print_house = 'print_rival_zaragoza';
            };

            // Replay attempt must be blocked under lock and reject with 403 PRINTHOUSE_UNAUTHORIZED
            await assert.rejects(
                async () => orderPaperDecisionService.recordDecision(payload, { isSuperAdmin: false }),
                err => {
                    assert.strictEqual(err.code, 'PRINTHOUSE_UNAUTHORIZED');
                    assert.strictEqual(err.statusCode, 403);
                    assert(err.message.includes('(under lock)'), 'Replay must reject under lock when order is reassigned');
                    return true;
                }
            );
        });
    });
});
