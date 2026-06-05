const db = require('../src/api/services/mysqlClient');

async function findOrder(jobId) {
    try {
        console.log(`Searching for marketplace order linked to preflight job: ${jobId}`);

        let orderMap = {};

        // 1. Search bindings table
        const bindings = await db.query(`
            SELECT * FROM marketplace_order_preflight_bindings 
            WHERE preflight_job_id = ?
        `, [jobId]);

        for (const b of bindings) {
            orderMap[b.order_id] = orderMap[b.order_id] || { bindings: 0, files: 0, order_found: false, fixture: false };
            orderMap[b.order_id].bindings++;
        }

        // 2. Search files table
        const files = await db.query(`
            SELECT * FROM marketplace_order_files 
            WHERE preflight_job_id = ?
        `, [jobId]);
        
        for (const f of files) {
            orderMap[f.order_id] = orderMap[f.order_id] || { bindings: 0, files: 0, order_found: false, fixture: false };
            orderMap[f.order_id].files++;
        }

        const orderIds = Object.keys(orderMap);

        if (orderIds.length === 0) {
            console.log(`No bindings or files found directly. Searching full JSON structures...`);
            
            const orders = await db.query(`
                SELECT order_id, status, readiness_json, metadata_json 
                FROM marketplace_orders 
                WHERE JSON_SEARCH(readiness_json, 'all', ?) IS NOT NULL
                   OR JSON_SEARCH(metadata_json, 'all', ?) IS NOT NULL
            `, [jobId, jobId]);
            
            for (const o of orders) {
                orderMap[o.order_id] = orderMap[o.order_id] || { bindings: 0, files: 0, order_found: true, fixture: false };
                orderMap[o.order_id].order_found = true;
                const meta = typeof o.metadata_json === 'string' ? JSON.parse(o.metadata_json) : (o.metadata_json || {});
                if (meta.fixture) orderMap[o.order_id].fixture = true;
            }
        }

        const finalOrderIds = Object.keys(orderMap);

        if (finalOrderIds.length === 0) {
            console.log(`[NOT_FOUND] No marketplace order is currently bound to preflight job ${jobId}.`);
            process.exit(0);
        }

        console.log(`[FOUND] Preflight job ${jobId} is bound to order(s):`);

        for (const orderId of finalOrderIds) {
            const rows = await db.query(`
                SELECT order_id, status, readiness_json, metadata_json 
                FROM marketplace_orders WHERE order_id = ?
            `, [orderId]);
            
            const info = orderMap[orderId];
            
            if (rows.length > 0) {
                info.order_found = true;
                const row = rows[0];
                const meta = typeof row.metadata_json === 'string' ? JSON.parse(row.metadata_json) : (row.metadata_json || {});
                if (meta.fixture) info.fixture = true;
            } else {
                info.order_found = false;
            }
            
            console.log(`ORDER_ID=${orderId}`);
            console.log(`order_found: ${info.order_found}`);
            console.log(`binding count: ${info.bindings}`);
            console.log(`file count: ${info.files}`);
            console.log(`fixture metadata: ${info.fixture}`);
            
            if (!info.order_found && (info.bindings > 0 || info.files > 0)) {
                if (orderId.startsWith('ord_phase47_fixture_')) {
                    console.log(`ORPHAN_FIXTURE_DETECTED`);
                } else {
                    console.log(`ORPHAN_BINDING_DETECTED`);
                }
            }
            console.log('---');
        }

        process.exit(0);
    } catch (err) {
        console.error('Error finding order:', err);
        process.exit(1);
    }
}

const jobId = process.argv[2];
if (!jobId) {
    console.error('Usage: node scripts/find_marketplace_order_by_preflight_job_phase47.js <jobId>');
    process.exit(1);
}

findOrder(jobId);
