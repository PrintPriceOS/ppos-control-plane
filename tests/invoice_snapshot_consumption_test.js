const assert = require('assert');
const GovernedInvoiceBuilderService = require('../src/api/services/governedInvoiceBuilderService');
const mysqlClient = require('../src/api/services/mysqlClient');

async function runTests() {
    console.log("=== Running Invoice Snapshot Consumption Tests (Phase 190.2) ===");
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

    const builderSvc = new GovernedInvoiceBuilderService();
    const actorAdmin = { userId: 'admin1', role: 'FINANCE_ADMIN' };

    let mockSnaps = [];

    mysqlClient.getPool = () => ({
        query: async (sql, params) => {
            if (sql.includes('SELECT * FROM order_pricing_snapshots WHERE snapshot_id = ? AND status = "SEALED"')) {
                const s = mockSnaps.find(s => s.snapshot_id === params[0]);
                return [s ? [s] : []];
            }
            throw new Error("Unhandled query: " + sql);
        }
    });

    await runTest("Invoice uses exact sealed amount", async () => {
        const canonicalizer = require('../src/api/services/pricingSnapshotCanonicalizer');
        const snapPayload = { finalAmount: 133.88 };
        const checksum = canonicalizer.calculatePricingSnapshotChecksum(snapPayload);

        mockSnaps = [{
            snapshot_id: 'ops_123',
            status: 'SEALED',
            final_amount: '133.88',
            snapshot_json: JSON.stringify(snapPayload),
            snapshot_checksum: checksum
        }];
        
        const orderData = {
            order_id: 'ord_1',
            tenant_id: 't1',
            currency: 'EUR',
            active_pricing_snapshot_id: 'ops_123' // points to sealed snapshot
        };

        const inv = await builderSvc.buildGovernedInvoice({ orderData, taxSnapshot: null, reconciliationSnapshot: null, actor: actorAdmin });
        
        assert.strictEqual(inv.subtotal_amount, 133.88);
        assert.ok(inv.source_snapshot_json.pricingSnapshot, "Pricing snapshot must be attached");
        assert.strictEqual(inv.source_snapshot_json.pricingSnapshot.final_amount, '133.88');
    });

    await runTest("Invoice uses LEGACY_INVOICE_SOURCE fallback amount for historical order", async () => {
        const orderData = {
            order_id: 'ord_2',
            tenant_id: 't1',
            currency: 'EUR',
            source_type: 'LEGACY_INVOICE_SOURCE',
            amount: 99.99,
            created_at: '2026-06-10T12:00:00Z' // Before cutover
        };

        const inv = await builderSvc.buildGovernedInvoice({ orderData, taxSnapshot: null, reconciliationSnapshot: null, actor: actorAdmin });
        assert.strictEqual(inv.subtotal_amount, 99.99);
    });

    await runTest("New order cannot use legacy fallback", async () => {
        const orderData = {
            order_id: 'ord_3',
            tenant_id: 't1',
            currency: 'EUR',
            source_type: 'LEGACY_INVOICE_SOURCE',
            amount: 99.99,
            created_at: '2026-08-10T12:00:00Z' // After cutover
        };

        try {
            await builderSvc.buildGovernedInvoice({ orderData, taxSnapshot: null, reconciliationSnapshot: null, actor: actorAdmin });
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.code, 'INVOICE_PRICING_SNAPSHOT_REQUIRED');
        }
    });

    await runTest("Order with active pricing snapshot rejects legacy fallback", async () => {
        mockSnaps = [{ snapshot_id: 'ops_123', status: 'SEALED', final_amount: '133.88' }];
        const orderData = {
            order_id: 'ord_legacy_conflict',
            tenant_id: 't1',
            currency: 'EUR',
            source_type: 'LEGACY_INVOICE_SOURCE',
            amount: 99.99,
            created_at: '2026-06-10T12:00:00Z',
            active_pricing_snapshot_id: 'ops_123'
        };

        try {
            await builderSvc.buildGovernedInvoice({ orderData, taxSnapshot: null, reconciliationSnapshot: null, actor: actorAdmin });
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.code, 'INVOICE_PRICING_SNAPSHOT_REQUIRED');
            assert.ok(e.message.includes('cannot use legacy fallback'));
        }
    });

    await runTest("Missing snapshot fails closed", async () => {
        const orderData = {
            order_id: 'ord_3',
            tenant_id: 't1',
            currency: 'EUR',
            active_pricing_snapshot_id: null
        };

        try {
            await builderSvc.buildGovernedInvoice({ orderData, taxSnapshot: null, reconciliationSnapshot: null, actor: actorAdmin });
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.code, 'INVOICE_PRICING_SNAPSHOT_REQUIRED');
        }
    });

    await runTest("Invalid or unsealed snapshot fails closed", async () => {
        mockSnaps = []; // Snap not found
        const orderData = {
            order_id: 'ord_4',
            tenant_id: 't1',
            currency: 'EUR',
            active_pricing_snapshot_id: 'ops_999'
        };

        try {
            await builderSvc.buildGovernedInvoice({ orderData, taxSnapshot: null, reconciliationSnapshot: null, actor: actorAdmin });
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.code, 'INVOICE_PRICING_SNAPSHOT_REQUIRED');
            assert.ok(e.message.includes('not found or not sealed'));
        }
    });

    await runTest("Checksum corruption fails closed", async () => {
        const canonicalizer = require('../src/api/services/pricingSnapshotCanonicalizer');
        const snapPayload = { finalAmount: 133.88 };
        // Valid checksum
        const checksum = canonicalizer.calculatePricingSnapshotChecksum(snapPayload);

        mockSnaps = [{
            snapshot_id: 'ops_corrupt',
            status: 'SEALED',
            final_amount: '133.88',
            snapshot_json: JSON.stringify({ finalAmount: 999.99 }), // Tampered JSON
            snapshot_checksum: checksum
        }];
        
        const orderData = {
            order_id: 'ord_corrupt',
            tenant_id: 't1',
            currency: 'EUR',
            active_pricing_snapshot_id: 'ops_corrupt'
        };

        try {
            await builderSvc.buildGovernedInvoice({ orderData, taxSnapshot: null, reconciliationSnapshot: null, actor: actorAdmin });
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.code, 'SNAPSHOT_INTEGRITY_CHECK_FAILED');
        }
    });

    console.log(`\nTests completed. Passed: ${passed}, Failed: ${failed}`);
    if (failed > 0) process.exit(1);
}

runTests().catch(console.error);
