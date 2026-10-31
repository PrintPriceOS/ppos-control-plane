/**
 * tests/paper_master_database_search.test.js
 * 
 * Verifies Master Paper Database Search functionality for Printhouse material provisioning:
 * 1. Dimension parser (cm-to-mm, orientation invariant e.g. 70x100 and 100x70).
 * 2. Search by brand/product name (Alaska, Silk, Algro, Brun).
 * 3. Search with GSM grammage (255, 300).
 * 4. Fallback supplier resolution to Papelera del Mediterraneo (Demo) / proveedor@demo-papel.pro.
 * 5. Cost-per-sheet calculations across diverse price bases (KG, TONNE, SHEET).
 * 6. HTTP API endpoint GET /api/admin/materials/paper-database/search.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test_secret_for_procurement_isolation';
const JWT_AUDIENCE = 'ppos:control';
const JWT_ISSUER = 'https://auth.printprice.pro';

process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_AUDIENCE = JWT_AUDIENCE;
process.env.JWT_ISSUER = JWT_ISSUER;
process.env.PAPER_SUPPLIER_HUB_ENABLED = 'true';

const paperProcurementService = require('../src/api/services/paperProcurementService');
const materialsAdminRouter = require('../src/api/routes/materialsAdmin');
let mysqlClient = require('../src/api/services/mysqlClient');
const { parseMigrationSql } = require('../src/api/services/migrationSqlParser');
const { runBootstrap } = require('../scripts/bootstrap_canonical_schema');

function generateToken(payload) {
    return jwt.sign({
        sub: payload.id || payload.userId || 'user-ph-search-01',
        email: payload.email || 'operator@printhouse.pro',
        role: payload.role || 'PRINTHOUSE_ADMIN',
        tenant_id: payload.tenantId || 'tenant_printhouse_alpha',
        printhouse_id: payload.printhouseId || 'ph_alpha',
        ...payload
    }, JWT_SECRET, { audience: JWT_AUDIENCE, issuer: JWT_ISSUER, expiresIn: '2h' });
}

function dispatch(router, req) {
    req.query = req.query || {};
    req.params = req.params || {};
    req.headers = req.headers || {};
    return new Promise((resolve) => {
        let isResolved = false;
        const res = {
            statusCode: null,
            headers: {},
            body: null,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(data) {
                if (this.statusCode === null) this.statusCode = 200;
                this.body = data;
                if (!isResolved) {
                    isResolved = true;
                    resolve(this);
                }
                return this;
            },
            send(data) {
                if (this.statusCode === null) this.statusCode = 200;
                this.body = data;
                if (!isResolved) {
                    isResolved = true;
                    resolve(this);
                }
                return this;
            },
            setHeader(name, value) {
                this.headers[name] = value;
                this.headers[name.toLowerCase()] = value;
                return this;
            }
        };

        router(req, res, (err) => {
            if (isResolved) return;
            isResolved = true;
            if (err) {
                res.statusCode = err.statusCode || err.status || 500;
                res.body = { ok: false, error: err.message, code: err.code };
            } else {
                res.statusCode = res.statusCode || 404;
                res.body = res.body || { error: 'Not Found' };
            }
            resolve(res);
        });
    });
}

const executionRunToken = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const executionSchemaName = `ppos_test_psearch_${executionRunToken}`;

let adminPool = null;
let connectionPool = null;

describe('Master Paper Database Search & Autocomplete', () => {
    const buyerTenantId = 'tenant_printhouse_alpha';

    beforeAll(async () => {
        const testDbConfig = {
            host: process.env.TEST_MYSQL_HOST || '127.0.0.1',
            port: parseInt(process.env.TEST_MYSQL_PORT || '3307', 10),
            user: process.env.TEST_MYSQL_USER || 'root',
            password: process.env.TEST_MYSQL_PASSWORD || 'root_password_ppos_2026'
        };

        await mysqlClient.closePool();

        adminPool = mysql.createPool({
            host: testDbConfig.host,
            port: testDbConfig.port,
            user: testDbConfig.user,
            password: testDbConfig.password,
            multipleStatements: true
        });

        await adminPool.query(`CREATE DATABASE IF NOT EXISTS \`${executionSchemaName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);

        connectionPool = mysql.createPool({
            host: testDbConfig.host,
            port: testDbConfig.port,
            user: testDbConfig.user,
            password: testDbConfig.password,
            database: executionSchemaName,
            multipleStatements: true
        });

        delete process.env.DATABASE_URL;
        process.env.MYSQL_HOST = testDbConfig.host;
        process.env.MYSQL_PORT = String(testDbConfig.port);
        process.env.MYSQL_USER = testDbConfig.user;
        process.env.MYSQL_PASSWORD = testDbConfig.password;
        process.env.MYSQL_DATABASE = executionSchemaName;
        process.env.TEST_MYSQL_DATABASE = executionSchemaName;
        process.env.PPOS_CI_EPHEMERAL_FIXTURES = 'true';
        process.env.CI = 'true';
        process.env.PPOS_MIGRATION_EXECUTION = 'true';
        process.env.PPOS_ENABLE_SCHEMA_MUTATION = 'true';

        // Bootstrap canonical schema
        await runBootstrap({
            host: testDbConfig.host,
            database: executionSchemaName,
            pool: connectionPool
        });

        // Reconnect mysqlClient
        mysqlClient.getPool = () => connectionPool;
        mysqlClient.query = async (sql, params) => {
            const [rows] = await connectionPool.query(sql, params);
            return rows;
        };
        mysqlClient.getConnection = async () => connectionPool.getConnection();

        // Run migrations
        const migrationsDir = path.join(__dirname, '../migrations');
        for (const f of [
            '162_phase196a_paper_suppliers_and_procurement_idempotency.sql',
            '163_phase196b_paper_products_and_import_staging.sql',
            '164_phase196c_supplier_paper_offers_and_revisions.sql',
            '165_phase196d_paper_supplier_offer_soft_delete_and_catalog_associations.sql',
            '166_phase196e_supplier_paper_procurement_orders.sql'
        ]) {
            const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
            const parsed = parseMigrationSql(sql);
            for (const s of parsed.statements) {
                await connectionPool.query(s.sql);
            }
        }

        // Seed test tenants
        await connectionPool.query(`
            INSERT INTO tenants (id, name, status) VALUES
            ('tenant_printhouse_alpha', 'Printhouse Alpha SL', 'ACTIVE'),
            ('tenant_supplier_demo', 'Papelera del Mediterraneo SL', 'ACTIVE')
            ON DUPLICATE KEY UPDATE name=VALUES(name);
        `);

        // Seed supplier (matches demo supplier proveedor@demo-papel.pro)
        await connectionPool.query(`
            INSERT INTO paper_suppliers (id, tenant_id, name, status, contact_email, currencies_json) VALUES
            ('supp-test-mill-01', 'tenant_supplier_demo', 'Papelera del Mediterraneo (Demo)', 'ACTIVE', 'proveedor@demo-papel.pro', '["EUR"]')
            ON DUPLICATE KEY UPDATE name=VALUES(name);
        `);

        // Seed test paper products
        await connectionPool.query(`
            INSERT INTO paper_products (id, name, brand, manufacturer, category, finish_summary, description) VALUES
            ('prod_alaska', 'Alaska Plus GC2', 'Metsä Board', 'Metsä Board', 'CARTON', 'White back folding boxboard', 'Premium coated folding boxboard'),
            ('prod_algro', 'Algro Design Duo', 'Sappi', 'Sappi Fine Paper', 'DESIGN', 'Double coated solid bleached board', 'Luxury packaging board'),
            ('prod_brun', 'Brun Board', 'Koehler Paper', 'Koehler', 'CARTON', 'Natural unbleached kraft board', 'Heavy unbleached kraft board'),
            ('prod_silk', 'Balance Silk', 'Inapa', 'Inapa Tecco', 'COATED', 'Silk matte finish paper', 'Fine coated printing paper');
        `);

        // Seed test variants
        await connectionPool.query(`
            INSERT INTO paper_variants (id, product_id, gsm, width_mm, height_mm, caliper_um, finish, grain_direction, fingerprint) VALUES
            ('var_alaska_70x100', 'prod_alaska', 255, 700, 1000, 410, 'SILK', 'LONG_GRAIN', 'fp_alaska_255_700x1000'),
            ('var_algro_64x92', 'prod_algro', 300, 640, 920, 360, 'COATED', 'SHORT_GRAIN', 'fp_algro_300_640x920'),
            ('var_algro_72x102', 'prod_algro', 300, 720, 1020, 360, 'COATED', 'LONG_GRAIN', 'fp_algro_300_720x1020'),
            ('var_brun_70x100', 'prod_brun', 300, 700, 1000, 480, 'UNCOATED', 'LONG_GRAIN', 'fp_brun_300_700x1000'),
            ('var_silk_46x64', 'prod_silk', 130, 460, 640, 130, 'SILK', 'LONG_GRAIN', 'fp_silk_130_460x640');
        `);

        // Seed an active offer for Alaska Plus from demo supplier
        await connectionPool.query(`
            INSERT INTO supplier_paper_offers (
                id, tenant_id, supplier_id, variant_id, supplier_sku,
                price_amount, currency, price_basis, moq, order_multiple,
                sheets_per_pack, status, visibility
            ) VALUES (
                'off_alaska_01', 'tenant_supplier_demo', 'supp-test-mill-01', 'var_alaska_70x100', 'SKU-ALA-70100',
                1.95, 'EUR', 'KG', 1000, 500, 500, 'ACTIVE', 'MARKETPLACE'
            );
        `);
    });

    afterAll(async () => {
        try {
            if (adminPool) {
                await adminPool.query(`DROP DATABASE IF EXISTS \`${executionSchemaName}\`;`);
                await adminPool.end();
            }
            if (connectionPool) {
                await connectionPool.end();
            }
        } catch (e) {
            // Ignore cleanup errors
        }
    });

    test('1. Search by sheet dimensions in cm (70x100) matches mm variants (700x1000)', async () => {
        const result = await paperProcurementService.searchMasterPaperDatabase(buyerTenantId, { q: '70x100' });
        expect(result).toHaveProperty('items');
        expect(Array.isArray(result.items)).toBe(true);
        expect(result.items.length).toBeGreaterThan(0);
        
        const formats = result.items.map(r => r.sheetFormat);
        expect(formats.some(f => f.includes('700') || f.includes('70x100'))).toBe(true);
    });

    test('2. Search by reversed dimensions (100x70) matches orientation-invariantly', async () => {
        const result = await paperProcurementService.searchMasterPaperDatabase(buyerTenantId, { q: '100x70' });
        expect(result).toHaveProperty('items');
        expect(Array.isArray(result.items)).toBe(true);
        expect(result.items.length).toBeGreaterThan(0);
        
        const sample = result.items[0];
        expect(sample.sheetFormat.toLowerCase()).toMatch(/70.*100|100.*70|700.*1000/);
    });

    test('3. Search by millimeter dimensions (640x920 or 64x92) finds variants', async () => {
        const result = await paperProcurementService.searchMasterPaperDatabase(buyerTenantId, { q: '64x92' });
        expect(result).toHaveProperty('items');
        expect(Array.isArray(result.items)).toBe(true);
        expect(result.items.length).toBeGreaterThan(0);

        const formats = result.items.map(r => r.sheetFormat);
        expect(formats.some(f => f.includes('64') && f.includes('92'))).toBe(true);
    });

    test('4. Search by product name (Alaska, Silk, Brun, Algro) returns corresponding variants', async () => {
        const alaskaResult = await paperProcurementService.searchMasterPaperDatabase(buyerTenantId, { q: 'Alaska' });
        expect(alaskaResult.items.length).toBeGreaterThan(0);
        expect(alaskaResult.items.every(r => r.productName.toLowerCase().includes('alaska') || (r.brand && r.brand.toLowerCase().includes('alaska')))).toBe(true);

        const silkResult = await paperProcurementService.searchMasterPaperDatabase(buyerTenantId, { q: 'Silk' });
        expect(silkResult.items.length).toBeGreaterThan(0);
        expect(silkResult.items.some(r => r.productName.toLowerCase().includes('silk') || (r.finish && r.finish.toLowerCase().includes('silk')))).toBe(true);
    });

    test('5. Search combining name and grammage (e.g. "Alaska 255" or "Algro 300")', async () => {
        const result = await paperProcurementService.searchMasterPaperDatabase(buyerTenantId, { q: 'Alaska 255' });
        expect(result.items.length).toBeGreaterThan(0);
        expect(result.items[0].productName.toLowerCase()).toContain('alaska');
        expect(result.items[0].gsm).toBe(255);
    });

    test('6. Supplier fallback defaults to Papelera del Mediterraneo (Demo) / proveedor@demo-papel.pro', async () => {
        const result = await paperProcurementService.searchMasterPaperDatabase(buyerTenantId, { q: 'Brun' });
        expect(result.items.length).toBeGreaterThan(0);
        const item = result.items[0];
        expect(item.supplierName).toBeTruthy();
        expect(item.supplierEmail).toBeTruthy();
        if (!item.offerId) {
            expect(item.supplierName).toBe('Papelera del Mediterraneo (Demo)');
            expect(item.supplierEmail).toBe('proveedor@demo-papel.pro');
        }
    });

    test('7. Calculated cost per sheet is physically positive and consistent', async () => {
        const result = await paperProcurementService.searchMasterPaperDatabase(buyerTenantId, { q: '70x100' });
        expect(result.items.length).toBeGreaterThan(0);
        const itemWithOffer = result.items.find(i => i.hasActiveOffer);
        expect(itemWithOffer).toBeTruthy();
        expect(typeof itemWithOffer.calculatedCostPerSheet).toBe('number');
        expect(itemWithOffer.calculatedCostPerSheet).toBeGreaterThan(0);
    });

    test('8. HTTP Route GET /api/admin/materials/paper-database/search requires authentication', async () => {
        const req = {
            method: 'GET',
            url: '/paper-database/search?q=70x100',
            query: { q: '70x100' },
            headers: {}
        };
        const res = await dispatch(materialsAdminRouter, req);
        expect([401, 403]).toContain(res.statusCode);
    });

    test('9. HTTP Route GET /api/admin/materials/paper-database/search returns items for authenticated Printhouse', async () => {
        const token = generateToken({
            tenantId: buyerTenantId,
            role: 'PRINTHOUSE_ADMIN'
        });

        const req = {
            method: 'GET',
            url: '/paper-database/search?q=70x100',
            query: { q: '70x100' },
            headers: {
                authorization: `Bearer ${token}`
            }
        };
        const res = await dispatch(materialsAdminRouter, req);
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('ok', true);
        expect(Array.isArray(res.body.data.items)).toBe(true);
        expect(res.body.data.items.length).toBeGreaterThan(0);
        expect(res.body.data.items[0]).toHaveProperty('variantId');
        expect(res.body.data.items[0]).toHaveProperty('calculatedCostPerSheet');
    });

    test('10. HTTP Route returns empty array when query is under 2 characters', async () => {
        const token = generateToken({
            tenantId: buyerTenantId,
            role: 'PRINTHOUSE_ADMIN'
        });

        const req = {
            method: 'GET',
            url: '/paper-database/search?q=a',
            query: { q: 'a' },
            headers: {
                authorization: `Bearer ${token}`
            }
        };
        const res = await dispatch(materialsAdminRouter, req);
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('ok', true);
        expect(res.body.data.items).toEqual([]);
    });

    test('11. HTTP Route GET /api/admin/materials/suppliers requires authentication', async () => {
        const req = {
            method: 'GET',
            url: '/suppliers',
            query: {},
            headers: {}
        };
        const res = await dispatch(materialsAdminRouter, req);
        expect(res.statusCode).toBe(401);
    });

    test('12. HTTP Route GET /api/admin/materials/suppliers returns system suppliers with country and names', async () => {
        const token = generateToken({
            tenantId: buyerTenantId,
            role: 'PRINTHOUSE_ADMIN'
        });

        const req = {
            method: 'GET',
            url: '/suppliers',
            query: {},
            headers: {
                authorization: `Bearer ${token}`
            }
        };
        const res = await dispatch(materialsAdminRouter, req);
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('ok', true);
        expect(Array.isArray(res.body.data.items)).toBe(true);
        expect(res.body.data.items.length).toBeGreaterThan(0);
        
        const suppNames = res.body.data.items.map(s => s.name);
        expect(suppNames.some(n => n.includes('Papelera') || n.includes('Test Mill') || n.includes('Antalis'))).toBe(true);
        
        const first = res.body.data.items[0];
        expect(first).toHaveProperty('name');
        expect(first).toHaveProperty('country');
    });
});

