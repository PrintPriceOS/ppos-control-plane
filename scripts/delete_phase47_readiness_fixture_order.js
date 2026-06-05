const db = require('../src/api/services/mysqlClient');

async function deleteFixtures() {
    try {
        console.log(`Searching for Phase 47.5 fixtures to delete...`);

        const orders = await db.query(`
            SELECT order_id, metadata_json 
            FROM marketplace_orders 
            WHERE JSON_EXTRACT(metadata_json, '$.fixture') = true
              AND JSON_EXTRACT(metadata_json, '$.phase') = '47.5'
        `);

        if (orders.length === 0) {
            console.log(`No fixtures found.`);
            process.exit(0);
        }

        for (const order of orders) {
            console.log(`Deleting fixture order: ${order.order_id}`);

            await db.query(`DELETE FROM marketplace_order_events WHERE order_id = ?`, [order.order_id]);
            await db.query(`DELETE FROM marketplace_order_preflight_bindings WHERE order_id = ?`, [order.order_id]);
            await db.query(`DELETE FROM marketplace_order_files WHERE order_id = ?`, [order.order_id]);
            await db.query(`DELETE FROM marketplace_orders WHERE order_id = ?`, [order.order_id]);
            
            console.log(`Deleted order ${order.order_id} successfully.`);
        }

        process.exit(0);
    } catch (err) {
        console.error('Failed to delete fixtures:', err);
        process.exit(1);
    }
}

deleteFixtures();
