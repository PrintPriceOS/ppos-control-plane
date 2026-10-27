'use strict';

/**
 * tests/budget02b01_order_paper_decisions.test.js
 * 
 * BUDGET-02B-01: Governed Persistence & Paper Decision Contracts Certification Suite
 *
 * Verifies all 15 mandated certification scenarios:
 *  1. Valid Confirmation (CONFIRM)
 *  2. Valid Rejection (REJECT)
 *  3. Valid Alternative Proposal (PROPOSE_ALTERNATIVE)
 *  4. Nonexistent Variant Validation (404 VARIANT_NOT_FOUND)
 *  5. Wrong Tenant Isolation (403 TENANT_MISMATCH)
 *  6. Unauthorized Printhouse Assignment (403 PRINTHOUSE_UNAUTHORIZED)
 *  7. Nonexistent Order Handling
 *  8. Duplicate / Redundant Decision Handling
 *  9. Idempotency Replay with Same Key (200, idempotent_replay = true)
 * 10. Idempotency Key Reuse with Different Payload (409 IDEMPOTENCY_KEY_COLLISION)
 * 11. Concurrent / Sequential Decisions & Superseding (decision_number 1 -> 2)
 * 12. Cancelled Order Rejection (422 ORDER_INELIGIBLE)
 * 13. Persistence Failure & Transaction Rollback
 * 14. Immutable Conservation of Original BPE Quote (1.782,30 €)
 * 15. Decision History Integrity & Audit Trail
 *
 * Also certifies HTTP layer:
 * - Header 'Idempotency-Key' enforcement
 * - Prototype pollution defense
 * - Printhouse scope authorization
 */

const assert = require('assert');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_backend_secret_32_bytes_long_key_1234';
process.env.JWT_AUDIENCE = 'ppos:control';
process.env.JWT_ISSUER = 'https://auth.printprice.pro';

const mysqlClient = require('../src/api/services/mysqlClient');
const orderPaperDecisionService = require('../src/api/services/orderPaperDecisionService');
const printhouseOrdersRouter = require('../src/api/routes/printhouseOrders');

// Helper to create mock Express Req/Res
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

describe('BUDGET-02B-01 — Paper Decisions Domain Service & API Certification Suite', () => {
    let mockDb;
    let originalGetConnection;
    let originalQuery;

    beforeEach(() => {
        // In-memory relational state
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
                }
            ],
            order_paper_decisions: []
        };

        originalGetConnection = mysqlClient.getConnection;
        originalQuery = mysqlClient.query;

        // Mock database connection with transaction support
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

                // 2. SELECT order
                if (normSql.includes('FROM orders WHERE order_ref = ? OR id = ?')) {
                    const ref = params[0];
                    const ord = mockDb.orders.find(o => o.order_ref === ref || o.id === ref);
                    return ord ? [[{ ...ord }]] : [[]];
                }

                // 3. SELECT order_paper_decisions by idempotency key
                if (normSql.includes('FROM order_paper_decisions WHERE tenant_id = ? AND idempotency_key = ?')) {
                    const [tId, key] = params;
                    const found = mockDb.order_paper_decisions.filter(d => d.tenant_id === tId && d.idempotency_key === key);
                    return [[...found]];
                }

                // 4. SELECT order_paper_decisions by order & role FOR UPDATE
                if (normSql.includes('FROM order_paper_decisions WHERE tenant_id = ? AND external_order_intent_id = ? AND paper_role = ?')) {
                    const [tId, extId, role] = params;
                    const found = mockDb.order_paper_decisions.filter(
                        d => d.tenant_id === tId && d.external_order_intent_id === extId && d.paper_role === role
                    );
                    return [[...found]];
                }

                // 5. UPDATE order_paper_decisions SET status = 'SUPERSEDED'
                if (normSql.includes("UPDATE order_paper_decisions SET status = 'SUPERSEDED'")) {
                    const [tId, extId, role] = params;
                    mockDb.order_paper_decisions.forEach(d => {
                        if (d.tenant_id === tId && d.external_order_intent_id === extId && d.paper_role === role && d.status === 'ACTIVE') {
                            d.status = 'SUPERSEDED';
                        }
                    });
                    return [{ affectedRows: 1 }];
                }

                // 6. INSERT INTO order_paper_decisions
                if (normSql.startsWith('INSERT INTO order_paper_decisions')) {
                    const record = {
                        id: params[0],
                        tenant_id: params[1],
                        external_order_intent_id: params[2],
                        canonical_order_id: params[3],
                        printhouse_tenant_id: params[4],
                        operator_id: params[5],
                        paper_role: params[6],
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
                        status: params[21],
                        idempotency_key: params[22],
                        metadata_json: params[23],
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };
                    mockDb.order_paper_decisions.push(record);
                    return [{ affectedRows: 1 }];
                }

                // 7. SELECT order_paper_decisions WHERE id = ?
                if (normSql.includes('FROM order_paper_decisions WHERE id = ?')) {
                    const dId = params[0];
                    const found = mockDb.order_paper_decisions.find(d => d.id === dId);
                    return found ? [[{ ...found }]] : [[]];
                }

                // 8. SELECT order_paper_decisions by order intent / canonical order
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
    // 1. VALID CONFIRMATION (CONFIRM)
    // ─────────────────────────────────────────────────────────────────────────
    it('Scenario 1: executes valid CONFIRM with Delta = 0, status DELTA_ZERO_CONFIRMED and snapshot', async () => {
        const payload = {
            tenantId: 'tenant_books_es',
            printhouseId: 'print_artes_graficas_madrid',
            operatorId: 'operator_carlos',
            jobId: 'job_bpe_1782',
            externalOrderIntentId: 'intent_2026_01',
            paperRole: 'INTERIOR',
            decisionAction: 'CONFIRM',
            requestedVariantId: 'var_coral_90_70x100',
            idempotencyKey: 'idem_conf_01'
        };

        const decision = await orderPaperDecisionService.recordDecision(payload);

        assert.strictEqual(decision.decision_action, 'CONFIRM');
        assert.strictEqual(decision.paper_role, 'INTERIOR');
        assert.strictEqual(decision.economic_status, 'DELTA_ZERO_CONFIRMED');
        assert.strictEqual(decision.estimated_cost_delta, 0);
        assert.strictEqual(decision.decision_number, 1);
        assert.strictEqual(decision.status, 'ACTIVE');
        assert.strictEqual(decision.snapshot_requested.gsm, 90);
        assert.strictEqual(decision.snapshot_requested.category, 'UNCOATED');
        assert.strictEqual(decision.idempotent_replay, false);

        // Verify state in database
        assert.strictEqual(mockDb.order_paper_decisions.length, 1);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. VALID REJECTION (REJECT)
    // ─────────────────────────────────────────────────────────────────────────
    it('Scenario 2: executes valid REJECT reverting material to standard base spec', async () => {
        const payload = {
            tenantId: 'tenant_books_es',
            printhouseId: 'print_artes_graficas_madrid',
            operatorId: 'operator_carlos',
            jobId: 'job_bpe_1782',
            externalOrderIntentId: 'intent_2026_02',
            paperRole: 'COVER',
            decisionAction: 'REJECT',
            requestedVariantId: 'var_coral_90_70x100',
            technicalReason: 'Material fuera de plazo de suministro',
            idempotencyKey: 'idem_rej_01'
        };

        const decision = await orderPaperDecisionService.recordDecision(payload);

        assert.strictEqual(decision.decision_action, 'REJECT');
        assert.strictEqual(decision.paper_role, 'COVER');
        assert.strictEqual(decision.economic_status, 'REVISION_NOT_APPLICABLE');
        assert.strictEqual(decision.alternative_variant_id, null);
        assert.strictEqual(decision.technical_reason, 'Material fuera de plazo de suministro');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. VALID ALTERNATIVE PROPOSAL (PROPOSE_ALTERNATIVE)
    // ─────────────────────────────────────────────────────────────────────────
    it('Scenario 3: executes valid PROPOSE_ALTERNATIVE with economic decoupling (REQUIRES_ECONOMIC_REVISION)', async () => {
        const payload = {
            tenantId: 'tenant_books_es',
            printhouseId: 'print_artes_graficas_madrid',
            operatorId: 'operator_carlos',
            jobId: 'job_bpe_1782',
            externalOrderIntentId: 'intent_2026_03',
            paperRole: 'INTERIOR',
            decisionAction: 'PROPOSE_ALTERNATIVE',
            requestedVariantId: 'var_coral_90_70x100',
            alternativeVariantId: 'var_creator_115_70x100',
            estimatedCostDelta: 45.50,
            currency: 'EUR',
            technicalReason: 'Stock inmediato en 115g estucado seda',
            idempotencyKey: 'idem_prop_01'
        };

        const decision = await orderPaperDecisionService.recordDecision(payload);

        assert.strictEqual(decision.decision_action, 'PROPOSE_ALTERNATIVE');
        assert.strictEqual(decision.alternative_variant_id, 'var_creator_115_70x100');
        assert.strictEqual(decision.estimated_cost_delta, 45.50);
        assert.strictEqual(decision.economic_status, 'REQUIRES_ECONOMIC_REVISION');
        // Crucial: original BPE price (1.782,30 €) remains unaltered
        assert.strictEqual(mockDb.orders[0].offer_price, 1782.30);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. NONEXISTENT VARIANT VALIDATION
    // ─────────────────────────────────────────────────────────────────────────
    it('Scenario 4: rejects requestedVariantId not present in catalog with 404 VARIANT_NOT_FOUND', async () => {
        const payload = {
            tenantId: 'tenant_books_es',
            printhouseId: 'print_artes_graficas_madrid',
            operatorId: 'operator_carlos',
            jobId: 'job_bpe_1782',
            externalOrderIntentId: 'intent_2026_04',
            paperRole: 'INTERIOR',
            decisionAction: 'CONFIRM',
            requestedVariantId: 'var_phantom_nonexistent',
            idempotencyKey: 'idem_var_err'
        };

        await assert.rejects(
            async () => orderPaperDecisionService.recordDecision(payload),
            err => {
                assert.strictEqual(err.code, 'VARIANT_NOT_FOUND');
                assert.strictEqual(err.statusCode, 404);
                return true;
            }
        );
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 5. WRONG TENANT ISOLATION
    // ─────────────────────────────────────────────────────────────────────────
    it('Scenario 5: blocks cross-tenant decision with 403 TENANT_MISMATCH', async () => {
        const payload = {
            tenantId: 'tenant_attacker_foreign',
            printhouseId: 'print_artes_graficas_madrid',
            operatorId: 'operator_rogue',
            jobId: 'job_bpe_1782',
            externalOrderIntentId: 'intent_2026_05',
            paperRole: 'INTERIOR',
            decisionAction: 'CONFIRM',
            requestedVariantId: 'var_coral_90_70x100',
            idempotencyKey: 'idem_cross_tenant'
        };

        await assert.rejects(
            async () => orderPaperDecisionService.recordDecision(payload, { isSuperAdmin: false }),
            err => {
                assert.strictEqual(err.code, 'TENANT_MISMATCH');
                assert.strictEqual(err.statusCode, 403);
                return true;
            }
        );
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 6. UNAUTHORIZED PRINTHOUSE ASSIGNMENT
    // ─────────────────────────────────────────────────────────────────────────
    it('Scenario 6: blocks printhouse not assigned to order with 403 PRINTHOUSE_UNAUTHORIZED', async () => {
        const payload = {
            tenantId: 'tenant_books_es',
            printhouseId: 'print_unassigned_barcelona',
            operatorId: 'operator_lucas',
            jobId: 'job_bpe_1782',
            externalOrderIntentId: 'intent_2026_06',
            paperRole: 'INTERIOR',
            decisionAction: 'CONFIRM',
            requestedVariantId: 'var_coral_90_70x100',
            idempotencyKey: 'idem_unassigned_printhouse'
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

    // ─────────────────────────────────────────────────────────────────────────
    // 7. NONEXISTENT ORDER HANDLING
    // ─────────────────────────────────────────────────────────────────────────
    it('Scenario 7: allows standalone order intent resolution with embedded snapshots', async () => {
        const payload = {
            tenantId: 'tenant_books_es',
            printhouseId: 'print_artes_graficas_madrid',
            operatorId: 'operator_carlos',
            jobId: null,
            externalOrderIntentId: 'intent_pre_ingest_standalone_101',
            paperRole: 'INTERIOR',
            decisionAction: 'CONFIRM',
            requestedVariantId: 'var_coral_90_70x100',
            idempotencyKey: 'idem_pre_ingest_01'
        };

        const decision = await orderPaperDecisionService.recordDecision(payload);
        assert.strictEqual(decision.external_order_intent_id, 'intent_pre_ingest_standalone_101');
        assert.strictEqual(decision.snapshot_requested.gsm, 90);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 8. DUPLICATE DECISION HANDLING
    // ─────────────────────────────────────────────────────────────────────────
    it('Scenario 8: logs redundant duplicate confirmation gracefully without state corruption', async () => {
        const basePayload = {
            tenantId: 'tenant_books_es',
            printhouseId: 'print_artes_graficas_madrid',
            operatorId: 'operator_carlos',
            jobId: 'job_bpe_1782',
            externalOrderIntentId: 'intent_dup_test',
            paperRole: 'INTERIOR',
            decisionAction: 'CONFIRM',
            requestedVariantId: 'var_coral_90_70x100'
        };

        const d1 = await orderPaperDecisionService.recordDecision({ ...basePayload, idempotencyKey: 'k1' });
        const d2 = await orderPaperDecisionService.recordDecision({ ...basePayload, idempotencyKey: 'k2' });

        assert.strictEqual(d1.decision_number, 1);
        assert.strictEqual(d2.decision_number, 2);
        assert.strictEqual(d2.status, 'ACTIVE');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 9. IDEMPOTENCY REPLAY WITH SAME KEY
    // ─────────────────────────────────────────────────────────────────────────
    it('Scenario 9: replaying identical decision with same Idempotency-Key returns idempotent_replay = true', async () => {
        const payload = {
            tenantId: 'tenant_books_es',
            printhouseId: 'print_artes_graficas_madrid',
            operatorId: 'operator_carlos',
            jobId: 'job_bpe_1782',
            externalOrderIntentId: 'intent_replay_01',
            paperRole: 'INTERIOR',
            decisionAction: 'CONFIRM',
            requestedVariantId: 'var_coral_90_70x100',
            idempotencyKey: 'same_key_100'
        };

        const res1 = await orderPaperDecisionService.recordDecision(payload);
        assert.strictEqual(res1.idempotent_replay, false);

        const res2 = await orderPaperDecisionService.recordDecision(payload);
        assert.strictEqual(res2.idempotent_replay, true);
        assert.strictEqual(res1.id, res2.id);
        assert.strictEqual(mockDb.order_paper_decisions.length, 1);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 10. IDEMPOTENCY KEY REUSE WITH DIFFERENT PAYLOAD (409 CONFLICT)
    // ─────────────────────────────────────────────────────────────────────────
    it('Scenario 10: reusing same idempotency key with different payload triggers 409 IDEMPOTENCY_KEY_COLLISION', async () => {
        const key = 'shared_key_collision';
        const payload1 = {
            tenantId: 'tenant_books_es',
            printhouseId: 'print_artes_graficas_madrid',
            operatorId: 'operator_carlos',
            jobId: 'job_bpe_1782',
            externalOrderIntentId: 'intent_collision_01',
            paperRole: 'INTERIOR',
            decisionAction: 'CONFIRM',
            requestedVariantId: 'var_coral_90_70x100',
            idempotencyKey: key
        };

        await orderPaperDecisionService.recordDecision(payload1);

        const payload2 = {
            ...payload1,
            decisionAction: 'REJECT' // altered payload with same key
        };

        await assert.rejects(
            async () => orderPaperDecisionService.recordDecision(payload2),
            err => {
                assert.strictEqual(err.code, 'IDEMPOTENCY_KEY_COLLISION');
                assert.strictEqual(err.statusCode, 409);
                return true;
            }
        );
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 11. CONCURRENT / SEQUENTIAL DECISIONS & SUPERSEDING
    // ─────────────────────────────────────────────────────────────────────────
    it('Scenario 11: supersedes prior active decision, increments decision_number 1 -> 2', async () => {
        const p1 = {
            tenantId: 'tenant_books_es',
            printhouseId: 'print_artes_graficas_madrid',
            operatorId: 'operator_carlos',
            jobId: 'job_bpe_1782',
            externalOrderIntentId: 'intent_seq_01',
            paperRole: 'INTERIOR',
            decisionAction: 'CONFIRM',
            requestedVariantId: 'var_coral_90_70x100',
            idempotencyKey: 'seq_k1'
        };

        const d1 = await orderPaperDecisionService.recordDecision(p1);
        assert.strictEqual(d1.decision_number, 1);

        const p2 = {
            tenantId: 'tenant_books_es',
            printhouseId: 'print_artes_graficas_madrid',
            operatorId: 'operator_carlos',
            jobId: 'job_bpe_1782',
            externalOrderIntentId: 'intent_seq_01',
            paperRole: 'INTERIOR',
            decisionAction: 'PROPOSE_ALTERNATIVE',
            requestedVariantId: 'var_coral_90_70x100',
            alternativeVariantId: 'var_creator_115_70x100',
            estimatedCostDelta: 20.0,
            technicalReason: 'Rotura de stock inesperada',
            idempotencyKey: 'seq_k2'
        };

        const d2 = await orderPaperDecisionService.recordDecision(p2);
        assert.strictEqual(d2.decision_number, 2);
        assert.strictEqual(d2.status, 'ACTIVE');

        // Check that d1 was superseded
        const oldRow = mockDb.order_paper_decisions.find(d => d.id === d1.id);
        assert.strictEqual(oldRow.status, 'SUPERSEDED');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 12. CANCELLED ORDER REJECTION (422 ORDER_INELIGIBLE)
    // ─────────────────────────────────────────────────────────────────────────
    it('Scenario 12: rejects decision recording on CANCELLED order with 422 ORDER_INELIGIBLE', async () => {
        const payload = {
            tenantId: 'tenant_books_es',
            printhouseId: 'print_artes_graficas_madrid',
            operatorId: 'operator_carlos',
            jobId: 'job_cancelled_99',
            externalOrderIntentId: 'intent_cancelled_test',
            paperRole: 'INTERIOR',
            decisionAction: 'CONFIRM',
            requestedVariantId: 'var_coral_90_70x100',
            idempotencyKey: 'idem_cancel_check'
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

    // ─────────────────────────────────────────────────────────────────────────
    // 13. PERSISTENCE FAILURE & TRANSACTION ROLLBACK
    // ─────────────────────────────────────────────────────────────────────────
    it('Scenario 13: cleanly rolls back transaction when database write fails', async () => {
        let rolledBack = false;
        mysqlClient.getConnection = async () => ({
            query: async (sql) => {
                if (sql.includes('INSERT INTO order_paper_decisions')) {
                    throw new Error('SIMULATED_DISK_IO_FAILURE');
                }
                if (sql.includes('paper_variants')) {
                    return [[{
                        id: 'var_coral_90_70x100',
                        gsm: 90,
                        width_mm: 700,
                        height_mm: 1000,
                        finish: 'MATTE',
                        product_category: 'UNCOATED'
                    }]];
                }
                if (sql.includes('orders')) {
                    return [[{ id: '1', order_ref: 'o1', offer_print_house: 'ph1', tenant_id: 't1', status: 'ACTIVE' }]];
                }
                return [[]];
            },
            beginTransaction: async () => {},
            commit: async () => {},
            rollback: async () => { rolledBack = true; },
            release: () => {}
        });

        const payload = {
            tenantId: 't1',
            printhouseId: 'ph1',
            operatorId: 'op1',
            jobId: 'o1',
            externalOrderIntentId: 'intent_fail',
            paperRole: 'INTERIOR',
            decisionAction: 'CONFIRM',
            requestedVariantId: 'var_coral_90_70x100',
            idempotencyKey: 'key_fail'
        };

        await assert.rejects(
            async () => orderPaperDecisionService.recordDecision(payload),
            err => {
                assert.match(err.message, /SIMULATED_DISK_IO_FAILURE/);
                return true;
            }
        );

        assert.strictEqual(rolledBack, true, 'Transaction must be rolled back on persistence failure');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 14. IMMUTABLE CONSERVATION OF ORIGINAL BPE QUOTE (1.782,30 €)
    // ─────────────────────────────────────────────────────────────────────────
    it('Scenario 14: preserves exact original BPE quote (1.782,30 €) without mutation across decisions', async () => {
        const order = mockDb.orders.find(o => o.order_ref === 'job_bpe_1782');
        assert.strictEqual(order.offer_price, 1782.30);

        // Perform proposal with Delta != 0
        await orderPaperDecisionService.recordDecision({
            tenantId: 'tenant_books_es',
            printhouseId: 'print_artes_graficas_madrid',
            operatorId: 'operator_carlos',
            jobId: 'job_bpe_1782',
            externalOrderIntentId: 'intent_bpe_invariable',
            paperRole: 'INTERIOR',
            decisionAction: 'PROPOSE_ALTERNATIVE',
            requestedVariantId: 'var_coral_90_70x100',
            alternativeVariantId: 'var_creator_115_70x100',
            estimatedCostDelta: 85.00,
            idempotencyKey: 'bpe_delta_test'
        });

        // Verify order in database STILL has exactly 1782.30 €
        assert.strictEqual(order.offer_price, 1782.30, 'Original BPE quote must never be mutated in BUDGET-02B-01');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 15. DECISION HISTORY INTEGRITY & AUDIT TRAIL
    // ─────────────────────────────────────────────────────────────────────────
    it('Scenario 15: retrieves full decision history audit trail via listDecisionsForOrder', async () => {
        const intentId = 'intent_history_trail';

        await orderPaperDecisionService.recordDecision({
            tenantId: 'tenant_books_es',
            printhouseId: 'print_artes_graficas_madrid',
            operatorId: 'operator_carlos',
            jobId: 'job_bpe_1782',
            externalOrderIntentId: intentId,
            paperRole: 'INTERIOR',
            decisionAction: 'CONFIRM',
            requestedVariantId: 'var_coral_90_70x100',
            idempotencyKey: 'hist_k1'
        });

        await orderPaperDecisionService.recordDecision({
            tenantId: 'tenant_books_es',
            printhouseId: 'print_artes_graficas_madrid',
            operatorId: 'operator_carlos',
            jobId: 'job_bpe_1782',
            externalOrderIntentId: intentId,
            paperRole: 'COVER',
            decisionAction: 'REJECT',
            requestedVariantId: 'var_coral_90_70x100',
            idempotencyKey: 'hist_k2'
        });

        const history = await orderPaperDecisionService.listDecisionsForOrder('tenant_books_es', intentId);

        assert.strictEqual(history.length, 2);
        assert.strictEqual(history[0].paper_role, 'INTERIOR');
        assert.strictEqual(history[0].decision_action, 'CONFIRM');
        assert.strictEqual(history[1].paper_role, 'COVER');
        assert.strictEqual(history[1].decision_action, 'REJECT');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // HTTP ROUTER INTEGRATION & SECURITY CONTROLS
    // ─────────────────────────────────────────────────────────────────────────
    describe('HTTP Router & Endpoint Security Validations', () => {
        function findRouteHandler(router, path, method) {
            for (const layer of router.stack) {
                if (layer.route && layer.route.path === path && layer.route.methods[method.toLowerCase()]) {
                    // Return the last handler in route stack (the actual controller)
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
                url: '/jobs/job_123/paper-decision',
                params: { jobId: 'job_123' },
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
                url: '/jobs/job_123/paper-decision',
                params: { jobId: 'job_123' },
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

        it('HTTP: successfully processes valid POST /jobs/:jobId/paper-decision with 201 Created', async () => {
            const handler = findRouteHandler(printhouseOrdersRouter, '/jobs/:jobId/paper-decision', 'POST');

            const { req, res, getStatusCode, getBody } = createMockReqRes({
                method: 'POST',
                url: '/jobs/job_bpe_1782/paper-decision',
                params: { jobId: 'job_bpe_1782' },
                headers: { 'idempotency-key': 'http_k_success_01' },
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
        });
    });
});
