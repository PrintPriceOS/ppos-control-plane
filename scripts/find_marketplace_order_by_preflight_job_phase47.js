const db = require('../src/api/services/mysqlClient');

async function findOrder(jobId) {
    try {
        console.log(`Searching for marketplace order linked to preflight job: ${jobId}`);

        // Search bindings table
        const bindings = await db.query(`
            SELECT * FROM marketplace_order_preflight_bindings 
            WHERE preflight_job_id = ?
        `, [jobId]);

        let orderIds = bindings.map(b => b.order_id);

        if (orderIds.length === 0) {
            // Search file table
            const files = await db.query(`
                SELECT * FROM marketplace_order_files 
                WHERE preflight_job_id = ?
            `, [jobId]);
            orderIds = files.map(f => f.order_id);
        }

        if (orderIds.length === 0) {
            console.log(`No bindings or files found directly. Searching full JSON structures...`);
            
            // This is slow but guaranteed if bound
            const orders = await db.query(`
                SELECT order_id, status, readiness_json, metadata_json 
                FROM marketplace_orders 
                WHERE JSON_SEARCH(readiness_json, 'all', ?) IS NOT NULL
                   OR JSON_SEARCH(metadata_json, 'all', ?) IS NOT NULL
            `, [jobId, jobId]);
            
            orderIds = orders.map(o => o.order_id);
        }

        if (orderIds.length === 0) {
            console.log(`[NOT_FOUND] No marketplace order is currently bound to preflight job ${jobId}.`);
            process.exit(0);
        }

        const uniqueOrderIds = [...new Set(orderIds)];
        console.log(`[FOUND] Preflight job ${jobId} is bound to order(s): ${uniqueOrderIds.join(', ')}`);

        for (const orderId of uniqueOrderIds) {
            const rows = await db.query(`
                SELECT order_id, status, readiness_json, metadata_json 
                FROM marketplace_orders WHERE order_id = ?
            `, [orderId]);
            
            if (rows.length > 0) {
                const row = rows[0];
                console.log(`\n--- Order: ${row.order_id} ---`);
                console.log(`Status: ${row.status}`);
                console.log(`Readiness JSON:`);
                console.log(JSON.stringify(typeof row.readiness_json === 'string' ? JSON.parse(row.readiness_json) : row.readiness_json, null, 2));
            }
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
