/**
 * scripts/test-phase36-invoice-gate.js
 * 
 * High-fidelity verification test suite for Phase 36.5: Invoice Gate from Preflight Outcome.
 * Validates Rule A (FILES_REQUIRED), Rule B (PREFLIGHT_REQUIRED), Rule C (PREFLIGHT_BLOCKED),
 * Rule D (READY_FOR_INVOICE), and Rule E (Manual Overrides).
 * Sets up a mock Relational Database client and starts a temporary Express server.
 */

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const db = require('../src/api/services/mysqlClient');
const adminMarketplaceOrdersRouter = require('../src/api/routes/adminMarketplaceOrders');
const service = require('../src/api/services/marketplaceInvoiceGateService');

const TEST_PORT = 9992;
const BASE_URL = `http://localhost:${TEST_PORT}/api/admin/marketplace/orders`;
const BREAK_GLASS_TOKEN = 'test_break_glass_token_36_5';

process.env.PPOS_CONTROL_TOKEN = BREAK_GLASS_TOKEN;
process.env.ENABLE_BREAK_GLASS_TOKEN = 'true';
process.env.JWT_SECRET = 'test_jwt_secret_xyz123';

const memoryDb = {
    marketplace_orders: [],
    marketplace_order_files: [],
    marketplace_order_events: []
};

let isMockMode = false;

// Mock SQL Relational Engine
function installMockEngine() {
    isMockMode = true;
    db.query = async (sql, params = []) => {
        const cleanSql = sql.replace(/\s+/g, ' ').trim();
        
        // SELECT
        if (cleanSql.toUpperCase().startsWith('SELECT')) {
            if (cleanSql.includes('FROM marketplace_orders WHERE order_id = ?')) {
                return memoryDb.marketplace_orders.filter(o => o.order_id === params[0]);
            }
            if (cleanSql.includes('FROM marketplace_order_files WHERE order_id = ?')) {
                return memoryDb.marketplace_order_files.filter(f => f.order_id === params[0]);
            }
            if (cleanSql.includes('SELECT 1')) {
                return [{ 1: 1 }];
            }
        }

        // UPDATE
        if (cleanSql.toUpperCase().startsWith('UPDATE')) {
            if (cleanSql.includes('UPDATE marketplace_orders')) {
                const orderId = params[params.length - 1];
                const order = memoryDb.marketplace_orders.find(o => o.order_id === orderId);
                if (order) {
                    if (cleanSql.includes('metadata_json = ?') && cleanSql.includes('readiness_json = ?') && cleanSql.includes('status = ?')) {
                        order.metadata_json = params[0];
                        order.readiness_json = params[1];
                        order.status = params[2];
                    } else if (cleanSql.includes('readiness_json = ?') && cleanSql.includes('status = ?')) {
                        order.readiness_json = params[0];
                        order.status = params[1];
                    }
                }
                return { affectedRows: 1 };
            }
        }

        // INSERT
        if (cleanSql.toUpperCase().startsWith('INSERT INTO')) {
            if (cleanSql.includes('marketplace_order_events')) {
                const row = {
                    order_id: params[0],
                    type: params[1],
                    payload_json: params[2],
                    created_at: new Date()
                };
                memoryDb.marketplace_order_events.push(row);
                return { insertId: memoryDb.marketplace_order_events.length };
            }
        }

        return [];
    };
}

function clearMemoryDb() {
    memoryDb.marketplace_orders = [];
    memoryDb.marketplace_order_files = [];
    memoryDb.marketplace_order_events = [];
}

async function runTests() {
    console.log('\n=============================================================');
    console.log('🛡️  PHASE 36.5 INVOICE GATE VERIFICATION TESTS 🛡️');
    console.log('=============================================================\n');

    installMockEngine();

    // -------------------------------------------------------------
    // Set up Express application for route testing
    // -------------------------------------------------------------
    const app = express();
    app.use(express.json());
    app.use('/api/admin/marketplace/orders', adminMarketplaceOrdersRouter);
    const server = app.listen(TEST_PORT, () => {
        console.log(`  [OK] Express router test server listening on port ${TEST_PORT}.`);
    });

    const axiosConfig = {
        headers: {
            Authorization: `Bearer ${BREAK_GLASS_TOKEN}`
        }
    };

    try {
        const testOrderId = 'ord_test_gate_999';

        // =============================================================
        // [TEST 1/5] Rule A: Missing or Pending Upload Files
        // =============================================================
        console.log('\n[1/5] Testing Rule A (FILES_REQUIRED)...');
        clearMemoryDb();
        memoryDb.marketplace_orders.push({
            order_id: testOrderId,
            status: 'DRAFT',
            readiness_json: JSON.stringify({}),
            metadata_json: JSON.stringify({})
        });

        let result = await service.evaluateMarketplaceInvoiceGate(testOrderId);
        console.log('  -> Decision:', result.decision);
        console.log('  -> Invoice Ready:', result.invoiceReady);
        console.log('  -> Blockers:', result.blockers);
        if (!result.invoiceReady && result.decision === 'FILES_REQUIRED' && result.blockers.includes('MISSING_INTERIOR_SLOT')) {
            console.log('  [PASS] Rule A verified correctly.');
        } else {
            throw new Error('Rule A failed');
        }

        // =============================================================
        // [TEST 2/5] Rule B: Missing Preflight Job Binding
        // =============================================================
        console.log('\n[2/5] Testing Rule B (PREFLIGHT_REQUIRED)...');
        clearMemoryDb();
        memoryDb.marketplace_orders.push({
            order_id: testOrderId,
            status: 'DRAFT',
            readiness_json: JSON.stringify({}),
            metadata_json: JSON.stringify({})
        });
        memoryDb.marketplace_order_files.push(
            { order_id: testOrderId, role: 'INTERIOR_PDF', status: 'UPLOADED', preflight_job_id: null },
            { order_id: testOrderId, role: 'COVER_PDF', status: 'UPLOADED', preflight_job_id: null }
        );

        result = await service.evaluateMarketplaceInvoiceGate(testOrderId);
        console.log('  -> Decision:', result.decision);
        console.log('  -> Invoice Ready:', result.invoiceReady);
        console.log('  -> Blockers:', result.blockers);
        if (!result.invoiceReady && result.decision === 'PREFLIGHT_REQUIRED' && result.blockers.includes('PREFLIGHT_MISSING_INTERIOR_PDF')) {
            console.log('  [PASS] Rule B verified correctly.');
        } else {
            throw new Error('Rule B failed');
        }

        // =============================================================
        // [TEST 3/5] Rule C: Preflight Blocked (Degraded/Failed/Non-certifiable)
        // =============================================================
        console.log('\n[3/5] Testing Rule C (PREFLIGHT_BLOCKED)...');
        clearMemoryDb();
        memoryDb.marketplace_orders.push({
            order_id: testOrderId,
            status: 'DRAFT',
            readiness_json: JSON.stringify({}),
            metadata_json: JSON.stringify({})
        });
        memoryDb.marketplace_order_files.push(
            { order_id: testOrderId, role: 'INTERIOR_PDF', status: 'UPLOADED', preflight_job_id: 'job_123', preflight_status: 'DEGRADED', preflight_outcome_category: 'DEGRADED_ANALYSIS' },
            { order_id: testOrderId, role: 'COVER_PDF', status: 'UPLOADED', preflight_job_id: 'job_456', preflight_status: 'DEGRADED', preflight_outcome_category: 'DEGRADED_ANALYSIS' }
        );

        result = await service.evaluateMarketplaceInvoiceGate(testOrderId);
        console.log('  -> Decision:', result.decision);
        console.log('  -> Invoice Ready:', result.invoiceReady);
        console.log('  -> Recommended Action:', result.recommendedAction);
        console.log('  -> Blockers:', result.blockers);
        if (!result.invoiceReady && result.decision === 'PREFLIGHT_BLOCKED' && result.blockers.includes('PREFLIGHT_NON_CERTIFIABLE_INTERIOR_PDF')) {
            console.log('  [PASS] Rule C verified correctly.');
        } else {
            throw new Error('Rule C failed');
        }

        // =============================================================
        // [TEST 4/5] Rule D: Ready for Invoicing (Certifiable)
        // =============================================================
        console.log('\n[4/5] Testing Rule D (READY_FOR_INVOICE)...');
        clearMemoryDb();
        memoryDb.marketplace_orders.push({
            order_id: testOrderId,
            status: 'DRAFT',
            readiness_json: JSON.stringify({}),
            metadata_json: JSON.stringify({})
        });
        memoryDb.marketplace_order_files.push(
            { order_id: testOrderId, role: 'INTERIOR_PDF', status: 'UPLOADED', preflight_job_id: 'job_123', preflight_status: 'COMPLETED', preflight_outcome_category: 'PASS' },
            { order_id: testOrderId, role: 'COVER_PDF', status: 'UPLOADED', preflight_job_id: 'job_456', preflight_status: 'COMPLETED', preflight_outcome_category: 'PASS' }
        );

        result = await service.evaluateMarketplaceInvoiceGate(testOrderId);
        console.log('  -> Decision:', result.decision);
        console.log('  -> Invoice Ready:', result.invoiceReady);
        console.log('  -> Recommended Action:', result.recommendedAction);
        if (result.invoiceReady && result.decision === 'READY_FOR_INVOICE') {
            console.log('  [PASS] Rule D verified correctly.');
        } else {
            throw new Error('Rule D failed');
        }

        // =============================================================
        // [TEST 5/5] Rule E: Manual Override
        // =============================================================
        console.log('\n[5/5] Testing Rule E (READY_FOR_INVOICE_WITH_OVERRIDE)...');
        clearMemoryDb();
        memoryDb.marketplace_orders.push({
            order_id: testOrderId,
            status: 'DRAFT',
            readiness_json: JSON.stringify({}),
            metadata_json: JSON.stringify({
                invoice_override: {
                    enabled: true,
                    reason: 'Client explicitly approved slight margin overflow',
                    actor: 'operator-101'
                }
            })
        });
        memoryDb.marketplace_order_files.push(
            { order_id: testOrderId, role: 'INTERIOR_PDF', status: 'UPLOADED', preflight_job_id: 'job_123', preflight_status: 'DEGRADED', preflight_outcome_category: 'DEGRADED_ANALYSIS' },
            { order_id: testOrderId, role: 'COVER_PDF', status: 'UPLOADED', preflight_job_id: 'job_456', preflight_status: 'DEGRADED', preflight_outcome_category: 'DEGRADED_ANALYSIS' }
        );

        result = await service.evaluateMarketplaceInvoiceGate(testOrderId);
        console.log('  -> Decision:', result.decision);
        console.log('  -> Invoice Ready:', result.invoiceReady);
        console.log('  -> Warnings:', result.warnings);
        if (result.invoiceReady && result.decision === 'READY_FOR_INVOICE_WITH_OVERRIDE' && result.warnings.some(w => w.includes('Client explicitly approved'))) {
            console.log('  [PASS] Rule E verified correctly.');
        } else {
            throw new Error('Rule E failed');
        }

        // =============================================================
        // HTTP API Endpoints Routing Verification
        // =============================================================
        console.log('\n[HTTP-TEST] Verifying Admin API Routes...');
        
        // 1. Evaluate Route
        console.log('  POST /:id/invoice/evaluate');
        const evaluateRes = await axios.post(`${BASE_URL}/${testOrderId}/invoice/evaluate`, {}, axiosConfig);
        console.log('    HTTP status:', evaluateRes.status);
        console.log('    Response body decision:', evaluateRes.data.decision);
        if (evaluateRes.status === 200 && evaluateRes.data.ok && evaluateRes.data.decision === 'READY_FOR_INVOICE_WITH_OVERRIDE') {
            console.log('    [PASS] Evaluation route verification successful.');
        } else {
            throw new Error('POST /:id/invoice/evaluate failed');
        }

        // 2. Generate Route (Guarded Stub when Blocked)
        console.log('  POST /:id/invoice/generate (Blocked State)...');
        clearMemoryDb();
        memoryDb.marketplace_orders.push({
            order_id: testOrderId,
            status: 'DRAFT',
            readiness_json: JSON.stringify({}),
            metadata_json: JSON.stringify({}) // no override
        });
        memoryDb.marketplace_order_files.push(
            { order_id: testOrderId, role: 'INTERIOR_PDF', status: 'UPLOADED', preflight_job_id: 'job_123', preflight_status: 'DEGRADED', preflight_outcome_category: 'DEGRADED_ANALYSIS' },
            { order_id: testOrderId, role: 'COVER_PDF', status: 'UPLOADED', preflight_job_id: 'job_456', preflight_status: 'DEGRADED', preflight_outcome_category: 'DEGRADED_ANALYSIS' }
        );

        try {
            await axios.post(`${BASE_URL}/${testOrderId}/invoice/generate`, {}, axiosConfig);
            throw new Error('Route did not return 422 for blocked invoice');
        } catch (err) {
            if (err.response && err.response.status === 422) {
                console.log('    HTTP status:', err.response.status);
                console.log('    Response body error:', err.response.data.error);
                console.log('    [PASS] Generation route correctly blocked with HTTP 422.');
            } else {
                throw err;
            }
        }

        // 3. Generate Route (Guarded Stub when Ready)
        console.log('  POST /:id/invoice/generate (Ready State)...');
        clearMemoryDb();
        memoryDb.marketplace_orders.push({
            order_id: testOrderId,
            status: 'DRAFT',
            readiness_json: JSON.stringify({}),
            metadata_json: JSON.stringify({})
        });
        memoryDb.marketplace_order_files.push(
            { order_id: testOrderId, role: 'INTERIOR_PDF', status: 'UPLOADED', preflight_job_id: 'job_123', preflight_status: 'COMPLETED', preflight_outcome_category: 'PASS' },
            { order_id: testOrderId, role: 'COVER_PDF', status: 'UPLOADED', preflight_job_id: 'job_456', preflight_status: 'COMPLETED', preflight_outcome_category: 'PASS' }
        );

        const generateRes = await axios.post(`${BASE_URL}/${testOrderId}/invoice/generate`, {}, axiosConfig);
        console.log('    HTTP status:', generateRes.status);
        console.log('    Response message:', generateRes.data.message);
        if (generateRes.status === 200 && generateRes.data.ok && generateRes.data.message === 'READY_FOR_INVOICE') {
            console.log('    [PASS] Generation route correctly allowed ready invoice.');
        } else {
            throw new Error('POST /:id/invoice/generate failed in ready state');
        }

        // =============================================================
        // Smoke Order Verification: ord_1779175625669_zacrtp
        // =============================================================
        console.log('\n[SMOKE-TEST] Verifying smoke order: ord_1779175625669_zacrtp...');
        const smokeOrderId = 'ord_1779175625669_zacrtp';
        if (isMockMode) {
            // Seed the exact parameters from user prompt
            memoryDb.marketplace_orders.push({
                order_id: smokeOrderId,
                status: 'DRAFT',
                readiness_json: JSON.stringify({}),
                metadata_json: JSON.stringify({})
            });
            memoryDb.marketplace_order_files.push(
                { order_id: smokeOrderId, role: 'INTERIOR_PDF', status: 'UPLOADED', preflight_job_id: 'job_smoke_int', preflight_status: 'DEGRADED', preflight_outcome_category: 'DEGRADED_ANALYSIS', findings_count: 6 },
                { order_id: smokeOrderId, role: 'COVER_PDF', status: 'UPLOADED', preflight_job_id: 'job_smoke_cov', preflight_status: 'DEGRADED', preflight_outcome_category: 'DEGRADED_ANALYSIS', findings_count: 6 }
            );
        }

        const smokeRes = await axios.post(`${BASE_URL}/${smokeOrderId}/invoice/evaluate`, {}, axiosConfig);
        console.log('  -> HTTP Status:', smokeRes.status);
        console.log('  -> Decision:', smokeRes.data.decision);
        console.log('  -> Invoice Ready:', smokeRes.data.invoiceReady);
        console.log('  -> Recommended Action:', smokeRes.data.recommendedAction);
        console.log('  -> Blockers:', smokeRes.data.blockers);

        if (
            smokeRes.status === 200 &&
            smokeRes.data.ok &&
            smokeRes.data.decision === 'PREFLIGHT_BLOCKED' &&
            smokeRes.data.invoiceReady === false &&
            smokeRes.data.recommendedAction === 'FILE_REUPLOAD_REQUIRED' &&
            smokeRes.data.blockers.includes('PREFLIGHT_NON_CERTIFIABLE_INTERIOR_PDF') &&
            smokeRes.data.blockers.includes('PREFLIGHT_NON_CERTIFIABLE_COVER_PDF')
        ) {
            console.log('  [PASS] Smoke order ord_1779175625669_zacrtp returned exactly the expected blocking decision.');
        } else {
            throw new Error(`Smoke order check failed: ${JSON.stringify(smokeRes.data)}`);
        }

        console.log('\n=============================================================');
        console.log('✨  ALL INVOICE GATE VERIFICATION TESTS PASSED ✨');
        console.log('=============================================================\n');

    } catch (err) {
        console.error('\n🔴 FATAL FAILURE RUNNING GATE TESTS:');
        if (err.response) {
            console.error(`   HTTP Status: ${err.response.status}`);
            console.error(`   Body:`, JSON.stringify(err.response.data, null, 2));
        } else {
            console.error(`   Error message: ${err.message}`);
        }
        server.close();
        process.exit(1);
    }

    server.close();
    process.exit(0);
}

runTests();
