const path = require('path');
const db = require(path.join(process.cwd(), 'src/api/services/mysqlClient'));

async function inspect() {
    try {
        const tables = ['printer_nodes', 'print_nodes', 'print_node_machine_profiles', 'printer_pricing_profiles', 'jobs', 'metrics'];
        for (const table of tables) {
            console.log(`--- Table: ${table} ---`);
            try {
                const columns = await db.query(`DESCRIBE ${table}`);
                console.table(columns[0] || columns);
            } catch (e) {
                console.log(`Error describing ${table}: ${e.message}`);
            }
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

inspect();
