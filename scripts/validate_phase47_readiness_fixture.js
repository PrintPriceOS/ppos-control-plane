const db = require('../src/api/services/mysqlClient');
const humanReportSnapshotService = require('../src/api/services/preflightHumanReportSnapshotService');
const reviewApprovalService = require('../src/api/services/preflightReviewApprovalService');

async function validateFixture() {
    try {
        console.log(`Validating Phase 47.5 Readiness Fixtures...`);

        const jobId = 'fix_1780651634180';
        
        let orderIds = new Set();
        
        const bindings = await db.query(`SELECT order_id FROM marketplace_order_preflight_bindings WHERE preflight_job_id = ?`, [jobId]);
        bindings.forEach(b => orderIds.add(b.order_id));
        
        const files = await db.query(`SELECT order_id FROM marketplace_order_files WHERE preflight_job_id = ?`, [jobId]);
        files.forEach(f => orderIds.add(f.order_id));
        
        const ordersMeta = await db.query(`
            SELECT order_id 
            FROM marketplace_orders 
            WHERE JSON_EXTRACT(metadata_json, '$.fixture') = true
              AND JSON_EXTRACT(metadata_json, '$.phase') = '47.5'
        `);
        ordersMeta.forEach(o => orderIds.add(o.order_id));
        
        let validOrderId = null;
        let bindingCount = 0;
        let fileCount = 0;
        
        for (const oId of orderIds) {
            if (!oId || typeof oId !== 'string' || oId.trim().length === 0) continue;
            
            const parentOrder = await db.query(`SELECT order_id, metadata_json FROM marketplace_orders WHERE order_id = ?`, [oId]);
            if (parentOrder.length === 0) continue;
            
            const b = await db.query(`SELECT * FROM marketplace_order_preflight_bindings WHERE order_id = ?`, [oId]);
            const f = await db.query(`SELECT * FROM marketplace_order_files WHERE order_id = ?`, [oId]);
            
            if (b.length > 0 || f.length > 0) {
                validOrderId = oId;
                bindingCount = b.length;
                fileCount = f.length;
                break;
            }
        }
        
        if (!validOrderId) {
            console.log(`[ERROR] No fixture found. Please run create script first.`);
            process.exit(1);
        }
        
        const orderId = validOrderId;

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
        console.log(`ORDER_FOUND=true`);
        console.log(`BINDING_COUNT=${bindingCount}`);
        console.log(`FILE_COUNT=${fileCount}`);
        console.log(`ACTIVE_DECISION=${decisionRes.decision.decision}`);
        console.log(`REPORT_OUTCOME=${decisionRes.decision.report_outcome || 'FIXED_REVIEW_REQUIRED'}`);
        console.log(`FIXTURE_VALID=true`);
        console.log(`Run the following to validate in production:`);
        console.log(`curl -s -X POST "https://control.printprice.pro/api/marketplace/orders/${orderId}/readiness/recompute" -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" | jq '.'`);

        process.exit(0);
    } catch (err) {
        console.error('Failed to validate fixture:', err);
        process.exit(1);
    }
}

validateFixture();
