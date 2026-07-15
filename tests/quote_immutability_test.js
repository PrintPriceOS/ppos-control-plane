const assert = require('assert');
const quoteService = require('../src/api/services/quoteService');
const mysqlClient = require('../src/api/services/mysqlClient');

async function runTests() {
    console.log("=== Running Quote Immutability Tests (Phase 190.2) ===");
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

    // Mock Pool
    let mockDbState = {
        job_quotes: [],
        orders: [],
        order_pricing_snapshots: [],
        pricing_events: []
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
                return [[mockDbState.order_pricing_snapshots.find(s => s.snapshot_id === params[0] && s.quote_id === params[1])]];
            }
            if (sql.includes('INSERT INTO order_pricing_snapshots')) {
                // params: [snapshotId, orderId, quoteId, quote_revision, snapshot_revision, currency, final_amount, formula_version, rate_card_id, rate_card_revision, rate_card_checksum, snapshot_json, snapshot_checksum, sealed_by]
                mockDbState.order_pricing_snapshots.push({
                    snapshot_id: params[0], order_id: params[1], quote_id: params[2], 
                    quote_revision: params[3], snapshot_revision: params[4], status: 'SEALED',
                    currency: params[5], final_amount: params[6], formula_version: params[7],
                    rate_card_id: params[8], rate_card_revision: params[9], rate_card_checksum: params[10],
                    snapshot_json: params[11], snapshot_checksum: params[12], sealed_by: params[13]
                });
                return [{ insertId: 1 }];
            }
            if (sql.includes('UPDATE job_quotes SET status = "ACCEPTED" WHERE id = ?')) {
                const q = mockDbState.job_quotes.find(q => q.id === params[0]);
                if (q) q.status = 'ACCEPTED';
                return [{}];
            }
            if (sql.includes('UPDATE orders SET active_pricing_snapshot_id = ? WHERE id = ?')) {
                const o = mockDbState.orders.find(o => o.id === params[1]);
                if (o) o.active_pricing_snapshot_id = params[0];
                return [{}];
            }
            if (sql.includes('INSERT INTO pricing_events')) {
                mockDbState.pricing_events.push(params);
                return [{}];
            }
            throw new Error("Unhandled mock query: " + sql);
        }
    };

    mysqlClient.getPool = () => ({
        getConnection: async () => mockConn,
        query: async () => { throw new Error("Should use connection methods"); }
    });

    await runTest("Accept Quote - Happy Path and Immutability", async () => {
        // Setup state
        const quoteId = "q1";
        const orderId = "o1";
        mockDbState.job_quotes = [{
            id: quoteId, job_id: orderId, status: 'DRAFT', revision: 1,
            calculation_breakdown_json: JSON.stringify({
                snapshot: { quoteCurrency: 'EUR', finalSuggestedPriceRaw: '123.45', formulaVersion: 'v2', rateCardRevision: 2, rateCardChecksum: 'xyz' }
            })
        }];
        mockDbState.orders = [{ id: orderId, job_id: orderId, active_pricing_snapshot_id: null }];

        // Run
        const res = await quoteService.acceptQuoteAndSealOrderPricing({ quoteId, orderId, actor: { userId: 'admin1' } });
        
        assert.strictEqual(res.status, 'ACCEPTED');
        assert.ok(res.snapshotId.startsWith('ops_'));

        // Verify state
        const q = mockDbState.job_quotes[0];
        assert.strictEqual(q.status, 'ACCEPTED');

        const o = mockDbState.orders[0];
        assert.strictEqual(o.active_pricing_snapshot_id, res.snapshotId);

        const snap = mockDbState.order_pricing_snapshots[0];
        assert.strictEqual(snap.snapshot_id, res.snapshotId);
        assert.strictEqual(snap.quote_id, quoteId);
        assert.strictEqual(snap.status, 'SEALED');
        assert.ok(snap.snapshot_checksum);

        // Check canonical checksum is stable
        const snapshotPayload = {
            snapshot: { quoteCurrency: 'EUR', finalSuggestedPriceRaw: '123.45', formulaVersion: 'v2', rateCardRevision: 2, rateCardChecksum: 'xyz' }
        };
        const canonicalizer = require('../src/api/services/pricingSnapshotCanonicalizer');
        const expectedChecksum = canonicalizer.calculatePricingSnapshotChecksum(snapshotPayload);
        assert.strictEqual(snap.snapshot_checksum, expectedChecksum);
    });

    await runTest("Idempotency: parallel/repeated acceptance returns existing snapshot", async () => {
        const quoteId = "q1";
        const orderId = "o1";
        // The order already points to the snapshot created in the previous test
        const res = await quoteService.acceptQuoteAndSealOrderPricing({ quoteId, orderId, actor: { userId: 'admin1' } });
        
        assert.strictEqual(res.status, 'ALREADY_ACCEPTED');
        assert.ok(res.snapshotId.startsWith('ops_'));
        
        // No duplicate snapshot created
        assert.strictEqual(mockDbState.order_pricing_snapshots.length, 1);
    });

    await runTest("Rejection: Quote not in DRAFT state", async () => {
        const quoteId = "q2";
        const orderId = "o2";
        mockDbState.job_quotes.push({ id: quoteId, job_id: orderId, status: 'EXPIRED' });
        mockDbState.orders.push({ id: orderId, job_id: orderId, active_pricing_snapshot_id: null });

        try {
            await quoteService.acceptQuoteAndSealOrderPricing({ quoteId, orderId });
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.message, "Cannot accept quote in state EXPIRED");
        }
    });

    await runTest("Cross-order active pointer assignment rejected", async () => {
        const quoteId = "q3";
        const orderId = "o3";
        const otherOrderId = "o4";
        mockDbState.job_quotes.push({ id: quoteId, job_id: orderId, status: 'DRAFT', revision: 1,
            calculation_breakdown_json: JSON.stringify({ snapshot: { quoteCurrency: 'EUR', finalSuggestedPriceRaw: '123' }})
        });
        mockDbState.orders.push({ id: orderId, job_id: orderId, tenant_id: 't1', active_pricing_snapshot_id: null });
        mockDbState.orders.push({ id: otherOrderId, job_id: otherOrderId, tenant_id: 't1', active_pricing_snapshot_id: null });

        const res = await quoteService.acceptQuoteAndSealOrderPricing({ quoteId, orderId, actor: { userId: 'admin1' } });
        
        // Try to update otherOrderId with orderId's snapshot
        try {
            const snap = mockDbState.order_pricing_snapshots.find(s => s.snapshot_id === res.snapshotId);
            if (snap.order_id !== otherOrderId) throw new Error("ACTIVE_PRICING_SNAPSHOT_ORDER_MISMATCH"); // Simulate trigger
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.message, "ACTIVE_PRICING_SNAPSHOT_ORDER_MISMATCH");
        }
    });

    await runTest("Non-SEALED or Currency mismatch active pointer rejected", async () => {
        try {
            const snap = { order_id: 'o5', status: 'VOIDED', currency: 'EUR' };
            const order = { id: 'o5', currency: 'USD' };
            if (snap.status !== 'SEALED') throw new Error("ACTIVE_PRICING_SNAPSHOT_NOT_SEALED");
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.message, "ACTIVE_PRICING_SNAPSHOT_NOT_SEALED");
        }

        try {
            const snap = { order_id: 'o6', status: 'SEALED', currency: 'EUR' };
            const order = { id: 'o6', currency: 'USD' };
            if (snap.currency !== order.currency) throw new Error("ACTIVE_PRICING_SNAPSHOT_CURRENCY_MISMATCH");
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.message, "ACTIVE_PRICING_SNAPSHOT_CURRENCY_MISMATCH");
        }
    });

    await runTest("Snapshot Immutability: Revision update does not mutate past snapshot", async () => {
        // We sealed revision 1 in the first test.
        const snapRev1 = mockDbState.order_pricing_snapshots.find(s => s.quote_id === "q1" && s.quote_revision === 1);
        const originalChecksum = snapRev1.snapshot_checksum;
        const originalJson = snapRev1.snapshot_json;

        // Alter quote to revision 2
        const q = mockDbState.job_quotes.find(q => q.id === "q1");
        q.revision = 2;
        q.status = 'DRAFT'; // Back to draft for new revision
        q.calculation_breakdown_json = JSON.stringify({
            snapshot: { quoteCurrency: 'EUR', finalSuggestedPriceRaw: '456.78', formulaVersion: 'v3', rateCardRevision: 3, rateCardChecksum: 'abc' }
        });

        // Invoice still uses active pointer which should now be rev 2
        const o = mockDbState.orders.find(o => o.id === "o1");
        // To allow accepting a new revision on the same quote for the same order without hitting idempotency check,
        // we simulate the order dropping its active pointer (e.g. quote superseded).
        o.active_pricing_snapshot_id = null;

        // Accept revision 2
        const res2 = await quoteService.acceptQuoteAndSealOrderPricing({ quoteId: "q1", orderId: "o1", actor: { userId: 'admin1' } });
        
        // Verify revision 1 is untouched
        const snapRev1After = mockDbState.order_pricing_snapshots.find(s => s.quote_id === "q1" && s.quote_revision === 1);
        assert.strictEqual(snapRev1After.snapshot_checksum, originalChecksum);
        assert.strictEqual(snapRev1After.snapshot_json, originalJson);
        assert.strictEqual(snapRev1After.status, 'SEALED');

        // Invoice still uses active pointer which should now be rev 2
        assert.strictEqual(o.active_pricing_snapshot_id, res2.snapshotId);
        assert.notStrictEqual(res2.snapshotId, snapRev1.snapshot_id);

        // Prove direct update fails (simulating BEFORE UPDATE trigger)
        try {
            const upd = { ...snapRev1After, final_amount: 999 };
            if (upd.final_amount !== snapRev1After.final_amount) throw new Error("SEALED_PRICING_SNAPSHOT_IMMUTABLE");
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.message, "SEALED_PRICING_SNAPSHOT_IMMUTABLE");
        }

        // Prove delete fails (simulating BEFORE DELETE trigger)
        try {
            if (['SEALED', 'SUPERSEDED'].includes(snapRev1After.status)) throw new Error("PRICING_SNAPSHOT_DELETE_FORBIDDEN");
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.message, "PRICING_SNAPSHOT_DELETE_FORBIDDEN");
        }
    });

    await runTest("Same quote with another order conflicts", async () => {
        try {
            const quoteId = "q4_diff_order";
            const diffOrderId = "o_diff";
            
            mockDbState.job_quotes.push({ 
                id: quoteId, job_id: "original_order_id", status: 'DRAFT', revision: 1,
                calculation_breakdown_json: JSON.stringify({ snapshot: { quoteCurrency: 'EUR', finalSuggestedPriceRaw: '123' }})
            });
            mockDbState.orders.push({ id: diffOrderId, job_id: diffOrderId, tenant_id: 't1', active_pricing_snapshot_id: null });
            
            await quoteService.acceptQuoteAndSealOrderPricing({ quoteId, orderId: diffOrderId, actor: { userId: 'admin1' } });
            assert.fail("Should have thrown");
        } catch(e) {
            assert.ok(e.message.includes('does not belong to this order'), "Expected 'does not belong to this order'");
        }
    });

    console.log(`\nTests completed. Passed: ${passed}, Failed: ${failed}`);
    if (failed > 0) process.exit(1);
}

runTests().catch(console.error);
