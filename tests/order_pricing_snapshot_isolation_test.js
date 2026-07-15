const assert = require('assert');
const quoteService = require('../src/api/services/quoteService');
const mysqlClient = require('../src/api/services/mysqlClient');

async function runTests() {
    console.log("=== Running Order Pricing Snapshot Isolation Tests (Phase 190.2) ===");
    let passed = 0;
    let failed = 0;

    async function runTest(name, fn) {
        try {
            await fn();
            console.log(`✓ ${name}`);
            passed++;
        } catch (e) {
            console.error(`✗ ${name} - FAILED`);
            console.error(e.stack);
            failed++;
        }
    }

    let mockDbState = {
        job_quotes: [],
        orders: [],
        order_pricing_snapshots: []
    };

    const mockConn = {
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {},
        release: () => {},
        query: async (sql, params) => {
            if (sql.includes('SELECT * FROM job_quotes WHERE id = ? FOR UPDATE')) {
                return [[mockDbState.job_quotes.find(q => q.id === params[0])]];
            }
            if (sql.includes('SELECT * FROM orders WHERE id = ? FOR UPDATE')) {
                return [[mockDbState.orders.find(o => o.id === params[0])]];
            }
            if (sql.includes('SELECT * FROM order_pricing_snapshots WHERE snapshot_id = ? AND quote_id = ?')) {
                return [[]]; // Always return empty for existing check to force logic flow
            }
            return [{}]; // Mock out inserts/updates to succeed
        }
    };

    mysqlClient.getPool = () => ({
        getConnection: async () => mockConn,
        query: async () => { throw new Error("Should use connection methods"); }
    });

    await runTest("Cross-tenant sealing attempt blocked", async () => {
        mockDbState.job_quotes = [{
            id: 'q1', job_id: 'o1', status: 'DRAFT', tenant_id: 't_a',
            calculation_breakdown_json: JSON.stringify({ snapshot: {} })
        }];
        mockDbState.orders = [{
            id: 'o1', job_id: 'o1', tenant_id: 't_b', active_pricing_snapshot_id: null
        }];

        try {
            await quoteService.acceptQuoteAndSealOrderPricing({ quoteId: 'q1', orderId: 'o1' });
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.message, 'Cross-tenant sealing attempt blocked');
        }
    });

    await runTest("Printhouse mismatch blocked", async () => {
        mockDbState.job_quotes = [{
            id: 'q2', job_id: 'o2', status: 'DRAFT', tenant_id: 't_a', printer_id: 'ph_1',
            calculation_breakdown_json: JSON.stringify({ snapshot: {} })
        }];
        mockDbState.orders = [{
            id: 'o2', job_id: 'o2', tenant_id: 't_a', assigned_printhouse_id: 'ph_2', active_pricing_snapshot_id: null
        }];

        try {
            await quoteService.acceptQuoteAndSealOrderPricing({ quoteId: 'q2', orderId: 'o2' });
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.message, 'Quote printer does not match order assigned printhouse');
        }
    });

    await runTest("Successful same-tenant same-printhouse seal", async () => {
        mockDbState.job_quotes = [{
            id: 'q3', job_id: 'o3', status: 'DRAFT', tenant_id: 't_a', printer_id: 'ph_1',
            calculation_breakdown_json: JSON.stringify({ snapshot: {} })
        }];
        mockDbState.orders = [{
            id: 'o3', job_id: 'o3', tenant_id: 't_a', assigned_printhouse_id: 'ph_1', active_pricing_snapshot_id: null
        }];

        const res = await quoteService.acceptQuoteAndSealOrderPricing({ quoteId: 'q3', orderId: 'o3' });
        assert.strictEqual(res.status, 'ACCEPTED');
    });

    console.log(`\nTests completed. Passed: ${passed}, Failed: ${failed}`);
    if (failed > 0) process.exit(1);
}

runTests().catch(console.error);
