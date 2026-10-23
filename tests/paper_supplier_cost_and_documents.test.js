/**
 * tests/paper_supplier_cost_and_documents.test.js
 * 
 * Comprehensive Unit and Integration Test Suite for Iteration I6:
 * 1. Physical Calculations & Multi-Basis Normalization:
 *    - calculateSheetWeightKg (m^2 * gsm / 1000)
 *    - convertPriceToKg across KG, TONNE, SHEET, THOUSAND_SHEETS, PACK
 * 2. Market Paper Rate Resolution:
 *    - Finds cheapest active offer matching physical specs (GSM, finish, category, dimensions)
 *    - Honors customer tier pricing (MARKETPLACE vs APPROVED_CUSTOMERS)
 * 3. Industrial Job Paper Estimation:
 *    - Copies, interior signatures, press sheet imposition (16pp work & turn)
 *    - Setup waste + 2.5% run waste calculations
 *    - Net & gross kilograms, cost estimation
 * 4. BPE Forward Pricing Rate Patch Builder:
 *    - Non-invasive pricing patch mapping to paper_price_interior_by_kilo and cover
 *    - Full provenance snapshot (supplierId, offerId, sku, resolvedAt)
 * 5. Canonical Procurement Documents & Printable HTML:
 *    - Purchase Order (PO) document generation & HTML5 rendering
 *    - Delivery Note / Packing Slip (Albarán) document generation & receipt history
 *    - Multi-party permissions (buyer printhouse & supplier access)
 * 6. API Route Endpoints:
 *    - GET /api/admin/materials/procurements/paper-orders/:id/document
 *    - GET /api/v1/paper-suppliers/orders/:orderId/document
 *    - POST /api/admin/materials/sourcing/estimate-job-paper
 *    - GET /api/admin/materials/sourcing/resolve-market-rate
 *    - POST /api/admin/materials/sourcing/bpe-rate-patch
 *    - Cross-tenant & unauthorized access rejection
 * 7. Procurement Event Notifications:
 *    - Event triggers logged in control_plane_notifications
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test_secret_for_cost_and_documents';
const JWT_AUDIENCE = 'ppos:control';
const JWT_ISSUER = 'https://auth.printprice.pro';

process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_AUDIENCE = JWT_AUDIENCE;
process.env.JWT_ISSUER = JWT_ISSUER;
process.env.PAPER_SUPPLIER_HUB_ENABLED = 'true';

const paperCostIntegrationService = require('../src/api/services/paperCostIntegrationService');
const paperProcurementService = require('../src/api/services/paperProcurementService');
const paperSuppliersRouter = require('../src/api/routes/paperSuppliersRoutes');
const materialsAdminRouter = require('../src/api/routes/materialsAdmin');
let mysqlClient = require('../src/api/services/mysqlClient');
const { parseMigrationSql } = require('../src/api/services/migrationSqlParser');
const { runBootstrap } = require('../scripts/bootstrap_canonical_schema');

function generateToken(payload) {
    return jwt.sign({
        sub: payload.id || payload.userId || 'user-proc-alpha-1',
        email: payload.email || 'user@test.local',
        role: payload.role,
        tenant_id: payload.tenantId,
        supplier_id: payload.supplierId || null,
        printhouse_id: payload.printhouseId || null,
        has_supplier_capability: Boolean(payload.supplierId),
        ...payload
    }, JWT_SECRET, { audience: JWT_AUDIENCE, issuer: JWT_ISSUER });
}

function dispatch(router, req) {
    if (req.url && req.url.includes('?')) {
        const [, queryString] = req.url.split('?');
        const searchParams = new URLSearchParams(queryString);
        req.query = req.query || {};
        for (const [key, value] of searchParams.entries()) {
            req.query[key] = value;
        }
    }
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

function getTestDatabaseConfig() {
    return {
        host: process.env.TEST_MYSQL_HOST,
        port: process.env.TEST_MYSQL_PORT ? parseInt(process.env.TEST_MYSQL_PORT, 10) : undefined,
        user: process.env.TEST_MYSQL_USER,
        password: process.env.TEST_MYSQL_PASSWORD
    };
}

const executionRunToken = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const executionSchemaName = `ppos_test_cost_${executionRunToken}`;

let connectionPool = null;
let adminPool = null;
const isDbConfigured = Boolean(process.env.TEST_MYSQL_HOST && process.env.TEST_MYSQL_PORT && process.env.TEST_MYSQL_USER && process.env.TEST_MYSQL_PASSWORD !== undefined);

describe('Iteration I6: Paper Cost Integration & Procurement Documents', () => {

    describe('1. Pure Physical Calculations & Multi-Basis Normalization', () => {
        it('calculates sheet weight in kilograms correctly (Area * GSM / 1000)', () => {
            // 700mm x 1000mm, 130 gsm -> 0.7 * 1.0 * 130 / 1000 = 0.091 kg
            const weightKg = paperCostIntegrationService.calculateSheetWeightKg(700, 1000, 130);
            expect(weightKg).toBeCloseTo(0.091, 5);

            // 650mm x 920mm, 300 gsm -> 0.65 * 0.92 * 300 / 1000 = 0.1794 kg
            const coverWeight = paperCostIntegrationService.calculateSheetWeightKg(650, 920, 300);
            expect(coverWeight).toBeCloseTo(0.1794, 5);
        });

        it('normalizes multi-basis prices to EUR/kg accurately', () => {
            const dims = { widthMm: 700, heightMm: 1000, gsm: 130 }; // sheet weight = 0.091 kg

            // KG basis: 1.85 EUR/kg -> 1.85 EUR/kg
            expect(paperCostIntegrationService.convertPriceToKg({ priceAmount: 1.85, priceBasis: 'KG', ...dims })).toBeCloseTo(1.85, 4);

            // TONNE basis: 1850 EUR/tonne -> 1.85 EUR/kg
            expect(paperCostIntegrationService.convertPriceToKg({ priceAmount: 1850, priceBasis: 'TONNE', ...dims })).toBeCloseTo(1.85, 4);

            // SHEET basis: 0.182 EUR/sheet -> 0.182 / 0.091 = 2.00 EUR/kg
            expect(paperCostIntegrationService.convertPriceToKg({ priceAmount: 0.182, priceBasis: 'SHEET', ...dims })).toBeCloseTo(2.00, 4);

            // THOUSAND_SHEETS basis: 182 EUR / 1000 sheets -> 182 / (1000 * 0.091) = 2.00 EUR/kg
            expect(paperCostIntegrationService.convertPriceToKg({ priceAmount: 182, priceBasis: 'THOUSAND_SHEETS', ...dims })).toBeCloseTo(2.00, 4);

            // PACK basis (500 sheets): 91 EUR / pack -> 91 / (500 * 0.091) = 2.00 EUR/kg
            expect(paperCostIntegrationService.convertPriceToKg({ priceAmount: 91, priceBasis: 'PACK', ...dims, sheetsPerPack: 500 })).toBeCloseTo(2.00, 4);
        });
    });

    describe('2. Industrial Job Paper Requirements & Estimation', () => {
        it('calculates job paper requirements with 16pp signatures and waste factors', () => {
            const jobSpec = {
                copies: 1000,
                interior_pages: 96,
                paper_weight_interior: 130,
                paper_weight_cover: 300,
                press_sheet_width_mm: 700,
                press_sheet_height_mm: 1000,
                rate_per_kg_interior: 1.80,
                rate_per_kg_cover: 2.20
            };

            const estimate = paperCostIntegrationService.calculateJobPaperRequirements(jobSpec);

            // Interior: 96 pages / 16 = 6 signatures. 1000 copies * 6 = 6,000 net sheets.
            expect(estimate.signaturesCount).toBe(6);
            expect(estimate.interior.netSheets).toBe(6000);
            expect(estimate.interior.netKg).toBeCloseTo(6000 * 0.091, 1);

            // Waste: setup (6 * 100 = 600 sheets) + run waste (2.5% of 6000 = 150) = 750 scrap sheets
            expect(estimate.interior.totalSheets).toBe(6750);
            expect(estimate.interior.estimatedCost).toBeGreaterThan(0);

            // Cover: 2 covers per sheet -> 500 net sheets
            expect(estimate.cover.netSheets).toBe(500);
            expect(estimate.cover.totalSheets).toBe(500 + 50 + 13);
            expect(estimate.totals.totalEstimatedCost).toBeCloseTo(estimate.interior.estimatedCost + estimate.cover.estimatedCost, 2);
        });
    });

    describe('3. Ephemeral MySQL Setup & Integration Tests', () => {
        beforeAll(async () => {
            if (!isDbConfigured) return;

            const testDbConfig = getTestDatabaseConfig();
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

            // Canonical bootstrap
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

            // Run migrations 007, 162, 163, 164, 165, 166
            const migrationsDir = path.join(__dirname, '../migrations');
            for (const f of [
                '007_mes_material_orchestration.sql',
                '162_phase196a_paper_suppliers_and_procurement_idempotency.sql',
                '163_phase196b_paper_products_and_import_staging.sql',
                '164_phase196c_supplier_paper_offers_and_revisions.sql',
                '165_phase196d_paper_supplier_offer_soft_delete_and_catalog_associations.sql',
                '166_phase196e_supplier_paper_procurement_orders.sql'
            ]) {
                const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
                const parsed = parseMigrationSql(sql);
                for (const s of parsed.statements) {
                    await connectionPool.query(s);
                }
            }

            // Create notifications table if not exists
            await connectionPool.query(`
                CREATE TABLE IF NOT EXISTS control_plane_notifications (
                    id VARCHAR(64) PRIMARY KEY,
                    tenant_id VARCHAR(64) NOT NULL,
                    user_id VARCHAR(64) NULL,
                    scope VARCHAR(32) NOT NULL DEFAULT 'USER',
                    type VARCHAR(64) NOT NULL,
                    severity VARCHAR(32) NOT NULL DEFAULT 'info',
                    title VARCHAR(255) NOT NULL,
                    message TEXT NULL,
                    entity_type VARCHAR(64) NULL,
                    entity_id VARCHAR(64) NULL,
                    action_url VARCHAR(255) NULL,
                    metadata_json JSON NULL,
                    is_read BOOLEAN NOT NULL DEFAULT FALSE,
                    read_at TIMESTAMP NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP NULL,
                    INDEX idx_cp_notif_tenant (tenant_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            `);

            // Seed test tenants (buyer printhouses and supplier organizations)
            await connectionPool.query(`
                INSERT INTO tenants (id, name, status) VALUES
                ('tenant_buyer_doc', 'Printhouse Gutenberg Press', 'ACTIVE'),
                ('tenant_supp_doc_alpha', 'Sappi Fine Paper Europe', 'ACTIVE'),
                ('tenant_supp_doc_beta', 'Stora Enso Paper', 'ACTIVE')
                ON DUPLICATE KEY UPDATE name=VALUES(name)
            `);

            // Seed suppliers
            await connectionPool.query(`
                INSERT INTO paper_suppliers (id, tenant_id, name, status, contact_email, currencies_json) VALUES
                ('supp_sappi', 'tenant_supp_doc_alpha', 'Sappi Paper Europe', 'ACTIVE', 'sales@sappi.com', '["EUR"]'),
                ('supp_stora', 'tenant_supp_doc_beta', 'Stora Enso Paper', 'ACTIVE', 'sales@storaenso.com', '["EUR"]')
                ON DUPLICATE KEY UPDATE name=VALUES(name)
            `);

            // Seed memberships and capabilities
            await connectionPool.query(`
                INSERT INTO tenant_capabilities (id, tenant_id, capability, is_active) VALUES
                ('cap_doc_p1', 'tenant_buyer_doc', 'PRINTHOUSE', 1),
                ('cap_doc_s1', 'tenant_supp_doc_alpha', 'PAPER_SUPPLIER', 1),
                ('cap_doc_s2', 'tenant_supp_doc_beta', 'PAPER_SUPPLIER', 1)
                ON DUPLICATE KEY UPDATE is_active=VALUES(is_active)
            `);

            await connectionPool.query(`
                INSERT INTO supplier_memberships (id, user_id, tenant_id, supplier_id, supplier_role, is_active) VALUES
                ('mem_doc_sappi_1', 'user_supp_1', 'tenant_supp_doc_alpha', 'supp_sappi', 'SUPPLIER_ADMIN', 1),
                ('mem_doc_stora_1', 'user_supp_2', 'tenant_supp_doc_beta', 'supp_stora', 'SUPPLIER_ADMIN', 1)
                ON DUPLICATE KEY UPDATE is_active=VALUES(is_active)
            `);

            // Seed delivery site (printer_nodes)
            await connectionPool.query(`
                INSERT INTO printer_nodes (id, tenant_id, name, country, city, email, status) VALUES
                ('node_plant_frankfurt', 'tenant_buyer_doc', 'Frankfurt Gutenberg Plant', 'DE', 'Frankfurt', 'plant@gutenberg.de', 'ACTIVE')
                ON DUPLICATE KEY UPDATE name=VALUES(name)
            `);

            // Seed paper products
            await connectionPool.query(`
                INSERT INTO paper_products (id, name, category, brand, manufacturer, description) VALUES
                ('prod_magno_gloss', 'Magno Gloss Coated', 'COATED', 'Magno', 'Sappi', 'Premium gloss coated paper'),
                ('prod_lumi_silk', 'Lumi Silk MC', 'COATED', 'Lumi', 'Stora Enso', 'Silk finish woodfree paper')
                ON DUPLICATE KEY UPDATE name=VALUES(name)
            `);

            // Seed paper variants
            await connectionPool.query(`
                INSERT INTO paper_variants (id, product_id, gsm, width_mm, height_mm, finish, grain_direction, fingerprint) VALUES
                ('var_magno_130', 'prod_magno_gloss', 130, 700.00, 1000.00, 'GLOSS', 'LONG_GRAIN', 'fp_magno_130_70100'),
                ('var_lumi_130', 'prod_lumi_silk', 130, 700.00, 1000.00, 'SILK', 'LONG_GRAIN', 'fp_lumi_130_70100')
                ON DUPLICATE KEY UPDATE gsm=VALUES(gsm)
            `);

            // Seed catalog associations
            await connectionPool.query(`
                INSERT INTO supplier_paper_catalog_variants (id, tenant_id, supplier_id, variant_id, status) VALUES
                ('cat_magno_1', 'tenant_supp_doc_alpha', 'supp_sappi', 'var_magno_130', 'ACTIVE'),
                ('cat_lumi_1', 'tenant_supp_doc_beta', 'supp_stora', 'var_lumi_130', 'ACTIVE')
                ON DUPLICATE KEY UPDATE status=VALUES(status)
            `);

            // Seed supplier offers:
            // Offer 1 (Sappi): 1.75 EUR/kg (cheapest)
            // Offer 2 (Stora Enso): 1.95 EUR/kg
            await connectionPool.query(`
                INSERT INTO supplier_paper_offers (
                    id, tenant_id, supplier_id, variant_id, supplier_sku, price_amount, currency,
                    price_basis, moq, order_multiple, sheets_per_pack, visibility, status
                ) VALUES
                ('off_sappi_130', 'tenant_supp_doc_alpha', 'supp_sappi', 'var_magno_130', 'SAP-MAG-130-70100', 1.75, 'EUR', 'KG', 500, 50, NULL, 'MARKETPLACE', 'ACTIVE'),
                ('off_stora_130', 'tenant_supp_doc_beta', 'supp_stora', 'var_lumi_130', 'STO-LUM-130-70100', 1.95, 'EUR', 'KG', 500, 50, NULL, 'MARKETPLACE', 'ACTIVE')
                ON DUPLICATE KEY UPDATE price_amount=VALUES(price_amount)
            `);
        });

        afterAll(async () => {
            if (connectionPool) await connectionPool.end();
            if (adminPool) {
                try {
                    await adminPool.query(`DROP DATABASE IF EXISTS \`${executionSchemaName}\`;`);
                } catch {}
                await adminPool.end();
            }
        });

        it('resolves the cheapest active market rate for a physical specification', async () => {
            if (!isDbConfigured) return;

            const rateInfo = await paperCostIntegrationService.resolveMarketPaperRate(
                'tenant_buyer_doc',
                {
                    gsm: 130,
                    widthMm: 700,
                    heightMm: 1000
                }
            );

            expect(rateInfo).toBeDefined();
            expect(rateInfo.supplierId).toBe('supp_sappi');
            expect(rateInfo.offerId).toBe('off_sappi_130');
            expect(rateInfo.sku).toBe('SAP-MAG-130-70100');
            expect(rateInfo.pricePerKg).toBeCloseTo(1.75, 4);
        });

        it('builds a BPE paper rate patch object with provenance metadata', async () => {
            if (!isDbConfigured) return;

            const patch = await paperCostIntegrationService.buildBpePaperPatch({
                tenantId: 'tenant_buyer_doc',
                interiorPaperType: 'couché_brillante',
                interiorGsm: 130,
                coverPaperType: 'couché_brillante',
                coverGsm: 130
            });

            expect(patch).toBeDefined();
            expect(patch.paper_price_interior_by_kilo).toBeDefined();
            expect(patch.paper_price_interior_by_kilo['couché_brillante']).toBeCloseTo(1.75, 4);
            expect(patch._metadata).toBeDefined();
            expect(patch._metadata.source).toBe('PPOS_PAPER_SUPPLIER_HUB');
            expect(patch._metadata.interior.offerId).toBe('off_sappi_130');
        });

        it('generates canonical Purchase Order (PO) document with printable HTML', async () => {
            if (!isDbConfigured) return;

            // Place an order first
            const orderRes = await paperProcurementService.placeOrderOrRfq({
                tenantId: 'tenant_buyer_doc',
                printhouseId: 'node_plant_frankfurt',
                userId: 'buyer_user_1',
                email: 'purchasing@gutenberg.de'
            }, {
                type: 'ORDER',
                offerId: 'off_sappi_130',
                variantId: 'var_magno_130',
                orderedQuantity: 1000,
                quantityBasis: 'KG',
                printhouseId: 'node_plant_frankfurt',
                buyerNotes: 'Please expedite delivery for Frankfurt book fair run.'
            });

            expect(orderRes.id).toBeDefined();
            const orderId = orderRes.id;

            // Generate PO document as Printhouse Buyer
            const docRes = await paperProcurementService.generateProcurementDocument(
                orderId,
                'po',
                { tenantId: 'tenant_buyer_doc', role: 'ADMIN' }
            );

            expect(docRes.ok).toBe(true);
            expect(docRes.data.documentType).toBe('PO');
            expect(docRes.data.documentCode).toMatch(/^PO-/);
            expect(docRes.data.orderNumber).toBeDefined();
            expect(docRes.data.buyer.name).toBe('Printhouse Gutenberg Press');
            expect(docRes.data.supplier.companyName).toBe('Sappi Paper Europe');
            expect(docRes.data.material.productName).toBe('Magno Gloss Coated');
            expect(docRes.data.material.gsm).toBe(130);
            expect(docRes.data.quantities.orderedQuantity).toBe(1000);
            expect(docRes.data.printableHtml).toContain('<!DOCTYPE html>');
            expect(docRes.data.printableHtml).toContain('@media print');
            expect(docRes.data.printableHtml).toContain('Orden de Compra');
            expect(docRes.data.printableHtml).toContain('Sappi Paper Europe');
            expect(docRes.data.printableHtml).toContain('Printhouse Gutenberg Press');
        });

        it('generates Packing Slip (Albarán) document reflecting warehouse goods receipts', async () => {
            if (!isDbConfigured) return;

            // Place order
            const orderRes = await paperProcurementService.placeOrderOrRfq({
                tenantId: 'tenant_buyer_doc',
                printhouseId: 'node_plant_frankfurt',
                userId: 'buyer_user_1',
                email: 'purchasing@gutenberg.de'
            }, {
                type: 'ORDER',
                offerId: 'off_sappi_130',
                variantId: 'var_magno_130',
                orderedQuantity: 2000,
                quantityBasis: 'KG',
                printhouseId: 'node_plant_frankfurt'
            });

            const orderId = orderRes.id;

            // Supplier confirms and dispatches
            await paperProcurementService.transitionSupplierOrder(
                'supp_sappi',
                orderId,
                'CONFIRMED',
                {},
                'user_supp_1'
            );
            await paperProcurementService.transitionSupplierOrder(
                'supp_sappi',
                orderId,
                'DISPATCHED',
                { carrier: 'DHL Freight', trackingNumber: 'DHL-DE-994411' },
                'user_supp_1'
            );

            // Warehouse records partial receipt of 5000 sheets
            await paperProcurementService.receiveOrderAtomic(
                orderId,
                {
                    tenantId: 'tenant_buyer_doc',
                    userId: 'warehouse_mgr_1',
                    printhouseId: 'node_plant_frankfurt'
                },
                {
                    receiptNumber: 'ALB-REC-001',
                    receivedSheets: 5000,
                    receivedQuantity: 455,
                    idempotencyKey: 'idemp_doc_slip_01',
                    notes: 'Pallet 1 intact, delivered by DHL'
                }
            );

            // Generate Packing Slip as Supplier
            const docRes = await paperProcurementService.generateProcurementDocument(
                orderId,
                'packing_slip',
                { supplierId: 'supp_sappi', role: 'SUPPLIER_ADMIN' }
            );

            expect(docRes.ok).toBe(true);
            expect(docRes.data.documentType).toBe('PACKING_SLIP');
            expect(docRes.data.documentCode).toMatch(/^ALB-/);
            expect(docRes.data.receipts).toHaveLength(1);
            expect(docRes.data.receipts[0].receiptNumber).toBe('ALB-REC-001');
            expect(docRes.data.receipts[0].receivedSheets).toBe(5000);
            expect(docRes.data.quantities.receivedSheets).toBe(5000);
            expect(docRes.data.printableHtml).toContain('Albarán de Entrega');
            expect(docRes.data.printableHtml).toContain('ALB-REC-001');
            expect(docRes.data.printableHtml).toContain('Pallet 1 intact');
        });

        it('dispatches HTTP route requests for document generation and sourcing', async () => {
            if (!isDbConfigured) return;

            // Place an order for route testing
            const orderRes = await paperProcurementService.placeOrderOrRfq({
                tenantId: 'tenant_buyer_doc',
                printhouseId: 'node_plant_frankfurt',
                userId: 'buyer_user_1',
                email: 'purchasing@gutenberg.de'
            }, {
                type: 'ORDER',
                offerId: 'off_sappi_130',
                variantId: 'var_magno_130',
                orderedQuantity: 1000,
                quantityBasis: 'KG',
                printhouseId: 'node_plant_frankfurt'
            });
            const orderId = orderRes.id;

            const buyerToken = generateToken({
                tenantId: 'tenant_buyer_doc',
                role: 'ADMIN'
            });

            // 1. Printhouse Buyer Route: GET /procurements/paper-orders/:id/document?type=po
            const reqBuyer = {
                method: 'GET',
                url: `/procurements/paper-orders/${orderId}/document?type=po`,
                headers: { authorization: `Bearer ${buyerToken}` }
            };
            const resBuyer = await dispatch(materialsAdminRouter, reqBuyer);
            expect(resBuyer.statusCode).toBe(200);
            expect(resBuyer.body.ok).toBe(true);
            expect(resBuyer.body.data.documentType).toBe('PO');

            // 2. Supplier Route: GET /orders/:orderId/document?type=packing_slip
            const suppToken = generateToken({
                userId: 'user_supp_1',
                tenantId: 'tenant_supp_doc_alpha',
                supplierId: 'supp_sappi',
                role: 'SUPPLIER_ADMIN'
            });
            const reqSupp = {
                method: 'GET',
                url: `/orders/${orderId}/document?type=packing_slip`,
                headers: { authorization: `Bearer ${suppToken}` }
            };
            const resSupp = await dispatch(paperSuppliersRouter, reqSupp);
            expect(resSupp.statusCode).toBe(200);
            expect(resSupp.body.ok).toBe(true);
            expect(resSupp.body.data.documentType).toBe('PACKING_SLIP');

            // 3. Unauthorized Supplier Beta: Cannot access Supplier Alpha's document
            const rivalToken = generateToken({
                userId: 'user_supp_2',
                tenantId: 'tenant_supp_doc_beta',
                supplierId: 'supp_stora',
                role: 'SUPPLIER_ADMIN'
            });
            const reqRival = {
                method: 'GET',
                url: `/orders/${orderId}/document?type=po`,
                headers: { authorization: `Bearer ${rivalToken}` }
            };
            const resRival = await dispatch(paperSuppliersRouter, reqRival);
            expect([403, 404]).toContain(resRival.statusCode);

            // 4. Sourcing estimate route: POST /sourcing/estimate-job-paper
            const reqEstimate = {
                method: 'POST',
                url: '/sourcing/estimate-job-paper',
                headers: { authorization: `Bearer ${buyerToken}` },
                body: {
                    copies: 500,
                    interior_pages: 64,
                    paper_weight_interior: 130,
                    rate_per_kg_interior: 1.75
                }
            };
            const resEstimate = await dispatch(materialsAdminRouter, reqEstimate);
            expect(resEstimate.statusCode).toBe(200);
            expect(resEstimate.body.ok).toBe(true);
            expect(resEstimate.body.data.totals.totalEstimatedCost).toBeGreaterThan(0);

            // 5. Market rate route: GET /sourcing/resolve-market-rate?gsm=130
            const reqRate = {
                method: 'GET',
                url: '/sourcing/resolve-market-rate?gsm=130&widthMm=700&heightMm=1000',
                headers: { authorization: `Bearer ${buyerToken}` }
            };
            const resRate = await dispatch(materialsAdminRouter, reqRate);
            expect(resRate.statusCode).toBe(200);
            expect(resRate.body.ok).toBe(true);
            expect(resRate.body.data.pricePerKg).toBeCloseTo(1.75, 2);

            // 6. BPE paper patch route: POST /sourcing/bpe-rate-patch
            const reqPatch = {
                method: 'POST',
                url: '/sourcing/bpe-rate-patch',
                headers: { authorization: `Bearer ${buyerToken}` },
                body: {
                    interiorPaperType: 'couché_brillante',
                    interiorGsm: 130
                }
            };
            const resPatch = await dispatch(materialsAdminRouter, reqPatch);
            expect(resPatch.statusCode).toBe(200);
            expect(resPatch.body.ok).toBe(true);
            expect(resPatch.body.data.paper_price_interior_by_kilo).toBeDefined();
        });

        it('records procurement transition events in notifications table', async () => {
            if (!isDbConfigured) return;

            const [notifs] = await connectionPool.query(`
                SELECT * FROM control_plane_notifications 
                WHERE entity_type = 'PAPER_PROCUREMENT_ORDER'
            `);

            // Notifications should have been dispatched on order placement, dispatch, and receipt
            expect(Array.isArray(notifs)).toBe(true);
            expect(notifs.length).toBeGreaterThan(0);

            const types = notifs.map(n => n.type);
            expect(types.some(t => t.includes('PAPER_ORDER_'))).toBe(true);
        });
    });
});
