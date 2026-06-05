const db = require('../src/api/services/mysqlClient');

async function deleteFixtures() {
    try {
        const args = process.argv.slice(2);
        const isDryRun = args.includes('--dry-run');
        const isExecute = args.includes('--yes');
        
        if (!isDryRun && !isExecute) {
            console.log(`Please run with --dry-run or --yes`);
            process.exit(1);
        }

        console.log(`Searching for Phase 47.5 fixtures to delete...`);

        const orders = await db.query(`
            SELECT order_id 
            FROM marketplace_orders 
            WHERE order_id LIKE 'ord_phase47_fixture_%' 
               OR (JSON_EXTRACT(metadata_json, '$.fixture') = true AND JSON_EXTRACT(metadata_json, '$.phase') = '47.5')
        `);

        // Also search for orphans based on order_id pattern
        const orphanBindings = await db.query(`SELECT order_id FROM marketplace_order_preflight_bindings WHERE order_id LIKE 'ord_phase47_fixture_%'`);
        const orphanFiles = await db.query(`SELECT order_id FROM marketplace_order_files WHERE order_id LIKE 'ord_phase47_fixture_%'`);
        const orphanEvents = await db.query(`SELECT order_id FROM marketplace_order_events WHERE order_id LIKE 'ord_phase47_fixture_%'`);

        const rawOrderIds = [
            ...orders.map(o => o.order_id),
            ...orphanBindings.map(b => b.order_id),
            ...orphanFiles.map(f => f.order_id),
            ...orphanEvents.map(e => e.order_id)
        ];

        const validOrderIds = rawOrderIds.filter(id => typeof id === 'string' && id.trim().length > 0);
        const allOrderIds = new Set(validOrderIds);

        if (allOrderIds.size === 0) {
            console.log(`NO_VALID_FIXTURES_FOUND`);
            process.exit(0);
        }

        for (const orderId of allOrderIds) {
            if (isDryRun) {
                console.log(`[DRY RUN] Would delete fixture order: ${orderId}`);
            } else {
                console.log(`Deleting fixture order: ${orderId}`);
                await db.query(`DELETE FROM marketplace_order_events WHERE order_id = ?`, [orderId]);
                await db.query(`DELETE FROM marketplace_order_preflight_bindings WHERE order_id = ?`, [orderId]);
                await db.query(`DELETE FROM marketplace_order_files WHERE order_id = ?`, [orderId]);
                await db.query(`DELETE FROM marketplace_orders WHERE order_id = ?`, [orderId]);
                console.log(`Deleted order ${orderId} successfully.`);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error('Failed to delete fixtures:', err);
        process.exit(1);
    }
}

deleteFixtures();
