const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const { parseMigrationSql } = require('../src/api/services/migrationSqlParser');
const { runBootstrap } = require('./bootstrap_canonical_schema');

async function setup() {
    const host = process.env.TEST_MYSQL_HOST || '127.0.0.1';
    const port = parseInt(process.env.TEST_MYSQL_PORT || '3307', 10);
    const user = process.env.TEST_MYSQL_USER || 'root';
    const password = process.env.TEST_MYSQL_PASSWORD || 'root_password_ppos_2026';
    const schema = 'ppos_test_browser_live';

    console.log(`[SETUP-E2E-DB] Connecting to MySQL at ${host}:${port}...`);
    const admin = await mysql.createConnection({
        host,
        port,
        user,
        password,
        multipleStatements: true
    });

    console.log(`[SETUP-E2E-DB] Recreating clean test schema: ${schema}...`);
    await admin.query(`DROP DATABASE IF EXISTS \`${schema}\`;`);
    await admin.query(`CREATE DATABASE \`${schema}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await admin.end();

    const pool = mysql.createPool({
        host,
        port,
        user,
        password,
        database: schema,
        multipleStatements: true
    });

    process.env.PPOS_CI_EPHEMERAL_FIXTURES = 'true';
    process.env.CI = 'true';
    process.env.MYSQL_HOST = host;
    process.env.MYSQL_PORT = String(port);
    process.env.MYSQL_USER = user;
    process.env.MYSQL_PASSWORD = password;
    process.env.MYSQL_DATABASE = schema;

    console.log(`[SETUP-E2E-DB] Running canonical bootstrap on ${schema}...`);
    await runBootstrap({ host, database: schema, pool });

    console.log(`[SETUP-E2E-DB] Running migrations on ${schema}...`);
    const migrationsDir = path.join(__dirname, '../migrations');
    const reqMigrations = [
        '001_create_schema_version.sql',
        '007_mes_material_orchestration.sql',
        '015_phase76_printhouse_capabilities.sql',
        '139_phase191d_machine_capabilities_migration.sql',
        '140_phase191e_materials_capacity_leadtimes.sql',
        '158_phase195e_auth_sessions_and_mfa.sql',
        '162_phase196a_paper_suppliers_and_procurement_idempotency.sql',
        '163_phase196b_paper_products_and_import_staging.sql',
        '164_phase196c_supplier_paper_offers_and_revisions.sql',
        '165_phase196d_paper_supplier_offer_soft_delete_and_catalog_associations.sql',
        '166_phase196e_supplier_paper_procurement_orders.sql'
    ];

    for (const f of reqMigrations) {
        const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
        const parsed = parseMigrationSql(sql);
        for (const s of parsed.statements) {
            await pool.query(s);
        }
    }
    console.log('[SETUP-E2E-DB] All migrations applied successfully.');

    await pool.query(`
        CREATE TABLE IF NOT EXISTS api_audit_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            event_type VARCHAR(100) NOT NULL,
            tenant_id VARCHAR(64) NOT NULL,
            user_id VARCHAR(64) NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'SUCCESS',
            metadata_json JSON NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Seed test tenants
    await pool.query(`
        INSERT INTO tenants (id, name, status) VALUES
        ('tenant_printhouse_alpha', 'Printhouse Alpha GmbH', 'ACTIVE'),
        ('tenant_supplier_one', 'Papierfabrik Scheufelen', 'ACTIVE')
        ON DUPLICATE KEY UPDATE name=VALUES(name);
    `);

    // Seed printer nodes
    await pool.query(`
        INSERT INTO printer_nodes (id, tenant_id, name, country, city, email, status) VALUES
        ('node_plant_frankfurt', 'tenant_printhouse_alpha', 'Frankfurt Central Print Works', 'DE', 'Frankfurt', 'plant-frankfurt@alpha.de', 'ACTIVE')
        ON DUPLICATE KEY UPDATE name=VALUES(name);
    `);

    // Seed paper suppliers
    await pool.query(`
        INSERT INTO paper_suppliers (id, tenant_id, name, status, contact_email, currencies_json) VALUES
        ('supp_scheufelen', 'tenant_supplier_one', 'Scheufelen Premium Papers GmbH', 'ACTIVE', 'procurement@scheufelen-paper.de', '["EUR", "USD", "GBP"]')
        ON DUPLICATE KEY UPDATE name=VALUES(name);
    `);

    // Seed tenant capabilities
    await pool.query(`
        INSERT INTO tenant_capabilities (id, tenant_id, capability, is_active) VALUES
        ('cap_print_alpha', 'tenant_printhouse_alpha', 'PRINTHOUSE', 1),
        ('cap_supp_one', 'tenant_supplier_one', 'PAPER_SUPPLIER', 1)
        ON DUPLICATE KEY UPDATE is_active=VALUES(is_active);
    `);

    // Seed control users (printhouse buyer and supplier operator) with bcrypt password: 'Password123!'
    const pwHash = await bcrypt.hash('Password123!', 10);
    const [buyerRes] = await pool.query(`
        INSERT INTO control_users (email, password_hash, role, tenant_id, printhouse_id, status)
        VALUES ('buyer@printhouse-alpha.de', ?, 'PRINTHOUSE_OPERATOR', 'tenant_printhouse_alpha', 'node_plant_frankfurt', 'ACTIVE');
    `, [pwHash]);
    const buyerUserId = String(buyerRes.insertId);

    const [suppRes] = await pool.query(`
        INSERT INTO control_users (email, password_hash, role, tenant_id, printhouse_id, status)
        VALUES ('procurement@scheufelen-paper.de', ?, 'TENANT_ADMIN', 'tenant_supplier_one', NULL, 'ACTIVE');
    `, [pwHash]);
    const suppUserId = String(suppRes.insertId);

    // Seed supplier membership
    await pool.query(`
        INSERT INTO supplier_memberships (id, user_id, tenant_id, supplier_id, supplier_role, is_active)
        VALUES ('mem_supp_1', ?, 'tenant_supplier_one', 'supp_scheufelen', 'SUPPLIER_ADMIN', 1)
        ON DUPLICATE KEY UPDATE is_active=1;
    `, [suppUserId]);

    // Seed product and variant
    await pool.query(`
        INSERT INTO paper_products (id, name, category, brand, manufacturer, description) VALUES
        ('prod_phoenix', 'Phoenix Silk Premium Coated', 'COATED', 'Scheufelen', 'Scheufelen', 'Premium semi-matte coated paper')
        ON DUPLICATE KEY UPDATE name=VALUES(name);
    `);

    await pool.query(`
        INSERT INTO paper_variants (id, product_id, gsm, width_mm, height_mm, finish, grain_direction, fingerprint) VALUES
        ('var_phoenix_130', 'prod_phoenix', 130, 700.00, 1000.00, 'SILK', 'LONG_GRAIN', 'fp_phoenix_130_70100')
        ON DUPLICATE KEY UPDATE gsm=VALUES(gsm);
    `);

    await pool.query(`
        INSERT INTO supplier_paper_catalog_variants (id, tenant_id, supplier_id, variant_id, status) VALUES
        ('spcv_sch_1', 'tenant_supplier_one', 'supp_scheufelen', 'var_phoenix_130', 'ACTIVE')
        ON DUPLICATE KEY UPDATE status=VALUES(status);
    `);

    // Seed marketplace offer
    await pool.query(`
        INSERT INTO supplier_paper_offers (
            id, tenant_id, supplier_id, variant_id, supplier_sku, price_amount, currency,
            price_basis, moq, order_multiple, sheets_per_pack, visibility, status
        ) VALUES (
            'off_sappi_phoenix_130', 'tenant_supplier_one', 'supp_scheufelen', 'var_phoenix_130',
            'SCH-PHX-130-70100', 1.85, 'EUR', 'KG', 500, 50, 500, 'MARKETPLACE', 'ACTIVE'
        ) ON DUPLICATE KEY UPDATE price_amount=VALUES(price_amount);
    `);

    // Seed material inventory
    await pool.query(`
        INSERT INTO predictive_material_inventory (
            id, tenant_id, printhouse_id, node_id, material_name, material_type, paper_gsm, finish,
            supplier_name, cost_per_unit, current_stock_units, reserved_stock_units, available_units,
            reorder_point, status, operational_status
        ) VALUES (
            'mat-inv-phoenix-130', 'tenant_printhouse_alpha', 'node_plant_frankfurt', 'node_plant_frankfurt',
            'Phoenix Silk Coated 130gsm (B1 700x1000)', 'PAPER', 130, 'SILK',
            'Scheufelen Premium Papers GmbH', 0.168, 10000, 0, 10000, 2000,
            'STABLE', 'AVAILABLE'
        ) ON DUPLICATE KEY UPDATE current_stock_units=VALUES(current_stock_units);
    `);

    console.log('[SETUP-E2E-DB] Seeding completed:');
    console.log(`- Printhouse User: buyer@printhouse-alpha.de (id: ${buyerUserId}, role: PRINTHOUSE_OPERATOR, plant: node_plant_frankfurt)`);
    console.log(`- Supplier User: procurement@scheufelen-paper.de (id: ${suppUserId}, role: SUPPLIER_ADMIN, supplier: supp_scheufelen)`);
    console.log('- Offer: off_sappi_phoenix_130 (Phoenix Silk 130gsm, 1.85 EUR/KG, SKU SCH-PHX-130-70100)');
    console.log('- Inventory: mat-inv-phoenix-130 (10,000 sheets at node_plant_frankfurt)');

    await pool.end();
}

setup().catch(err => {
    console.error('[SETUP-E2E-DB] Error:', err);
    process.exit(1);
});
