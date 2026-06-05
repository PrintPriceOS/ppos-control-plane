const db = require('../src/api/services/mysqlClient');
const humanReportSnapshotService = require('../src/api/services/preflightHumanReportSnapshotService');
const reviewApprovalService = require('../src/api/services/preflightReviewApprovalService');

async function validateFixture() {
    try {
        console.log(`Validating Phase 47.5 Readiness Fixtures...`);

        const orders = await db.query(`
            SELECT order_id, metadata_json 
            FROM marketplace_orders 
            WHERE JSON_EXTRACT(metadata_json, '$.fixture') = true
              AND JSON_EXTRACT(metadata_json, '$.phase') = '47.5'
        `);

        if (orders.length === 0) {
            console.log(`[ERROR] No fixture found. Please run create script first.`);
            process.exit(1);
        }

        const order = orders[orders.length - 1]; // take latest
        const orderId = order.order_id;
        const metadata = typeof order.metadata_json === 'string' ? JSON.parse(order.metadata_json) : order.metadata_json;

        console.log(`Found Fixture Order: ${orderId}`);
        
        if (metadata.preflight_job_id !== 'fix_1780651634180') {
            console.log(`[ERROR] Preflight job ID mismatch. Expected fix_1780651634180, got ${metadata.preflight_job_id}`);
            process.exit(1);
        }

        console.log(`[OK] Preflight Job binding correctly marked in metadata: fix_1780651634180`);

        const bindings = await db.query(`SELECT * FROM marketplace_order_preflight_bindings WHERE order_id = ?`, [orderId]);
        if (bindings.length === 0) {
            console.log(`[ERROR] No preflight bindings found for the fixture.`);
            process.exit(1);
        }

        console.log(`[OK] Preflight Bindings found: ${bindings.length}`);

        const snapshotRes = await humanReportSnapshotService.getLatestSnapshot('fix_1780651634180', { tenantId: 'ppos-production' });
        if (!snapshotRes.ok || !snapshotRes.snapshot_id) {
            console.log(`[ERROR] No Human Report snapshot found for fix_1780651634180`);
            process.exit(1);
        }

        console.log(`[OK] Human Report Snapshot found: ${snapshotRes.snapshot_id}`);

        const decisionRes = await reviewApprovalService.getLatestDecision('fix_1780651634180', { tenantId: 'ppos-production' });
        if (!decisionRes.ok || !decisionRes.decision) {
            console.log(`[ERROR] No Active Review Decision found for fix_1780651634180`);
            process.exit(1);
        }

        console.log(`[OK] Active Review Decision found: ${decisionRes.decision.decision}`);
        
        console.log(`\n================================`);
        console.log(`ORDER_ID=${orderId}`);
        console.log(`JOB_ID=fix_1780651634180`);
        console.log(`ACTIVE_DECISION=${decisionRes.decision.decision}`);
        console.log(`REPORT_OUTCOME=${decisionRes.decision.report_outcome || 'FIXED_REVIEW_REQUIRED'}`);
        console.log(`FIXTURE_VALID=true`);
        console.log(`================================\n`);
        console.log(`Run the following to validate in production:`);
        console.log(`curl -s -X POST "https://control.printprice.pro/api/marketplace/orders/${orderId}/readiness/recompute" -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" | jq '.'`);

        process.exit(0);
    } catch (err) {
        console.error('Failed to validate fixture:', err);
        process.exit(1);
    }
}

validateFixture();
