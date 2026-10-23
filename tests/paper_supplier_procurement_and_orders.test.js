/**
 * tests/paper_supplier_procurement_and_orders.test.js
 * 
 * Comprehensive Unit and Integration Test Suite for Iterations I4 & I5:
 * 1. Physical Calculations:
 *    - calculateSheets (SHEET, THOUSAND_SHEETS, PACK, KG, TONNE)
 *    - calculateTotalAmount for all price bases
 * 2. Printhouse Paper Sourcing & Offer Visibility:
 *    - MARKETPLACE: visible to all authenticated tenants.
 *    - APPROVED_CUSTOMERS: visible only if buyerTenantId is explicitly in approved_customer_ids.
 *    - PRIVATE: visible only if buyerTenantId matches offer owner.
 * 3. Direct Order Placement & MOQ Enforcement:
 *    - Rejection of order quantity below MOQ.
 *    - Alignment with order_multiple step.
 *    - Center ownership validation (fails closed if center not owned by tenant).
 *    - Immutable snapshotting of physical specs, prices, and agreed terms.
 *    - Modification of original offer later does NOT alter order snapshot.
 * 4. Bidirectional RFQ Lifecycle:
 *    - RFQ placement (initial status: SUBMITTED).
 *    - Supplier quotes RFQ (status: QUOTED) with custom price and delivery date.
 *    - Printhouse accepts quote (status: CONFIRMED, converted to ORDER).
 * 5. Supplier Order Lifecycle & Transitions:
 *    - Status transitions: SUBMITTED -> CONFIRMED -> DISPATCHED -> DELIVERED.
 *    - Supplier cancellation and rejection.
 *    - Rejection of invalid transitions (e.g. SUBMITTED directly to DELIVERED).
 *    - RBAC: SUPPLIER_VIEWER cannot transition orders (HTTP 403).
 *    - Isolation: Supplier Beta cannot view or transition Supplier Alpha orders (HTTP 404).
 * 6. Atomic & Idempotent Warehouse Receipt & Inventory Integration:
 *    - Row-level lock (SELECT ... FOR UPDATE) and persistent idempotency.
 *    - Rejection of over-receipt (sheets exceeding order balance).
 *    - Rejection if idempotency-key missing.
 *    - Stock increment in predictive_material_inventory.
 *    - Emission of immutable audit event in material_inventory_events.
 *    - Idempotent replay: sending same key returns cached result without double-incrementing stock.
 *    - Mismatched payload with reused idempotency key rejected (HTTP 409).
 *    - Partial receipts tracking cumulative received sheets and quantities.
 * 7. Supplier Dashboard Operational Aggregates:
 *    - Real verified counts for catalogVariants, offers, pendingRequests, activeOrders, completedOrders.
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
const paperOfferService = require('../src/api/services/paperOfferService');
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
const executionSchemaName = `ppos_test_pord_${executionRunToken}`;

let connectionPool = null;
let adminPool = null;
let isDbConfigured = Boolean(process.env.TEST_MYSQL_HOST && process.env.TEST_MYSQL_PORT && process.env.TEST_MYSQL_USER && process.env.TEST_MYSQL_PASSWORD !== undefined);

describe('Iterations I4 & I5: Paper Procurement Orders & Warehouse Receipts', () => {

    describe('1. Physical Calculations & Monetary Pricing & RBAC Matrix', () => {
        const sampleVariant = {
            width_mm: 700,
            height_mm: 1000,
            gsm: 130
        }; // sheet weight = 0.7 * 1.0 * 130 / 1000 = 0.091 kg

        it('calculates physical sheets accurately across SHEET, THOUSAND_SHEETS, PACK, KG, and TONNE', () => {
            // SHEET: 5,000 sheets
            expect(paperProcurementService.calculateSheets(5000, 'SHEET', sampleVariant)).toBe(5000);

            // THOUSAND_SHEETS: 5 units -> 5,000 sheets
            expect(paperProcurementService.calculateSheets(5, 'THOUSAND_SHEETS', sampleVariant)).toBe(5000);

            // PACK (500 sheets/pack): 10 packs -> 5,000 sheets
            expect(paperProcurementService.calculateSheets(10, 'PACK', sampleVariant, 500)).toBe(5000);

            // KG: 455 kg / 0.091 kg/sheet = 5,000 sheets
            expect(paperProcurementService.calculateSheets(455, 'KG', sampleVariant)).toBe(5000);

            // TONNE: 0.455 tonnes -> 455 kg -> 5,000 sheets
            expect(paperProcurementService.calculateSheets(0.455, 'TONNE', sampleVariant)).toBe(5000);

            // Error cases
            expect(() => paperProcurementService.calculateSheets(-10, 'SHEET', sampleVariant)).toThrow(/positive finite number/);
            expect(() => paperProcurementService.calculateSheets(10, 'PACK', sampleVariant, 0)).toThrow(/positive integer/);
            expect(() => paperProcurementService.calculateSheets(10, 'UNSUPPORTED_BASIS', sampleVariant)).toThrow(/Unsupported quantity basis/);
        });

        it('calculates total monetary amount across all price bases deterministically', () => {
            const totalSheets = 5000;

            // SHEET: 0.182 EUR/sheet * 5000 sheets = 910.00 EUR
            expect(paperProcurementService.calculateTotalAmount(0.182, 'SHEET', totalSheets, sampleVariant)).toBe(910.00);

            // THOUSAND_SHEETS: 182 EUR/1000 sheets = 910.00 EUR
            expect(paperProcurementService.calculateTotalAmount(182, 'THOUSAND_SHEETS', totalSheets, sampleVariant)).toBe(910.00);

            // PACK: 91 EUR / pack (500 sheets/pack) = 910.00 EUR
            expect(paperProcurementService.calculateTotalAmount(91, 'PACK', totalSheets, sampleVariant, 500)).toBe(910.00);

            // KG: 2.00 EUR/kg -> 5000 sheets * 0.091 kg = 455 kg * 2.00 = 910.00 EUR
            expect(paperProcurementService.calculateTotalAmount(2.00, 'KG', totalSheets, sampleVariant)).toBe(910.00);

            // TONNE: 2000 EUR/tonne -> 0.455 tonnes * 2000 = 910.00 EUR
            expect(paperProcurementService.calculateTotalAmount(2000, 'TONNE', totalSheets, sampleVariant)).toBe(910.00);

            // Error case
            expect(() => paperProcurementService.calculateTotalAmount(100, 'INVALID_BASIS', totalSheets, sampleVariant)).toThrow(/Unsupported price basis/);
        });

        it('validates placeOrderOrRfq payload constraints fail-closed', async () => {
            await expect(
                paperProcurementService.placeOrderOrRfq({}, { type: 'INVALID_TYPE' })
            ).rejects.toThrow(/Invalid order type/);

            await expect(
                paperProcurementService.placeOrderOrRfq({}, { type: 'ORDER' })
            ).rejects.toThrow(/TENANT_ID_REQUIRED/);

            await expect(
                paperProcurementService.placeOrderOrRfq({ tenantId: 't1' }, { type: 'ORDER' })
            ).rejects.toThrow(/PRINTHOUSE_ID_REQUIRED/);
        });

        it('enforces RBAC permission hierarchy across printhouse and supplier routes', async () => {
            const printhouseViewerToken = generateToken({
                userId: 'buyer-viewer',
                role: 'PRINTHOUSE_VIEWER',
                tenantId: 'tenant_printhouse_alpha',
                printhouseId: 'node_plant_frankfurt'
            });

            // PRINTHOUSE_VIEWER cannot place orders (POST /sourcing/orders) -> 403
            const orderRes = await dispatch(materialsAdminRouter, {
                method: 'POST',
                url: '/sourcing/orders',
                headers: { authorization: `Bearer ${printhouseViewerToken}` },
                body: { type: 'ORDER', offerId: 'off_test' }
            });
            expect(orderRes.statusCode).toBe(403);

            // PRINTHOUSE_VIEWER cannot accept quote -> 403
            const acceptRes = await dispatch(materialsAdminRouter, {
                method: 'POST',
                url: '/procurements/paper-orders/ord_test/accept-quote',
                headers: { authorization: `Bearer ${printhouseViewerToken}` }
            });
            expect(acceptRes.statusCode).toBe(403);

            // PRINTHOUSE_VIEWER cannot execute warehouse receipt -> 403
            const receiveRes = await dispatch(materialsAdminRouter, {
                method: 'POST',
                url: '/procurements/paper-orders/ord_test/receive',
                headers: { authorization: `Bearer ${printhouseViewerToken}` },
                body: { receivedSheets: 100 }
            });
            expect(receiveRes.statusCode).toBe(403);

            // Supplier user cannot access printhouse materials routes -> 403
            const supplierToken = generateToken({
                userId: 'supp-user',
                role: 'SUPPLIER_ADMIN',
                tenantId: 'tenant_supplier_one',
                supplierId: 'supp_scheufelen'
            });
            const supplierForbiddenRes = await dispatch(materialsAdminRouter, {
                method: 'GET',
                url: '/sourcing/offers',
                headers: { authorization: `Bearer ${supplierToken}` }
            });
            expect(supplierForbiddenRes.statusCode).toBe(403);
        });
    });

    describe('2. Real Ephemeral MySQL Execution & Procurement Workflows', () => {
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

            // Seed test tenants (buyer printhouses and supplier organizations)
            await connectionPool.query(`
                INSERT INTO tenants (id, name, status) VALUES
                ('tenant_printhouse_alpha', 'Printhouse Alpha GmbH', 'ACTIVE'),
                ('tenant_printhouse_beta', 'Printhouse Beta SL', 'ACTIVE'),
                ('tenant_supplier_one', 'Papierfabrik Scheufelen', 'ACTIVE'),
                ('tenant_supplier_two', 'Fedrigoni Group', 'ACTIVE')
                ON DUPLICATE KEY UPDATE name=VALUES(name)
            `);

            // Seed paper suppliers
            await connectionPool.query(`
                INSERT INTO paper_suppliers (id, tenant_id, name, status, contact_email, currencies_json) VALUES
                ('supp_scheufelen', 'tenant_supplier_one', 'Scheufelen Paper Europe', 'ACTIVE', 'sales@scheufelen.de', '["EUR"]'),
                ('supp_fedrigoni', 'tenant_supplier_two', 'Fedrigoni Papers', 'ACTIVE', 'orders@fedrigoni.it', '["EUR", "USD"]')
                ON DUPLICATE KEY UPDATE name=VALUES(name)
            `);

            // Seed supplier memberships
            await connectionPool.query(`
                INSERT INTO supplier_memberships (id, user_id, tenant_id, supplier_id, supplier_role, is_active) VALUES
                ('mem_viewer', 'viewer-user', 'tenant_supplier_one', 'supp_scheufelen', 'SUPPLIER_VIEWER', 1),
                ('mem_operator', 'user-proc-alpha-1', 'tenant_supplier_one', 'supp_scheufelen', 'SUPPLIER_OPERATOR', 1)
                ON DUPLICATE KEY UPDATE supplier_role=VALUES(supplier_role)
            `);

            // Seed tenant capabilities (required by requireSupplierScope)
            await connectionPool.query(`
                INSERT INTO tenant_capabilities (id, tenant_id, capability, is_active) VALUES
                ('cap_supp1', 'tenant_supplier_one', 'PAPER_SUPPLIER', 1),
                ('cap_supp2', 'tenant_supplier_two', 'PAPER_SUPPLIER', 1),
                ('cap_print1', 'tenant_printhouse_alpha', 'PRINTHOUSE', 1),
                ('cap_print2', 'tenant_printhouse_beta', 'PRINTHOUSE', 1)
                ON DUPLICATE KEY UPDATE is_active=VALUES(is_active)
            `);

            // Seed printer nodes (production centers for printhouses)
            await connectionPool.query(`
                INSERT INTO printer_nodes (id, tenant_id, name, country, city, email, status) VALUES
                ('node_plant_frankfurt', 'tenant_printhouse_alpha', 'Frankfurt Main Plant', 'DE', 'Frankfurt', 'plant-frankfurt@alpha.de', 'ACTIVE'),
                ('node_plant_madrid', 'tenant_printhouse_beta', 'Madrid Getafe Plant', 'ES', 'Madrid', 'plant-madrid@beta.es', 'ACTIVE')
                ON DUPLICATE KEY UPDATE name=VALUES(name)
            `);

            // Seed product and variants
            await connectionPool.query(`
                INSERT INTO paper_products (id, name, category, brand, manufacturer, description) VALUES
                ('prod_phoenix', 'Phoenixmotion Xenon', 'COATED', 'Phoenixmotion', 'Scheufelen', 'Premium semi-matte coated paper'),
                ('prod_splendorgel', 'Splendorgel Extra White', 'UNCOATED', 'Splendorgel', 'Fedrigoni', 'Ultra-smooth premium woodfree paper')
                ON DUPLICATE KEY UPDATE name=VALUES(name)
            `);

            await connectionPool.query(`
                INSERT INTO paper_variants (id, product_id, gsm, width_mm, height_mm, finish, grain_direction, fingerprint) VALUES
                ('var_phoenix_150_70100', 'prod_phoenix', 150, 700.00, 1000.00, 'MATTE', 'LONG_GRAIN', 'fp_phoenix_150_70100'),
                ('var_splendor_300_72102', 'prod_splendorgel', 300, 720.00, 1020.00, 'SMOOTH', 'SHORT_GRAIN', 'fp_splendor_300_72102')
                ON DUPLICATE KEY UPDATE gsm=VALUES(gsm)
            `);

            // Seed supplier catalog association
            await connectionPool.query(`
                INSERT INTO supplier_paper_catalog_variants (id, tenant_id, supplier_id, variant_id, status) VALUES
                ('spcv_test_1', 'tenant_supplier_one', 'supp_scheufelen', 'var_phoenix_150_70100', 'ACTIVE'),
                ('spcv_test_2', 'tenant_supplier_two', 'supp_fedrigoni', 'var_splendor_300_72102', 'ACTIVE')
                ON DUPLICATE KEY UPDATE status=VALUES(status)
            `);

            // Seed offers:
            // 1. Marketplace offer from Scheufelen (visible to all)
            // 2. Approved-customers offer from Fedrigoni (approved ONLY for tenant_printhouse_alpha via metadata_json)
            // 3. Private offer from Scheufelen (owned by tenant_supplier_one)
            await connectionPool.query(`
                INSERT INTO supplier_paper_offers (
                    id, tenant_id, supplier_id, variant_id, supplier_sku, price_amount, currency,
                    price_basis, moq, order_multiple, sheets_per_pack, visibility, status, metadata_json
                ) VALUES
                ('off_mkt_phoenix', 'tenant_supplier_one', 'supp_scheufelen', 'var_phoenix_150_70100', 'SKU-PHX-150-MKT', 1.85, 'EUR', 'KG', 500, 50, NULL, 'MARKETPLACE', 'ACTIVE', NULL),
                ('off_app_splendor', 'tenant_supplier_two', 'supp_fedrigoni', 'var_splendor_300_72102', 'SKU-SPL-300-VIP', 2.40, 'EUR', 'SHEET', 1000, 500, 250, 'APPROVED_CUSTOMERS', 'ACTIVE', '{"approved_customer_ids": ["tenant_printhouse_alpha"]}'),
                ('off_priv_phoenix', 'tenant_supplier_one', 'supp_scheufelen', 'var_phoenix_150_70100', 'SKU-PHX-150-PRIV', 1.50, 'EUR', 'KG', 1000, 100, NULL, 'PRIVATE', 'ACTIVE', NULL)
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

        it('strictly enforces offer visibility matrix for printhouse buyers', async () => {
            if (!isDbConfigured) return;

            // Buyer Alpha queries visible offers
            const alphaRes = await paperProcurementService.searchVisibleOffers('tenant_printhouse_alpha');
            const alphaSkus = alphaRes.items.map(o => o.supplierSku);

            expect(alphaSkus).toContain('SKU-PHX-150-MKT'); // MARKETPLACE
            expect(alphaSkus).toContain('SKU-SPL-300-VIP'); // APPROVED_CUSTOMERS (Alpha is in approved list)
            expect(alphaSkus).not.toContain('SKU-PHX-150-PRIV'); // PRIVATE (not owned by Alpha)

            // Buyer Beta queries visible offers
            const betaRes = await paperProcurementService.searchVisibleOffers('tenant_printhouse_beta');
            const betaSkus = betaRes.items.map(o => o.supplierSku);

            expect(betaSkus).toContain('SKU-PHX-150-MKT'); // MARKETPLACE
            expect(betaSkus).not.toContain('SKU-SPL-300-VIP'); // APPROVED_CUSTOMERS (Beta is NOT approved)
            expect(betaSkus).not.toContain('SKU-PHX-150-PRIV'); // PRIVATE
        });

        it('enforces MOQ and order step during order placement, preserving immutable snapshot', async () => {
            if (!isDbConfigured) return;

            const actorAlpha = {
                tenantId: 'tenant_printhouse_alpha',
                printhouseId: 'node_plant_frankfurt',
                userId: 'buyer-alpha-user'
            };

            // 1. Rejects quantity below MOQ (MOQ is 500 kg)
            await expect(paperProcurementService.placeOrderOrRfq(actorAlpha, {
                type: 'ORDER',
                offerId: 'off_mkt_phoenix',
                variantId: 'var_phoenix_150_70100',
                orderedQuantity: 300, // below 500
                quantityBasis: 'KG',
                printhouseId: 'node_plant_frankfurt'
            })).rejects.toThrow(/below Minimum Order Quantity/);

            // 2. Rejects quantity not matching order_multiple step (MOQ 500, step 50 -> 525 is invalid)
            await expect(paperProcurementService.placeOrderOrRfq(actorAlpha, {
                type: 'ORDER',
                offerId: 'off_mkt_phoenix',
                variantId: 'var_phoenix_150_70100',
                orderedQuantity: 525, // not multiple of 50
                quantityBasis: 'KG',
                printhouseId: 'node_plant_frankfurt'
            })).rejects.toThrow(/must align with orderMultiple step/);

            // 3. Rejects delivery center belonging to another tenant
            await expect(paperProcurementService.placeOrderOrRfq(actorAlpha, {
                type: 'ORDER',
                offerId: 'off_mkt_phoenix',
                variantId: 'var_phoenix_150_70100',
                orderedQuantity: 500,
                quantityBasis: 'KG',
                printhouseId: 'node_plant_madrid' // belongs to Beta!
            })).rejects.toThrow(/FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS/);

            // 4. Places valid order
            const order = await paperProcurementService.placeOrderOrRfq(actorAlpha, {
                type: 'ORDER',
                offerId: 'off_mkt_phoenix',
                variantId: 'var_phoenix_150_70100',
                orderedQuantity: 500,
                quantityBasis: 'KG',
                printhouseId: 'node_plant_frankfurt',
                buyerNotes: 'Urgent press run for catalogue'
            });

            expect(order).toBeDefined();
            expect(order.status).toBe('SUBMITTED');
            expect(order.orderType).toBe('ORDER');
            expect(order.orderedQuantity).toBe(500);
            expect(order.orderedQuantityBasis).toBe('KG');
            expect(order.snapshot.productName).toBe('Phoenixmotion Xenon');
            expect(order.snapshot.gsm).toBe(150);
            expect(order.snapshot.widthMm).toBe(700);
            expect(order.snapshot.heightMm).toBe(1000);
            expect(order.snapshot.pricePerBasis).toBe(1.85);
            expect(order.snapshot.currency).toBe('EUR');
            expect(order.totalSheets).toBeGreaterThan(0);
            expect(order.totalAmount).toBeGreaterThan(0);

            // 5. Verify snapshot immutability: changing the offer does NOT alter historical order
            await connectionPool.query(
                "UPDATE supplier_paper_offers SET price_amount = 99.99 WHERE id = 'off_mkt_phoenix'"
            );

            const fetchedOrder = await paperProcurementService.getSupplierOrderById('supp_scheufelen', order.id);
            expect(fetchedOrder.snapshot.pricePerBasis).toBe(1.85);
            expect(fetchedOrder.totalAmount).toBe(order.totalAmount);

            // Restore price
            await connectionPool.query(
                "UPDATE supplier_paper_offers SET price_amount = 1.85 WHERE id = 'off_mkt_phoenix'"
            );
        });

        it('completes bidirectional RFQ workflow: submit -> quote -> accept -> confirm', async () => {
            if (!isDbConfigured) return;

            const actorAlpha = {
                tenantId: 'tenant_printhouse_alpha',
                printhouseId: 'node_plant_frankfurt',
                userId: 'buyer-alpha-user'
            };

            // 1. Printhouse submits RFQ for custom quantity
            const rfq = await paperProcurementService.placeOrderOrRfq(actorAlpha, {
                type: 'RFQ',
                offerId: 'off_app_splendor',
                variantId: 'var_splendor_300_72102',
                orderedQuantity: 12000,
                quantityBasis: 'SHEET',
                printhouseId: 'node_plant_frankfurt',
                buyerNotes: 'Need special volume quote for 12,000 sheets'
            });

            expect(rfq.status).toBe('SUBMITTED');
            expect(rfq.orderType).toBe('RFQ');

            // 2. Supplier views RFQ in list and quotes it
            const supplierList = await paperProcurementService.listSupplierOrders('supp_fedrigoni', { status: 'SUBMITTED' });
            expect(supplierList.counts.submitted).toBeGreaterThanOrEqual(1);

            const quoted = await paperProcurementService.transitionSupplierOrder('supp_fedrigoni', rfq.id, 'QUOTE', {
                pricePerBasis: 2.10, // Discounted from 2.40
                priceBasis: 'SHEET',
                expectedDeliveryDate: '2026-11-15T10:00:00Z',
                supplierNotes: 'Special volume tier agreed at 2.10 EUR/sheet'
            });

            expect(quoted.status).toBe('QUOTED');
            expect(quoted.snapshot.pricePerBasis).toBe(2.10);
            expect(quoted.totalAmount).toBe(12000 * 2.10);

            // 3. Printhouse accepts quote, converting to CONFIRMED ORDER
            const confirmed = await paperProcurementService.acceptRfqQuote(actorAlpha, rfq.id);
            expect(confirmed.status).toBe('CONFIRMED');
            expect(confirmed.orderType).toBe('ORDER');
        });

        it('executes supplier order fulfillment state transitions and rejects illegal transitions', async () => {
            if (!isDbConfigured) return;

            const actorAlpha = {
                tenantId: 'tenant_printhouse_alpha',
                printhouseId: 'node_plant_frankfurt',
                userId: 'buyer-alpha-user'
            };

            const order = await paperProcurementService.placeOrderOrRfq(actorAlpha, {
                type: 'ORDER',
                offerId: 'off_mkt_phoenix',
                variantId: 'var_phoenix_150_70100',
                orderedQuantity: 500,
                quantityBasis: 'KG',
                printhouseId: 'node_plant_frankfurt'
            });

            // Rejects illegal transition: SUBMITTED directly to DELIVERED
            await expect(
                paperProcurementService.transitionSupplierOrder('supp_scheufelen', order.id, 'DELIVER')
            ).rejects.toThrow(/Cannot mark delivered/);

            // Valid lifecycle: CONFIRM
            const confirmed = await paperProcurementService.transitionSupplierOrder('supp_scheufelen', order.id, 'CONFIRM', {
                supplierNotes: 'Confirmed for production slot'
            });
            expect(confirmed.status).toBe('CONFIRMED');

            // DISPATCH
            const dispatched = await paperProcurementService.transitionSupplierOrder('supp_scheufelen', order.id, 'DISPATCH', {
                supplierNotes: 'Dispatched via Dachser Tracking #DACH-99281'
            });
            expect(dispatched.status).toBe('DISPATCHED');
            expect(dispatched.dispatchedAt).toBeDefined();

            // DELIVER
            const delivered = await paperProcurementService.transitionSupplierOrder('supp_scheufelen', order.id, 'DELIVER', {
                supplierNotes: 'Delivered at dock 2'
            });
            expect(delivered.status).toBe('DELIVERED');
            expect(delivered.deliveredAt).toBeDefined();

            // Cross-supplier isolation: Fedrigoni cannot transition Scheufelen order
            await expect(
                paperProcurementService.transitionSupplierOrder('supp_fedrigoni', order.id, 'CANCEL')
            ).rejects.toThrow(/ORDER_NOT_FOUND/);
        });

        it('executes atomic warehouse receipt, increments stock, logs audit event, and enforces persistent idempotency', async () => {
            if (!isDbConfigured) return;

            const actorAlpha = {
                tenantId: 'tenant_printhouse_alpha',
                printhouseId: 'node_plant_frankfurt',
                userId: 'receiver-alpha-user'
            };

            // Place and confirm order
            const order = await paperProcurementService.placeOrderOrRfq(actorAlpha, {
                type: 'ORDER',
                offerId: 'off_mkt_phoenix',
                variantId: 'var_phoenix_150_70100',
                orderedQuantity: 500, // ~4762 sheets
                quantityBasis: 'KG',
                printhouseId: 'node_plant_frankfurt'
            });

            await paperProcurementService.transitionSupplierOrder('supp_scheufelen', order.id, 'CONFIRM');
            await paperProcurementService.transitionSupplierOrder('supp_scheufelen', order.id, 'DISPATCH');

            const orderDetail = await paperProcurementService.getSupplierOrderById('supp_scheufelen', order.id);
            const totalOrderedSheets = orderDetail.totalSheets;
            expect(totalOrderedSheets).toBeGreaterThan(0);

            const idempotencyKey = `rcv_key_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

            // 1. Rejects missing idempotency key
            await expect(
                paperProcurementService.receiveOrderAtomic(order.id, actorAlpha, {
                    receivedSheets: totalOrderedSheets,
                    idempotencyKey: ''
                })
            ).rejects.toThrow(/IDEMPOTENCY_KEY_REQUIRED/);

            // 2. Rejects over-receipt (more sheets than ordered)
            await expect(
                paperProcurementService.receiveOrderAtomic(order.id, actorAlpha, {
                    receivedSheets: totalOrderedSheets + 1000,
                    idempotencyKey: `${idempotencyKey}_overflow`
                })
            ).rejects.toThrow(/RECEIPT_EXCEEDS_ORDERED_QUANTITY/);

            // 3. Cross-tenant receipt rejection: Printhouse Beta cannot receive Printhouse Alpha order
            const actorBeta = {
                tenantId: 'tenant_printhouse_beta',
                printhouseId: 'node_plant_madrid',
                userId: 'intruder-user'
            };
            await expect(
                paperProcurementService.receiveOrderAtomic(order.id, actorBeta, {
                    receivedSheets: totalOrderedSheets,
                    idempotencyKey: `${idempotencyKey}_beta`
                })
            ).rejects.toThrow(/FORBIDDEN_CROSS_TENANT_ORDER_RECEIPT/);

            // 4. Valid Receipt Execution
            const receiptResult = await paperProcurementService.receiveOrderAtomic(order.id, actorAlpha, {
                receivedSheets: totalOrderedSheets,
                receivedQuantity: 500,
                idempotencyKey,
                notes: 'Received in perfect condition on 2 pallets'
            });

            expect(receiptResult.ok).toBe(true);
            expect(receiptResult.idempotentReplay).toBe(false);
            expect(receiptResult.receivedSheets).toBe(totalOrderedSheets);
            expect(receiptResult.orderStatus).toBe('RECEIVED');
            expect(receiptResult.newStock).toBeGreaterThanOrEqual(totalOrderedSheets);

            // 5. Verify stock increment in predictive_material_inventory
            const [stockRows] = await connectionPool.query(
                "SELECT current_stock_units FROM predictive_material_inventory WHERE tenant_id = 'tenant_printhouse_alpha'"
            );
            expect(stockRows.length).toBeGreaterThan(0);
            expect(Number(stockRows[0].current_stock_units)).toBe(receiptResult.newStock);

            // 6. Verify audit event in material_inventory_events
            const [eventRows] = await connectionPool.query(
                "SELECT * FROM material_inventory_events WHERE event_type = 'PROCUREMENT_RECEIPT' ORDER BY created_at DESC LIMIT 1"
            );
            expect(eventRows.length).toBe(1);
            expect(Number(eventRows[0].quantity_units)).toBe(totalOrderedSheets);

            // 7. Idempotent Replay: sending identical idempotency key returns cached receipt without stock mutation
            const replayResult = await paperProcurementService.receiveOrderAtomic(order.id, actorAlpha, {
                receivedSheets: totalOrderedSheets,
                receivedQuantity: 500,
                idempotencyKey
            });

            expect(replayResult.ok).toBe(true);
            expect(replayResult.idempotentReplay).toBe(true);
            expect(replayResult.receiptNumber).toBe(receiptResult.receiptNumber);

            // Stock has NOT increased
            const [stockAfterReplay] = await connectionPool.query(
                "SELECT current_stock_units FROM predictive_material_inventory WHERE tenant_id = 'tenant_printhouse_alpha'"
            );
            expect(Number(stockAfterReplay[0].current_stock_units)).toBe(receiptResult.newStock);

            // 8. Rejects payload mismatch with reused key
            await expect(
                paperProcurementService.receiveOrderAtomic(order.id, actorAlpha, {
                    receivedSheets: Math.round(totalOrderedSheets / 2), // Different quantity!
                    idempotencyKey
                })
            ).rejects.toThrow(/IDEMPOTENCY_PAYLOAD_MISMATCH/);
        });

        it('supports partial delivery receipts tracking cumulative received balance', async () => {
            if (!isDbConfigured) return;

            const actorAlpha = {
                tenantId: 'tenant_printhouse_alpha',
                printhouseId: 'node_plant_frankfurt',
                userId: 'receiver-alpha-user'
            };

            const order = await paperProcurementService.placeOrderOrRfq(actorAlpha, {
                type: 'ORDER',
                offerId: 'off_mkt_phoenix',
                variantId: 'var_phoenix_150_70100',
                orderedQuantity: 1000,
                quantityBasis: 'KG',
                printhouseId: 'node_plant_frankfurt'
            });

            await paperProcurementService.transitionSupplierOrder('supp_scheufelen', order.id, 'CONFIRM');
            await paperProcurementService.transitionSupplierOrder('supp_scheufelen', order.id, 'DISPATCH');

            const orderDetail = await paperProcurementService.getSupplierOrderById('supp_scheufelen', order.id);
            const totalSheets = orderDetail.totalSheets;
            const halfSheets = Math.floor(totalSheets / 2);

            // Receipt 1: Partial delivery (half)
            const partialResult = await paperProcurementService.receiveOrderAtomic(order.id, actorAlpha, {
                receivedSheets: halfSheets,
                receivedQuantity: 500,
                idempotencyKey: `part1_${Date.now()}`
            });

            expect(partialResult.orderStatus).toBe('PARTIALLY_RECEIVED');

            const afterPart1 = await paperProcurementService.getSupplierOrderById('supp_scheufelen', order.id);
            expect(afterPart1.status).toBe('PARTIALLY_RECEIVED');
            expect(afterPart1.receivedSheets).toBe(halfSheets);

            // Receipt 2: Remainder delivery
            const remainingSheets = totalSheets - halfSheets;
            const finalResult = await paperProcurementService.receiveOrderAtomic(order.id, actorAlpha, {
                receivedSheets: remainingSheets,
                receivedQuantity: 500,
                idempotencyKey: `part2_${Date.now()}`
            });

            expect(finalResult.orderStatus).toBe('RECEIVED');

            const afterFinal = await paperProcurementService.getSupplierOrderById('supp_scheufelen', order.id);
            expect(afterFinal.status).toBe('RECEIVED');
            expect(afterFinal.receivedSheets).toBe(totalSheets);
            expect(afterFinal.receipts.length).toBe(2);
        });

        it('handles concurrent receipt requests safely without duplicating stock', async () => {
            if (!isDbConfigured) return;

            const actorAlpha = {
                tenantId: 'tenant_printhouse_alpha',
                printhouseId: 'node_plant_frankfurt',
                userId: 'receiver-alpha-user'
            };

            const order = await paperProcurementService.placeOrderOrRfq(actorAlpha, {
                type: 'ORDER',
                offerId: 'off_mkt_phoenix',
                variantId: 'var_phoenix_150_70100',
                orderedQuantity: 1000,
                quantityBasis: 'KG',
                printhouseId: 'node_plant_frankfurt'
            });

            await paperProcurementService.transitionSupplierOrder('supp_scheufelen', order.id, 'CONFIRM');
            await paperProcurementService.transitionSupplierOrder('supp_scheufelen', order.id, 'DISPATCH');

            const orderDetail = await paperProcurementService.getSupplierOrderById('supp_scheufelen', order.id);
            const totalSheets = orderDetail.totalSheets;

            // Two concurrent receipt requests with different idempotency keys for the entire order
            const p1 = paperProcurementService.receiveOrderAtomic(order.id, actorAlpha, {
                receivedSheets: totalSheets,
                receivedQuantity: 1000,
                idempotencyKey: `conc_key_1_${Date.now()}`
            });
            const p2 = paperProcurementService.receiveOrderAtomic(order.id, actorAlpha, {
                receivedSheets: totalSheets,
                receivedQuantity: 1000,
                idempotencyKey: `conc_key_2_${Date.now()}`
            });

            const results = await Promise.allSettled([p1, p2]);
            const fulfilled = results.filter(r => r.status === 'fulfilled');
            const rejected = results.filter(r => r.status === 'rejected');

            // Due to row-level locking (SELECT ... FOR UPDATE), exactly one should succeed, and the other fails with over-receipt / already received
            expect(fulfilled.length).toBe(1);
            expect(rejected.length).toBe(1);

            const finalOrder = await paperProcurementService.getSupplierOrderById('supp_scheufelen', order.id);
            expect(finalOrder.receivedSheets).toBe(totalSheets);
            expect(finalOrder.status).toBe('RECEIVED');
        });

        it('rolls back completely without stock movements or notifications on failure before commit', async () => {
            if (!isDbConfigured) return;

            const actorAlpha = {
                tenantId: 'tenant_printhouse_alpha',
                printhouseId: 'node_plant_frankfurt',
                userId: 'receiver-alpha-user'
            };

            const order = await paperProcurementService.placeOrderOrRfq(actorAlpha, {
                type: 'ORDER',
                offerId: 'off_mkt_phoenix',
                variantId: 'var_phoenix_150_70100',
                orderedQuantity: 1000,
                quantityBasis: 'KG',
                printhouseId: 'node_plant_frankfurt'
            });

            await paperProcurementService.transitionSupplierOrder('supp_scheufelen', order.id, 'CONFIRM');
            await paperProcurementService.transitionSupplierOrder('supp_scheufelen', order.id, 'DISPATCH');

            // Count receipts and events before failed attempt
            const [receiptsBefore] = await connectionPool.query("SELECT COUNT(*) AS c FROM supplier_paper_order_receipts WHERE order_id = ?", [order.id]);
            const [eventsBefore] = await connectionPool.query("SELECT COUNT(*) AS c FROM material_inventory_events");

            // Attempt receipt with invalid non-positive receivedSheets (triggers error inside service)
            await expect(
                paperProcurementService.receiveOrderAtomic(order.id, actorAlpha, {
                    receivedSheets: -50,
                    idempotencyKey: `fail_key_${Date.now()}`
                })
            ).rejects.toThrow();

            // Verify no receipts added
            const [receiptsAfter] = await connectionPool.query("SELECT COUNT(*) AS c FROM supplier_paper_order_receipts WHERE order_id = ?", [order.id]);
            expect(receiptsAfter[0].c).toBe(receiptsBefore[0].c);

            // Verify no events added
            const [eventsAfter] = await connectionPool.query("SELECT COUNT(*) AS c FROM material_inventory_events");
            expect(eventsAfter[0].c).toBe(eventsBefore[0].c);

            // Verify order status unchanged
            const unchangedOrder = await paperProcurementService.getSupplierOrderById('supp_scheufelen', order.id);
            expect(unchangedOrder.status).toBe('DISPATCHED');
            expect(unchangedOrder.receivedSheets).toBe(0);
        });

        it('computes verified aggregate metrics for Supplier Dashboard cards', async () => {
            if (!isDbConfigured) return;

            const stats = await paperProcurementService.getSupplierDashboardStats('supp_scheufelen');

            expect(stats.catalogVariants).toBeGreaterThanOrEqual(1);
            expect(stats.offers.total).toBeGreaterThanOrEqual(1);
            expect(stats.offers.active).toBeGreaterThanOrEqual(1);
            expect(typeof stats.pendingRequests).toBe('number');
            expect(typeof stats.activeOrders).toBe('number');
            expect(typeof stats.completedOrders).toBe('number');
        });

        it('verifies HTTP API routes via Express routers with role-based access control', async () => {
            if (!isDbConfigured) return;

            // 1. Dashboard stats via paperSuppliersRouter (VIEWER allowed)
            const viewerToken = generateToken({
                userId: 'viewer-user',
                role: 'SUPPLIER_VIEWER',
                tenantId: 'tenant_supplier_one',
                supplierId: 'supp_scheufelen'
            });

            const statsRes = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/dashboard/stats',
                headers: { authorization: `Bearer ${viewerToken}` }
            });

            expect(statsRes.statusCode).toBe(200);
            expect(statsRes.body.ok).toBe(true);
            expect(statsRes.body.data.catalogVariants).toBeDefined();

            // 2. Order transition via paperSuppliersRouter: VIEWER rejected with HTTP 403
            const transitionViewerRes = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: '/orders/fake-order-id/transition',
                headers: { authorization: `Bearer ${viewerToken}` },
                body: { action: 'CONFIRM' }
            });

            expect(transitionViewerRes.statusCode).toBe(403);

            // 2b. Offer creation via paperSuppliersRouter: VIEWER rejected with HTTP 403
            const offerCreateRes = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: '/offers',
                headers: { authorization: `Bearer ${viewerToken}` },
                body: { variantId: 'var_fake', priceAmount: 1.50 }
            });
            expect(offerCreateRes.statusCode).toBe(403);

            // 2c. Offer deletion via paperSuppliersRouter: OPERATOR rejected with HTTP 403 (ADMIN only)
            const operatorToken = generateToken({
                userId: 'operator-user',
                role: 'SUPPLIER_OPERATOR',
                tenantId: 'tenant_supplier_one',
                supplierId: 'supp_scheufelen'
            });
            const offerDeleteRes = await dispatch(paperSuppliersRouter, {
                method: 'DELETE',
                url: '/offers/off_fake_id',
                headers: { authorization: `Bearer ${operatorToken}` }
            });
            expect(offerDeleteRes.statusCode).toBe(403);

            // 3. Printhouse Sourcing Search via materialsAdminRouter
            const printhouseToken = generateToken({
                userId: 'buyer-operator',
                role: 'PRINTHOUSE_OPERATOR',
                tenantId: 'tenant_printhouse_alpha',
                printhouseId: 'node_plant_frankfurt'
            });

            const sourcingRes = await dispatch(materialsAdminRouter, {
                method: 'GET',
                url: '/sourcing/offers',
                headers: { authorization: `Bearer ${printhouseToken}` }
            });

            expect(sourcingRes.statusCode).toBe(200);
            expect(sourcingRes.body.ok).toBe(true);
            expect(Array.isArray(sourcingRes.body.data.items)).toBe(true);
        });
    });
});
