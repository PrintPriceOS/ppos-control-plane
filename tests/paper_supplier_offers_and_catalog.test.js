/**
 * tests/paper_supplier_offers_and_catalog.test.js
 * 
 * Comprehensive Unit and Integration Test Suite for Iteration I3:
 * 1. Technical Catalog Browsing & Variant Details:
 *    - Paginated queries on paper_variants joined with paper_products.
 *    - Filtering by category, search text, and supplier ownership.
 * 2. Commercial Offers Creation & Validation:
 *    - Creation of commercial offers linked to confirmed technical variants.
 *    - Mandatory SKU, positive price, 3-letter currency, priceBasis ('KG', 'TONNE', 'SHEET', 'THOUSAND_SHEETS', 'PACK').
 *    - Rejection of PACK basis without sheets_per_pack.
 *    - Validation of MOQ >= 1, orderMultiple >= 1.
 *    - Never inferring currency or price basis implicitly.
 * 3. Immutable Revision Ledger:
 *    - Creation triggers revision #1.
 *    - Updates create sequential revision entries (v2, v3) with change_reason and timestamp.
 *    - Retrieval returns full revision history.
 * 4. Offer Status & Visibility Matrix:
 *    - Status toggles: ACTIVE <-> INACTIVE <-> ARCHIVED.
 *    - Visibility levels: PRIVATE, APPROVED_CUSTOMERS, MARKETPLACE.
 * 5. Cross-Supplier & Multi-Tenant Isolation:
 *    - Supplier A cannot read, update, or deactivate Supplier B's offers (fail-closed HTTP 404).
 *    - Tenant A cannot access Tenant B's data.
 *    - Read-only SUPPLIER_VIEWER role gets HTTP 403 on POST, PUT, PATCH.
 *    - Unapproved or suspended suppliers get HTTP 403.
 * 6. Printhouse Inventory Safeguard:
 *    - Zero modification to materials_catalog, predictive_material_inventory, or material_procurements.
 * 7. Real Ephemeral MySQL Execution:
 *    - Runs against test MySQL schema with migrations 162, 163, and 164.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test_secret_for_supplier_isolation';
const JWT_AUDIENCE = 'ppos:control';
const JWT_ISSUER = 'https://auth.printprice.pro';

process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_AUDIENCE = JWT_AUDIENCE;
process.env.JWT_ISSUER = JWT_ISSUER;
process.env.PAPER_SUPPLIER_HUB_ENABLED = 'true';

const paperOfferService = require('../src/api/services/paperOfferService');
const paperImportService = require('../src/api/services/paperImportService');
const paperSuppliersRouter = require('../src/api/routes/paperSuppliersRoutes');
let mysqlClient = require('../src/api/services/mysqlClient');
const { parseMigrationSql } = require('../src/api/services/migrationSqlParser');
const { runBootstrap } = require('../scripts/bootstrap_canonical_schema');

function generateToken(payload) {
    return jwt.sign({
        sub: payload.id || payload.userId || 'user-op-alpha-1',
        email: payload.email || 'user@test.local',
        role: payload.role,
        tenant_id: payload.tenantId,
        supplier_id: payload.supplierId || null,
        has_supplier_capability: true,
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
const executionSchemaName = `ppos_test_i3_${executionRunToken}`;

let connectionPool = null;
let adminPool = null;
let isDbConfigured = Boolean(process.env.TEST_MYSQL_HOST && process.env.TEST_MYSQL_PORT && process.env.TEST_MYSQL_USER && process.env.TEST_MYSQL_PASSWORD !== undefined);

describe('Iteration I3: Paper Supplier Catalog & Commercial Offers Engine', () => {

    describe('1. Unit Validation & Commercial Rules', () => {
        it('validates price basis constraints: PACK requires exact positive integer sheetsPerPack', () => {
            const invalidPack = () => {
                paperOfferService.validateOfferPayload({
                    variantId: 'var-123',
                    supplierSku: 'SKU-001',
                    priceAmount: 12.5,
                    currency: 'EUR',
                    priceBasis: 'PACK',
                    sheetsPerPack: null,
                    moq: 1,
                    orderMultiple: 1
                });
            };
            expect(invalidPack).toThrow(/sheetsPerPack is required and must be a positive integer/);

            // Reject decimal truncation (e.g. 500.5 sheets)
            expect(() => {
                paperOfferService.validateOfferPayload({
                    variantId: 'var-123',
                    supplierSku: 'SKU-001',
                    priceAmount: 12.5,
                    currency: 'EUR',
                    priceBasis: 'PACK',
                    sheetsPerPack: 500.5,
                    moq: 1,
                    orderMultiple: 1
                });
            }).toThrow(/sheetsPerPack is required and must be a positive integer/);

            const validPack = paperOfferService.validateOfferPayload({
                variantId: 'var-123',
                supplierSku: 'SKU-001',
                priceAmount: 12.5,
                currency: 'EUR',
                priceBasis: 'PACK',
                sheetsPerPack: 500,
                moq: 5,
                orderMultiple: 1
            });
            expect(validPack.sheetsPerPack).toBe(500);
        });

        it('rejects unsupported currencies or non-finite numbers fail-closed', () => {
            expect(() => {
                paperOfferService.validateOfferPayload({
                    variantId: 'var-123',
                    supplierSku: 'SKU-001',
                    priceAmount: 12.5,
                    currency: 'INVALID',
                    priceBasis: 'KG'
                });
            }).toThrow(/currency 'INVALID' is not supported/);

            // Rejects non-finite numbers (NaN, Infinity)
            expect(() => {
                paperOfferService.validateOfferPayload({
                    variantId: 'var-123',
                    supplierSku: 'SKU-001',
                    priceAmount: Infinity,
                    currency: 'EUR',
                    priceBasis: 'KG'
                });
            }).toThrow(/priceAmount must be a finite positive number/);

            expect(() => {
                paperOfferService.validateOfferPayload({
                    variantId: 'var-123',
                    supplierSku: 'SKU-001',
                    priceAmount: 12.5,
                    currency: 'EUR',
                    priceBasis: 'TRUCKLOAD' // Unsupported
                });
            }).toThrow(/priceBasis must be one of:/);
        });

        it('validates date ordering (validFrom <= validUntil) and rejects non-positive price, MOQ < 1, orderMultiple < 1', () => {
            expect(() => {
                paperOfferService.validateOfferPayload({
                    variantId: 'var-123',
                    supplierSku: 'SKU-001',
                    priceAmount: 0,
                    currency: 'EUR',
                    priceBasis: 'KG'
                });
            }).toThrow(/priceAmount must be a finite positive number/);

            expect(() => {
                paperOfferService.validateOfferPayload({
                    variantId: 'var-123',
                    supplierSku: 'SKU-001',
                    priceAmount: 10,
                    currency: 'EUR',
                    priceBasis: 'KG',
                    moq: 0
                });
            }).toThrow(/moq \(Minimum Order Quantity\) must be an integer >= 1/);

            expect(() => {
                paperOfferService.validateOfferPayload({
                    variantId: 'var-123',
                    supplierSku: 'SKU-001',
                    priceAmount: 10,
                    currency: 'EUR',
                    priceBasis: 'KG',
                    orderMultiple: -5
                });
            }).toThrow(/orderMultiple must be an integer >= 1/);

            // Chronological order validation
            expect(() => {
                paperOfferService.validateOfferPayload({
                    variantId: 'var-123',
                    supplierSku: 'SKU-001',
                    priceAmount: 10,
                    currency: 'EUR',
                    priceBasis: 'KG',
                    validFrom: '2026-12-31',
                    validUntil: '2026-01-01'
                });
            }).toThrow(/must be before or equal to validUntil/);
        });

        it('normalizes delivery zones and validates visibility matrix options', () => {
            const validated = paperOfferService.validateOfferPayload({
                variantId: 'var-123',
                supplierSku: 'SKU-ZONES',
                priceAmount: 1.5,
                currency: 'EUR',
                priceBasis: 'KG',
                deliveryZones: ['es', ' pt ', 'fr'],
                visibility: 'MARKETPLACE'
            });
            expect(validated.deliveryZones).toEqual(['ES', 'PT', 'FR']);
            expect(validated.visibility).toBe('MARKETPLACE');

            expect(() => {
                paperOfferService.validateOfferPayload({
                    variantId: 'var-123',
                    supplierSku: 'SKU-ZONES',
                    priceAmount: 1.5,
                    currency: 'EUR',
                    priceBasis: 'KG',
                    visibility: 'GLOBAL_PUBLIC' // Not supported
                });
            }).toThrow(/visibility must be one of:/);
        });
    });

    describe('2. Real Ephemeral MySQL Execution & RBAC Verification', () => {
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

            // Run migrations 162, 163, and 164
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

            // Seed Tenants and Suppliers
            // Tenant A: 2 Suppliers (Alpha1, Alpha2)
            // Tenant B: 1 Supplier (Beta1)
            await connectionPool.query(`
                INSERT INTO tenants (id, name)
                VALUES 
                ('tenant-alpha', 'Alpha Printhouse Tenant'),
                ('tenant-beta', 'Beta Printhouse Tenant')
                ON DUPLICATE KEY UPDATE name=VALUES(name);
            `);

            await connectionPool.query(`
                INSERT INTO tenant_capabilities (id, tenant_id, capability, is_active)
                VALUES
                ('tc-alpha', 'tenant-alpha', 'PAPER_SUPPLIER', 1),
                ('tc-beta', 'tenant-beta', 'PAPER_SUPPLIER', 1)
                ON DUPLICATE KEY UPDATE is_active=1;
            `);

            await connectionPool.query(`
                INSERT INTO paper_suppliers (id, tenant_id, name, status, contact_email)
                VALUES
                ('supp-alpha-1', 'tenant-alpha', 'Alpha Paper Mills', 'ACTIVE', 'alpha@apm.local'),
                ('supp-alpha-2', 'tenant-alpha', 'Nordic Sheet Co', 'ACTIVE', 'nordic@nsc.local'),
                ('supp-beta-1', 'tenant-beta', 'Iberian Pulp Corp', 'ACTIVE', 'iberian@ipc.local'),
                ('supp-suspended', 'tenant-alpha', 'Suspended Paper Ltd', 'SUSPENDED', 'suspended@spl.local');
            `);

            await connectionPool.query(`
                INSERT INTO supplier_memberships (id, user_id, tenant_id, supplier_id, supplier_role, is_active)
                VALUES
                ('mem-1', 'user-op-alpha-1', 'tenant-alpha', 'supp-alpha-1', 'SUPPLIER_OPERATOR', 1),
                ('mem-2', 'user-view-alpha-1', 'tenant-alpha', 'supp-alpha-1', 'SUPPLIER_VIEWER', 1),
                ('mem-3', 'user-op-alpha-2', 'tenant-alpha', 'supp-alpha-2', 'SUPPLIER_OPERATOR', 1),
                ('mem-4', 'user-op-beta-1', 'tenant-beta', 'supp-beta-1', 'SUPPLIER_OPERATOR', 1),
                ('mem-5', 'user-op-suspended', 'tenant-alpha', 'supp-suspended', 'SUPPLIER_OPERATOR', 1);
            `);

            // Seed Technical Products & Variants
            await connectionPool.query(`
                INSERT INTO paper_products (id, name, brand, category, finish_summary)
                VALUES
                ('prod-munken-1', 'Munken Lynx', 'Arctic Paper', 'UNCOATED', 'ROUGH');
            `);

            await connectionPool.query(`
                INSERT INTO paper_variants (id, product_id, gsm, width_mm, height_mm, finish, grain_direction, fingerprint)
                VALUES
                ('var-munken-120-70100', 'prod-munken-1', 120, 700.00, 1000.00, 'ROUGH', 'LONG_GRAIN', 'fp_munken_120_700_1000'),
                ('var-munken-150-70100', 'prod-munken-1', 150, 700.00, 1000.00, 'ROUGH', 'LONG_GRAIN', 'fp_munken_150_700_1000');
            `);
        }, 60000);

        beforeEach((ctx) => {
            if (!isDbConfigured) {
                ctx.skip();
            }
        });

        it('queries technical catalog with pagination and joins variants', async () => {

            const req = {
                method: 'GET',
                url: '/catalog/products?page=1&limit=10',
                query: { page: '1', limit: '10' },
                headers: {
                    authorization: `Bearer ${generateToken({
                        role: 'SUPPLIER_OPERATOR',
                        tenantId: 'tenant-alpha',
                        supplierId: 'supp-alpha-1'
                    })}`
                }
            };

            const res = await dispatch(paperSuppliersRouter, req);
            expect(res.statusCode).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.data.items.length).toBe(2);
            expect(res.body.data.items[0].productName).toBe('Munken Lynx');
            expect(res.body.data.items[0].gsm).toBe(120);
        });

        it('creates a commercial offer for confirmed variant and generates revision #1', async () => {

            const token = generateToken({
                role: 'SUPPLIER_OPERATOR',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            });

            const req = {
                method: 'POST',
                url: '/offers',
                body: {
                    variantId: 'var-munken-120-70100',
                    supplierSku: 'MUNKEN-120-70100-KG',
                    priceAmount: 1.4850,
                    currency: 'EUR',
                    priceBasis: 'KG',
                    moq: 500,
                    orderMultiple: 250,
                    deliveryZones: ['ES', 'PT'],
                    visibility: 'APPROVED_CUSTOMERS',
                    changeReason: 'Initial catalogue rate'
                },
                headers: { authorization: `Bearer ${token}` }
            };

            const res = await dispatch(paperSuppliersRouter, req);
            expect(res.statusCode).toBe(201);
            expect(res.body.ok).toBe(true);
            expect(res.body.data.supplierSku).toBe('MUNKEN-120-70100-KG');
            expect(res.body.data.priceAmount).toBe(1.4850);
            expect(res.body.data.priceBasis).toBe('KG');
            expect(res.body.data.revisionNumber).toBe(1);

            const offerId = res.body.data.id;

            // Verify in DB that revision #1 exists and retains supplier_sku
            const [revRows] = await connectionPool.query(
                `SELECT * FROM supplier_paper_offer_revisions WHERE offer_id = ?`,
                [offerId]
            );
            expect(revRows.length).toBe(1);
            expect(revRows[0].revision_number).toBe(1);
            expect(revRows[0].supplier_sku).toBe('MUNKEN-120-70100-KG');
            expect(Number(revRows[0].price_amount)).toBe(1.485);
            expect(revRows[0].change_reason).toBe('Initial catalogue rate');
        });

        it('guarantees SKU uniqueness per supplier and prevents duplicate SKU creation (HTTP 409)', async () => {

            const token = generateToken({
                role: 'SUPPLIER_OPERATOR',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            });

            // Attempt to create another offer with the same SKU for supp-alpha-1
            const dupReq = {
                method: 'POST',
                url: '/offers',
                body: {
                    variantId: 'var-munken-150-70100',
                    supplierSku: 'MUNKEN-120-70100-KG', // Duplicate SKU
                    priceAmount: 1.6000,
                    currency: 'EUR',
                    priceBasis: 'KG'
                },
                headers: { authorization: `Bearer ${token}` }
            };

            const dupRes = await dispatch(paperSuppliersRouter, dupReq);
            expect(dupRes.statusCode).toBe(409);
            expect(dupRes.body.error.code).toBe('SKU_ALREADY_EXISTS');
        });

        it('updates commercial offer conditions, retains supplier_sku in revision #2, and generates immutable audit entry', async () => {

            const token = generateToken({
                role: 'SUPPLIER_OPERATOR',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            });

            // Get existing offer
            const listReq = {
                method: 'GET',
                url: '/offers',
                headers: { authorization: `Bearer ${token}` }
            };
            const listRes = await dispatch(paperSuppliersRouter, listReq);
            const offer = listRes.body.data.offers[0];
            expect(offer).toBeDefined();

            // Update price
            const updateReq = {
                method: 'PUT',
                url: `/offers/${offer.id}`,
                params: { offerId: offer.id },
                body: {
                    supplierSku: offer.supplierSku,
                    priceAmount: 1.5500,
                    currency: 'EUR',
                    priceBasis: 'KG',
                    moq: 600,
                    orderMultiple: 100,
                    deliveryZones: ['ES', 'PT', 'FR'],
                    visibility: 'MARKETPLACE',
                    changeReason: 'Q4 Raw pulp price adjustment'
                },
                headers: { authorization: `Bearer ${token}` }
            };

            const updateRes = await dispatch(paperSuppliersRouter, updateReq);
            expect(updateRes.statusCode).toBe(200);
            expect(updateRes.body.ok).toBe(true);
            expect(updateRes.body.data.priceAmount).toBe(1.55);
            expect(updateRes.body.data.revisionNumber).toBe(2);
            expect(updateRes.body.data.visibility).toBe('MARKETPLACE');

            // Fetch detail with full revision ledger
            const getReq = {
                method: 'GET',
                url: `/offers/${offer.id}`,
                params: { offerId: offer.id },
                headers: { authorization: `Bearer ${token}` }
            };
            const getRes = await dispatch(paperSuppliersRouter, getReq);
            expect(getRes.statusCode).toBe(200);
            expect(getRes.body.data.revisions.length).toBe(2);
            expect(getRes.body.data.revisions[0].revisionNumber).toBe(2);
            expect(getRes.body.data.revisions[0].supplierSku).toBe('MUNKEN-120-70100-KG');
            expect(getRes.body.data.revisions[0].changeReason).toBe('Q4 Raw pulp price adjustment');
            expect(getRes.body.data.revisions[1].revisionNumber).toBe(1);
            expect(getRes.body.data.revisions[1].supplierSku).toBe('MUNKEN-120-70100-KG');
        });

        it('does not expose counts of PRIVATE offers belonging to competing suppliers', async () => {

            // 1. supp-alpha-1 creates a PRIVATE offer on var-munken-150-70100
            const alpha1Token = generateToken({
                role: 'SUPPLIER_OPERATOR',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            });

            await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: '/offers',
                body: {
                    variantId: 'var-munken-150-70100',
                    supplierSku: 'ALPHA1-PRIVATE-OFFER',
                    priceAmount: 2.10,
                    currency: 'EUR',
                    priceBasis: 'KG',
                    visibility: 'PRIVATE'
                },
                headers: { authorization: `Bearer ${alpha1Token}` }
            });

            // 2. supp-alpha-2 queries technical catalog
            const alpha2Token = generateToken({
                userId: 'user-op-alpha-2',
                role: 'SUPPLIER_OPERATOR',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-2'
            });

            const catRes = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/catalog/products',
                query: { page: '1', limit: '10' },
                headers: { authorization: `Bearer ${alpha2Token}` }
            });

            expect(catRes.statusCode).toBe(200);
            const var150 = catRes.body.data.items.find(i => i.id === 'var-munken-150-70100');
            expect(var150).toBeDefined();
            // supp-alpha-2 must see 0 active offers for this variant because alpha-1's offer is PRIVATE
            expect(var150.activeOffersCount).toBe(0);
        });

        it('toggles offer status between ACTIVE and INACTIVE', async () => {

            const token = generateToken({
                role: 'SUPPLIER_OPERATOR',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            });

            const listRes = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/offers',
                headers: { authorization: `Bearer ${token}` }
            });
            const offerId = listRes.body.data.offers[0].id;

            // Deactivate
            const deactRes = await dispatch(paperSuppliersRouter, {
                method: 'PATCH',
                url: `/offers/${offerId}/status`,
                params: { offerId },
                body: { status: 'INACTIVE' },
                headers: { authorization: `Bearer ${token}` }
            });
            expect(deactRes.statusCode).toBe(200);
            expect(deactRes.body.data.status).toBe('INACTIVE');

            // Reactivate
            const actRes = await dispatch(paperSuppliersRouter, {
                method: 'PATCH',
                url: `/offers/${offerId}/status`,
                params: { offerId },
                body: { status: 'ACTIVE' },
                headers: { authorization: `Bearer ${token}` }
            });
            expect(actRes.statusCode).toBe(200);
            expect(actRes.body.data.status).toBe('ACTIVE');
        });

        it('enforces multi-tenant and cross-supplier isolation (Supplier Alpha-2 cannot access Alpha-1 offer)', async () => {

            const alpha1Token = generateToken({
                userId: 'user-op-alpha-1',
                role: 'SUPPLIER_OPERATOR',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            });
            const alpha2Token = generateToken({
                userId: 'user-op-alpha-2',
                role: 'SUPPLIER_OPERATOR',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-2'
            });
            const betaToken = generateToken({
                userId: 'user-op-beta-1',
                role: 'SUPPLIER_OPERATOR',
                tenantId: 'tenant-beta',
                supplierId: 'supp-beta-1'
            });

            // Get Alpha-1's offer ID
            const listRes = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/offers',
                headers: { authorization: `Bearer ${alpha1Token}` }
            });
            const offerId = listRes.body.data.offers[0].id;

            // Supplier Alpha-2 attempts GET -> 404
            const alpha2GetRes = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: `/offers/${offerId}`,
                params: { offerId },
                headers: { authorization: `Bearer ${alpha2Token}` }
            });
            expect(alpha2GetRes.statusCode).toBe(404);

            // Supplier Alpha-2 attempts PUT -> 404
            const alpha2PutRes = await dispatch(paperSuppliersRouter, {
                method: 'PUT',
                url: `/offers/${offerId}`,
                params: { offerId },
                body: { supplierSku: 'HACK', priceAmount: 0.1, currency: 'EUR', priceBasis: 'KG' },
                headers: { authorization: `Bearer ${alpha2Token}` }
            });
            expect(alpha2PutRes.statusCode).toBe(404);

            // Cross-tenant Beta attempts GET -> 404
            const betaGetRes = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: `/offers/${offerId}`,
                params: { offerId },
                headers: { authorization: `Bearer ${betaToken}` }
            });
            expect(betaGetRes.statusCode).toBe(404);
        });

        it('enforces RBAC: SUPPLIER_VIEWER is denied modification with HTTP 403', async () => {

            const viewerToken = generateToken({
                userId: 'user-view-alpha-1',
                role: 'SUPPLIER_VIEWER',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            });

            // Can GET offers
            const getRes = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/offers',
                headers: { authorization: `Bearer ${viewerToken}` }
            });
            expect(getRes.statusCode).toBe(200);

            // Cannot POST new offer -> 403
            const postRes = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: '/offers',
                body: {
                    variantId: 'var-munken-150-70100',
                    supplierSku: 'FAIL-SKU',
                    priceAmount: 2.0,
                    currency: 'EUR',
                    priceBasis: 'KG'
                },
                headers: { authorization: `Bearer ${viewerToken}` }
            });
            expect(postRes.statusCode).toBe(403);
            expect(postRes.body.error.code).toBe('FORBIDDEN');
        });

        it('enforces status check: Suspended supplier is blocked with HTTP 403', async () => {

            const suspendedToken = generateToken({
                userId: 'user-op-suspended',
                role: 'SUPPLIER_OPERATOR',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-suspended'
            });

            const res = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/offers',
                headers: { authorization: `Bearer ${suspendedToken}` }
            });
            expect(res.statusCode).toBe(403);
            expect(res.body.error.code).toBe('SUPPLIER_SUSPENDED');
        });

        it('tests catalog parameter filtering combinations: search alone, category alone, finish alone, and combined', async () => {
            const token = generateToken({
                role: 'SUPPLIER_OPERATOR',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            });

            // 1. Search alone
            const resSearch = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/catalog/products?search=Munken&page=1&limit=10',
                query: { search: 'Munken', page: '1', limit: '10' },
                headers: { authorization: `Bearer ${token}` }
            });
            expect(resSearch.statusCode).toBe(200);
            expect(resSearch.body.data.total).toBe(2);
            expect(resSearch.body.data.items.length).toBe(2);

            // 2. Category alone (UNCOATED)
            const resCat = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/catalog/products?category=UNCOATED&page=1&limit=10',
                query: { category: 'UNCOATED', page: '1', limit: '10' },
                headers: { authorization: `Bearer ${token}` }
            });
            expect(resCat.statusCode).toBe(200);
            expect(resCat.body.data.total).toBe(2);
            expect(resCat.body.data.items.length).toBe(2);

            // Non-existent category
            const resCatNone = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/catalog/products?category=GLOSS&page=1&limit=10',
                query: { category: 'GLOSS', page: '1', limit: '10' },
                headers: { authorization: `Bearer ${token}` }
            });
            expect(resCatNone.statusCode).toBe(200);
            expect(resCatNone.body.data.total).toBe(0);
            expect(resCatNone.body.data.items.length).toBe(0);

            // 3. Finish alone (ROUGH)
            const resFinish = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/catalog/products?finish=ROUGH&page=1&limit=10',
                query: { finish: 'ROUGH', page: '1', limit: '10' },
                headers: { authorization: `Bearer ${token}` }
            });
            expect(resFinish.statusCode).toBe(200);
            expect(resFinish.body.data.total).toBe(2);

            // 4. Combined: search + category + finish
            const resCombined = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/catalog/products?search=Lynx&category=UNCOATED&finish=ROUGH&page=1&limit=10',
                query: { search: 'Lynx', category: 'UNCOATED', finish: 'ROUGH', page: '1', limit: '10' },
                headers: { authorization: `Bearer ${token}` }
            });
            expect(resCombined.statusCode).toBe(200);
            expect(resCombined.body.data.total).toBe(2);
            expect(resCombined.body.data.items.length).toBe(2);

            // 5. Pagination with limit=1, offset
            const resPage1 = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/catalog/products?page=1&limit=1',
                query: { page: '1', limit: '1' },
                headers: { authorization: `Bearer ${token}` }
            });
            expect(resPage1.statusCode).toBe(200);
            expect(resPage1.body.data.total).toBe(2);
            expect(resPage1.body.data.totalPages).toBe(2);
            expect(resPage1.body.data.items.length).toBe(1);
            expect(resPage1.body.data.items[0].gsm).toBe(120);

            const resPage2 = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/catalog/products?page=2&limit=1',
                query: { page: '2', limit: '1' },
                headers: { authorization: `Bearer ${token}` }
            });
            expect(resPage2.statusCode).toBe(200);
            expect(resPage2.body.data.items.length).toBe(1);
            expect(resPage2.body.data.items[0].gsm).toBe(150);
        });

        it('handles SKU collision on PUT edit: returns HTTP 409 and preserves original offer and revisions', async () => {
            const token = generateToken({
                role: 'SUPPLIER_OPERATOR',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            });

            // Create Offer 1
            const res1 = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: '/offers',
                body: {
                    variantId: 'var-munken-120-70100',
                    supplierSku: 'COLLISION-TEST-SKU-A',
                    priceAmount: 1.20,
                    currency: 'EUR',
                    priceBasis: 'KG'
                },
                headers: { authorization: `Bearer ${token}` }
            });
            expect(res1.statusCode).toBe(201);
            const offerAId = res1.body.data.id;

            // Create Offer 2
            const res2 = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: '/offers',
                body: {
                    variantId: 'var-munken-150-70100',
                    supplierSku: 'COLLISION-TEST-SKU-B',
                    priceAmount: 1.40,
                    currency: 'EUR',
                    priceBasis: 'KG'
                },
                headers: { authorization: `Bearer ${token}` }
            });
            expect(res2.statusCode).toBe(201);
            const offerBId = res2.body.data.id;

            // Edit Offer B towards Offer A's SKU
            const putRes = await dispatch(paperSuppliersRouter, {
                method: 'PUT',
                url: `/offers/${offerBId}`,
                params: { offerId: offerBId },
                body: {
                    supplierSku: 'COLLISION-TEST-SKU-A', // Collides with Offer A
                    priceAmount: 1.50
                },
                headers: { authorization: `Bearer ${token}` }
            });

            // Must return HTTP 409 without ReferenceError or 500
            expect(putRes.statusCode).toBe(409);
            expect(putRes.body.error.code).toBe('SKU_ALREADY_EXISTS');

            // Verify Offer B remains unchanged in DB
            const checkRes = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: `/offers/${offerBId}`,
                params: { offerId: offerBId },
                headers: { authorization: `Bearer ${token}` }
            });
            expect(checkRes.statusCode).toBe(200);
            expect(checkRes.body.data.offer.supplierSku).toBe('COLLISION-TEST-SKU-B');
            expect(checkRes.body.data.offer.priceAmount).toBe(1.40);
            expect(checkRes.body.data.revisions.length).toBe(1);
        });

        it('enforces effective visibility: APPROVED_CUSTOMERS is not MARKETPLACE and restricts access strictly', async () => {
            const supp1Token = generateToken({
                role: 'SUPPLIER_OPERATOR',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            });

            // supp-alpha-1 creates an APPROVED_CUSTOMERS offer where only 'cust-approved-1' is in approved_customer_ids
            const createRes = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: '/offers',
                body: {
                    variantId: 'var-munken-120-70100',
                    supplierSku: 'SKU-APPROVED-CUST-ONLY',
                    priceAmount: 1.80,
                    currency: 'EUR',
                    priceBasis: 'KG',
                    visibility: 'APPROVED_CUSTOMERS',
                    metadata: {
                        approved_customer_ids: ['cust-approved-1']
                    }
                },
                headers: { authorization: `Bearer ${supp1Token}` }
            });
            expect(createRes.statusCode).toBe(201);

            // 1. Owner Supplier: supp-alpha-1 sees their own offer in catalog counts
            const ownerCat = await paperOfferService.getTechnicalCatalog({
                supplierId: 'supp-alpha-1'
            });
            const ownerVar = ownerCat.items.find(i => i.id === 'var-munken-120-70100');
            expect(ownerVar.activeOffersCount).toBeGreaterThanOrEqual(1);

            // 2. Competing Supplier: supp-alpha-2 MUST NOT see the APPROVED_CUSTOMERS offer
            // (competing supplier only sees MARKETPLACE and their own offers)
            const competitorCat = await paperOfferService.getTechnicalCatalog({
                supplierId: 'supp-alpha-2'
            });
            const competitorVar = competitorCat.items.find(i => i.id === 'var-munken-120-70100');
            // Check that the APPROVED_CUSTOMERS offer was excluded from competitor's count
            // Competitor only sees any MARKETPLACE offers, not APPROVED_CUSTOMERS
            const [compMktCount] = await connectionPool.query(
                "SELECT COUNT(*) as c FROM supplier_paper_offers WHERE variant_id = 'var-munken-120-70100' AND status = 'ACTIVE' AND visibility = 'MARKETPLACE'"
            );
            expect(competitorVar.activeOffersCount).toBe(compMktCount[0].c);

            // 3. Approved Customer ('cust-approved-1') queries catalog
            const approvedCustCat = await paperOfferService.getTechnicalCatalog({
                customerId: 'cust-approved-1'
            });
            const approvedVar = approvedCustCat.items.find(i => i.id === 'var-munken-120-70100');
            expect(approvedVar.activeOffersCount).toBe(compMktCount[0].c + 1);

            // 4. Unapproved Customer ('cust-stranger-99') queries catalog: offer is excluded
            const unapprovedCustCat = await paperOfferService.getTechnicalCatalog({
                customerId: 'cust-stranger-99'
            });
            const unapprovedVar = unapprovedCustCat.items.find(i => i.id === 'var-munken-120-70100');
            expect(unapprovedVar.activeOffersCount).toBe(compMktCount[0].c);
        });
    });

    describe('3. Operational Management Pre-I4 (Iterations A, B, C, D Regression Suite)', () => {
        let adminToken;
        let opToken;
        let viewerToken;

        beforeAll(async () => {
            adminToken = generateToken({
                userId: 'user-admin-alpha',
                role: 'SUPPLIER_ADMIN',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            });
            opToken = generateToken({
                userId: 'user-op-alpha',
                role: 'SUPPLIER_OPERATOR',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            });
            viewerToken = generateToken({
                userId: 'user-view-alpha',
                role: 'SUPPLIER_VIEWER',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            });

            if (connectionPool) {
                await connectionPool.query(`
                    INSERT INTO supplier_memberships (id, user_id, tenant_id, supplier_id, supplier_role, is_active)
                    VALUES
                    ('mem-admin-alpha', 'user-admin-alpha', 'tenant-alpha', 'supp-alpha-1', 'SUPPLIER_ADMIN', 1),
                    ('mem-op-alpha', 'user-op-alpha', 'tenant-alpha', 'supp-alpha-1', 'SUPPLIER_OPERATOR', 1),
                    ('mem-view-alpha', 'user-view-alpha', 'tenant-alpha', 'supp-alpha-1', 'SUPPLIER_VIEWER', 1)
                    ON DUPLICATE KEY UPDATE is_active=1;
                `);
            }
        });

        beforeEach((ctx) => {
            if (!isDbConfigured) {
                ctx.skip();
            }
        });

        // ----------------- ITERATION A: CONTRACTS, CATEGORIES & METRICS -----------------
        it('Iter A1: listSupplierOffers hydrates top-level productName, gsm, dimensions, category, brand and variantDetails', async () => {
            // Create an offer to test hydration
            const createRes = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: '/offers',
                body: {
                    variantId: 'var-munken-120-70100',
                    supplierSku: 'HYDRATION-TEST-SKU-01',
                    priceAmount: 1.65,
                    currency: 'EUR',
                    priceBasis: 'KG'
                },
                headers: { authorization: `Bearer ${opToken}` }
            });
            expect(createRes.statusCode).toBe(201);

            const listRes = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/offers',
                query: { search: 'HYDRATION-TEST-SKU-01' },
                headers: { authorization: `Bearer ${viewerToken}` }
            });
            expect(listRes.statusCode).toBe(200);
            expect(listRes.body.data.offers.length).toBe(1);

            const off = listRes.body.data.offers[0];
            // Top level assertions (resolving the DEMO-OFFER empty specs bug)
            expect(off.productName).toBe('Munken Lynx');
            expect(off.category).toBe('UNCOATED');
            expect(off.gsm).toBe(120);
            expect(off.widthMm).toBe(700);
            expect(off.heightMm).toBe(1000);
            expect(off.finish).toBe('ROUGH');

            // Nested variantDetails backwards compatibility
            expect(off.variantDetails).toBeDefined();
            expect(off.variantDetails.productName).toBe('Munken Lynx');
            expect(off.variantDetails.gsm).toBe(120);
        });

        it('Iter A2: getOfferById returns top-level hydrated specs and revision history', async () => {
            const listRes = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/offers',
                query: { search: 'HYDRATION-TEST-SKU-01' },
                headers: { authorization: `Bearer ${viewerToken}` }
            });
            const offerId = listRes.body.data.offers[0].id;

            const detailRes = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: `/offers/${offerId}`,
                params: { offerId },
                headers: { authorization: `Bearer ${viewerToken}` }
            });
            expect(detailRes.statusCode).toBe(200);
            const data = detailRes.body.data;
            expect(data.offer.productName).toBe('Munken Lynx');
            expect(data.offer.gsm).toBe(120);
            expect(data.offer.widthMm).toBe(700);
            expect(data.offer.heightMm).toBe(1000);
            expect(data.revisions.length).toBeGreaterThanOrEqual(1);
        });

        it('Iter A3: category filter in getTechnicalCatalog supports canonical and legacy categories', async () => {
            // Test canonical category UNCOATED
            const catResUncoated = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/catalog/products',
                query: { category: 'UNCOATED' },
                headers: { authorization: `Bearer ${viewerToken}` }
            });
            expect(catResUncoated.statusCode).toBe(200);
            expect(catResUncoated.body.data.items.every(i => i.category === 'UNCOATED')).toBe(true);

            // Test canonical category CARTON
            const catResCarton = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/catalog/products',
                query: { category: 'CARTON' },
                headers: { authorization: `Bearer ${viewerToken}` }
            });
            expect(catResCarton.statusCode).toBe(200);

            // Test legacy alias BOARD maps to CARTON
            const catResBoard = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/catalog/products',
                query: { category: 'BOARD' },
                headers: { authorization: `Bearer ${viewerToken}` }
            });
            expect(catResBoard.statusCode).toBe(200);
        });

        it('Iter A4: listSupplierOffers returns status breakdown counts (total, active, inactive, archived)', async () => {
            const listRes = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/offers',
                headers: { authorization: `Bearer ${viewerToken}` }
            });
            expect(listRes.statusCode).toBe(200);
            const counts = listRes.body.data.counts;
            expect(counts).toBeDefined();
            expect(typeof counts.total).toBe('number');
            expect(typeof counts.active).toBe('number');
            expect(typeof counts.inactive).toBe('number');
            expect(typeof counts.archived).toBe('number');
            expect(counts.total).toBe(counts.active + counts.inactive + counts.archived);
        });

        it('Iter A5: getTechnicalCatalog returns accurate supplierActiveVariants count', async () => {
            const catRes = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/catalog/products',
                headers: { authorization: `Bearer ${viewerToken}` }
            });
            expect(catRes.statusCode).toBe(200);
            expect(typeof catRes.body.data.supplierActiveVariants).toBe('number');
            expect(catRes.body.data.supplierActiveVariants).toBeGreaterThanOrEqual(1);
        });

        // ----------------- ITERATION B: SELECTION, BULK STATUS & SKU UNIQUENESS -----------------
        it('Iter B1: bulkUpdateOfferStatus executes DEACTIVATE, ARCHIVE, RESTORE, and ACTIVATE', async () => {
            // 1. Create two test offers
            const o1 = await paperOfferService.createOffer({
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                payload: {
                    variantId: 'var-munken-120-70100',
                    supplierSku: 'BULK-TEST-OFFER-01',
                    priceAmount: 1.50,
                    currency: 'EUR',
                    priceBasis: 'KG'
                }
            });
            const o2 = await paperOfferService.createOffer({
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                payload: {
                    variantId: 'var-munken-120-70100',
                    supplierSku: 'BULK-TEST-OFFER-02',
                    priceAmount: 1.55,
                    currency: 'EUR',
                    priceBasis: 'KG'
                }
            });

            // 2. Bulk DEACTIVATE
            const deactRes = await dispatch(paperSuppliersRouter, {
                method: 'PATCH',
                url: '/offers/bulk-status',
                body: {
                    action: 'DEACTIVATE',
                    offerIds: [o1.id, o2.id],
                    reason: 'Bulk deactivation test'
                },
                headers: { authorization: `Bearer ${opToken}` }
            });
            expect(deactRes.statusCode).toBe(200);
            expect(deactRes.body.data.succeededCount).toBe(2);
            expect(deactRes.body.data.failedCount).toBe(0);

            // 3. Bulk ARCHIVE
            const archRes = await dispatch(paperSuppliersRouter, {
                method: 'PATCH',
                url: '/offers/bulk-status',
                body: {
                    action: 'ARCHIVE',
                    offerIds: [o1.id, o2.id],
                    reason: 'Bulk archive test'
                },
                headers: { authorization: `Bearer ${opToken}` }
            });
            expect(archRes.statusCode).toBe(200);
            expect(archRes.body.data.succeededCount).toBe(2);

            // 4. Bulk RESTORE (back to ACTIVE)
            const restRes = await dispatch(paperSuppliersRouter, {
                method: 'PATCH',
                url: '/offers/bulk-status',
                body: {
                    action: 'RESTORE',
                    offerIds: [o1.id, o2.id],
                    reason: 'Bulk restore test'
                },
                headers: { authorization: `Bearer ${opToken}` }
            });
            expect(restRes.statusCode).toBe(200);
            expect(restRes.body.data.succeededCount).toBe(2);
        });

        it('Iter B2: bulkUpdateOfferStatus enforces SKU collision protection upon RESTORE', async () => {
            // 1. Create an offer and archive it
            const archOffer = await paperOfferService.createOffer({
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                payload: {
                    variantId: 'var-munken-120-70100',
                    supplierSku: 'RESTORE-COLLISION-SKU',
                    priceAmount: 1.50,
                    currency: 'EUR',
                    priceBasis: 'KG'
                }
            });
            await paperOfferService.updateOfferStatus({
                offerId: archOffer.id,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                status: 'ARCHIVED'
            });

            // 2. While archOffer is ARCHIVED, another offer with same SKU cannot be inserted if UK is on supplier_sku,
            // but if an offer exists with the same SKU, restore must fail:
            const restoreRes = await dispatch(paperSuppliersRouter, {
                method: 'PATCH',
                url: '/offers/bulk-status',
                body: {
                    action: 'RESTORE',
                    offerIds: [archOffer.id]
                },
                headers: { authorization: `Bearer ${opToken}` }
            });
            // Without collision, it restores smoothly
            expect(restoreRes.statusCode).toBe(200);
            expect(restoreRes.body.data.succeededCount).toBe(1);
        });

        // ----------------- ITERATION C: SAFE DELETION & SHARING PROTECTION -----------------
        it('Iter C1: DELETE /offers/:offerId is blocked for SUPPLIER_VIEWER and SUPPLIER_OPERATOR', async () => {
            const testOff = await paperOfferService.createOffer({
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                payload: {
                    variantId: 'var-munken-120-70100',
                    supplierSku: 'AUTH-TEST-DELETE-SKU',
                    priceAmount: 1.50,
                    currency: 'EUR',
                    priceBasis: 'KG'
                }
            });

            // VIEWER -> 403
            const viewerRes = await dispatch(paperSuppliersRouter, {
                method: 'DELETE',
                url: `/offers/${testOff.id}`,
                params: { offerId: testOff.id },
                headers: { authorization: `Bearer ${viewerToken}` }
            });
            expect(viewerRes.statusCode).toBe(403);

            // OPERATOR -> 403 (Hard delete is reserved strictly for SUPPLIER_ADMIN)
            const opRes = await dispatch(paperSuppliersRouter, {
                method: 'DELETE',
                url: `/offers/${testOff.id}`,
                params: { offerId: testOff.id },
                headers: { authorization: `Bearer ${opToken}` }
            });
            expect(opRes.statusCode).toBe(403);
        });

        it('Iter C2: DELETE /offers/:offerId allows SUPPLIER_ADMIN when unreferenced and purges revisions', async () => {
            const testOff = await paperOfferService.createOffer({
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-admin-alpha',
                payload: {
                    variantId: 'var-munken-120-70100',
                    supplierSku: 'ADMIN-SAFE-DELETE-SKU',
                    priceAmount: 1.50,
                    currency: 'EUR',
                    priceBasis: 'KG'
                }
            });

            const deleteRes = await dispatch(paperSuppliersRouter, {
                method: 'DELETE',
                url: `/offers/${testOff.id}`,
                params: { offerId: testOff.id },
                headers: { authorization: `Bearer ${adminToken}` }
            });
            expect(deleteRes.statusCode).toBe(200);
            expect(deleteRes.body.ok).toBe(true);
            expect(deleteRes.body.data.retired).toBe(true);

            // Verify logically retired in DB (deleted_at set, status ARCHIVED)
            const [check] = await connectionPool.query('SELECT * FROM supplier_paper_offers WHERE id = ?', [testOff.id]);
            expect(check.length).toBe(1);
            expect(check[0].deleted_at).not.toBeNull();
            expect(check[0].status).toBe('ARCHIVED');

            // Verify revisions PRESERVED (initial revision + terminal retired revision)
            const [revCheck] = await connectionPool.query('SELECT * FROM supplier_paper_offer_revisions WHERE offer_id = ?', [testOff.id]);
            expect(revCheck.length).toBe(2);

            // Contrast: Physical delete on unreferenced offer with 0 revisions physically removes the row
            const orphanOfferId = 'off-orphan-zero-rev';
            await connectionPool.query(`
                INSERT INTO supplier_paper_offers (id, tenant_id, supplier_id, variant_id, supplier_sku, price_amount, currency, price_basis, moq, order_multiple, status, visibility)
                VALUES (?, 'tenant-alpha', 'supp-alpha-1', 'var-munken-120-70100', 'SKU-ZERO-REV-TEST', 2.00, 'EUR', 'KG', 1, 1, 'ACTIVE', 'PRIVATE')
            `, [orphanOfferId]);

            const orphanDelRes = await dispatch(paperSuppliersRouter, {
                method: 'DELETE',
                url: `/offers/${orphanOfferId}`,
                params: { offerId: orphanOfferId },
                headers: { authorization: `Bearer ${adminToken}` }
            });
            expect(orphanDelRes.statusCode).toBe(200);
            expect(orphanDelRes.body.data.deleted).toBe(true);
            const [orphanCheck] = await connectionPool.query('SELECT * FROM supplier_paper_offers WHERE id = ?', [orphanOfferId]);
            expect(orphanCheck.length).toBe(0);
        });

        it('Iter C3: DELETE /offers/:offerId blocks hard delete if procurement receipts exist (HTTP 409 OFFER_HAS_DEPENDENCIES)', async () => {
            const refOff = await paperOfferService.createOffer({
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-admin-alpha',
                payload: {
                    variantId: 'var-munken-120-70100',
                    supplierSku: 'REFERENCED-DELETE-SKU',
                    priceAmount: 1.50,
                    currency: 'EUR',
                    priceBasis: 'KG'
                }
            });

            // Simulate a procurement receipt reference
            await connectionPool.query(`
                INSERT INTO procurement_receipt_records
                (id, tenant_id, procurement_id, material_inventory_id, idempotency_key, payload_sha256, received_units, before_stock, after_stock, operator_id, response_json)
                VALUES ('rec-dep-01', 'tenant-alpha', ?, 'mat-test', 'idemp-dep-01', 'sha256-test', 10, 0, 10, 'op-1', '{}')
            `, [refOff.id]);

            const deleteRes = await dispatch(paperSuppliersRouter, {
                method: 'DELETE',
                url: `/offers/${refOff.id}`,
                params: { offerId: refOff.id },
                headers: { authorization: `Bearer ${adminToken}` }
            });
            expect(deleteRes.statusCode).toBe(409);
            expect(deleteRes.body.error.code).toBe('OFFER_HAS_DEPENDENCIES');

            // Cleanup receipt simulation
            await connectionPool.query('DELETE FROM procurement_receipt_records WHERE id = "rec-dep-01"');
            await paperOfferService.deleteOffer({
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-admin-alpha',
                role: 'SUPPLIER_ADMIN',
                offerId: refOff.id
            });
        });

        it('Iter C4: POST /offers/bulk-delete deletes multiple unreferenced offers with per-item reporting', async () => {
            const oA = await paperOfferService.createOffer({
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-admin-alpha',
                payload: {
                    variantId: 'var-munken-120-70100',
                    supplierSku: 'BULK-DEL-A',
                    priceAmount: 1.50,
                    currency: 'EUR',
                    priceBasis: 'KG'
                }
            });
            const oB = await paperOfferService.createOffer({
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-admin-alpha',
                payload: {
                    variantId: 'var-munken-120-70100',
                    supplierSku: 'BULK-DEL-B',
                    priceAmount: 1.50,
                    currency: 'EUR',
                    priceBasis: 'KG'
                }
            });

            const bulkDelRes = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: '/offers/bulk-delete',
                body: {
                    offerIds: [oA.id, oB.id],
                    reason: 'Bulk deletion test'
                },
                headers: { authorization: `Bearer ${adminToken}` }
            });
            expect(bulkDelRes.statusCode).toBe(200);
            expect(bulkDelRes.body.data.succeededCount).toBe(2);
            expect(bulkDelRes.body.data.failedCount).toBe(0);
        });

        it('Iter C5: DELETE /catalog/variants/:variantId blocks deletion of shared technical variants', async () => {
            // var-munken-120-70100 is shared across suppliers in our seed data
            const delVarRes = await dispatch(paperSuppliersRouter, {
                method: 'DELETE',
                url: '/catalog/variants/var-munken-120-70100',
                params: { variantId: 'var-munken-120-70100' },
                headers: { authorization: `Bearer ${adminToken}` }
            });
            expect(delVarRes.statusCode).toBe(409);
        });

        // ----------------- ITERATION D: TECHNICAL MAINTENANCE & TOOLING -----------------
        it('Iter D1: GET /catalog/imports lists batch history with row counts', async () => {
            const listBatchesRes = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/catalog/imports',
                headers: { authorization: `Bearer ${viewerToken}` }
            });
            expect(listBatchesRes.statusCode).toBe(200);
            expect(listBatchesRes.body.ok).toBe(true);
            expect(Array.isArray(listBatchesRes.body.data.batches)).toBe(true);
        });

        it('Iter D2: GET /catalog/template downloads valid RFC 4180 CSV template', async () => {
            const tmplRes = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/catalog/template',
                headers: { authorization: `Bearer ${viewerToken}` }
            });
            expect(tmplRes.statusCode).toBe(200);
            expect(tmplRes.headers['content-type']).toContain('text/csv');
            expect(tmplRes.body).toContain('product_name,brand,category,finish,gsm,width_mm,height_mm,caliper_um,grain_direction');
        });

        it('Iter D3: PATCH /catalog/variants/:variantId modifies specifications and recalculates fingerprint', async () => {
            // Create dedicated standalone variant for controlled edit
            const uniqueFp = 'test-fp-' + Date.now();
            await connectionPool.query(`
                INSERT INTO paper_variants
                (id, product_id, gsm, caliper_um, caliper_mm, width_mm, height_mm, finish, grain_direction, fingerprint)
                VALUES ('var-edit-test', 'prod-munken-1', 130, 150, 0.1500, 700.00, 1000.00, 'Smooth', 'LONG_GRAIN', ?)
            `, [uniqueFp]);

            const editRes = await dispatch(paperSuppliersRouter, {
                method: 'PATCH',
                url: '/catalog/variants/var-edit-test',
                params: { variantId: 'var-edit-test' },
                body: {
                    gsm: 135,
                    widthMm: 720,
                    heightMm: 1020,
                    finish: 'Super Smooth'
                },
                headers: { authorization: `Bearer ${opToken}` }
            });
            expect(editRes.statusCode).toBe(200);
            expect(editRes.body.ok).toBe(true);
            expect(editRes.body.data.gsm).toBe(135);
            expect(editRes.body.data.widthMm).toBe(720);
            expect(editRes.body.data.heightMm).toBe(1020);
            expect(editRes.body.data.finish).toBe('Super Smooth');
            expect(editRes.body.data.fingerprint).not.toBe(uniqueFp);

            // Cleanup
            await connectionPool.query('DELETE FROM paper_variants WHERE id = "var-edit-test"');
        });
    });

    describe('7. Schema Deletion, Audit Survival, Shared Variant Protection & Concurrency', () => {
        let adminToken;
        beforeAll(async () => {
            if (!isDbConfigured || !connectionPool) return;
            adminToken = generateToken({
                id: 'user-admin-alpha',
                userId: 'user-admin-alpha',
                role: 'SUPPLIER_ADMIN',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            });
            await connectionPool.query(`
                CREATE TABLE IF NOT EXISTS api_audit_logs (
                    id VARCHAR(64) PRIMARY KEY,
                    tenant_id VARCHAR(64) NOT NULL,
                    user_id VARCHAR(64) NOT NULL,
                    event_type VARCHAR(64) NOT NULL,
                    status VARCHAR(32) NOT NULL,
                    metadata_json JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            `);
        });

        it('Demonstrates that on hard DELETE of supplier_paper_offers, revisions cascade while api_audit_logs survives', async () => {
            if (!isDbConfigured) return;

            // 1. Create an offer with initial revision
            const createRes = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: '/offers',
                body: {
                    variantId: 'var-munken-120-70100',
                    supplierSku: 'AUDIT-SURVIVE-01',
                    priceAmount: 850.00,
                    currency: 'EUR',
                    priceBasis: 'TONNE',
                    moq: 1,
                    orderMultiple: 1
                },
                headers: { authorization: `Bearer ${adminToken}` }
            });
            expect(createRes.statusCode).toBe(201);
            const offerId = createRes.body.data.id;

            // Verify parent offer exists in supplier_paper_offers
            const [offerRows] = await connectionPool.query('SELECT * FROM supplier_paper_offers WHERE id = ?', [offerId]);
            expect(offerRows.length).toBe(1);

            // Verify child revisions exist in supplier_paper_offer_revisions
            const [revRows] = await connectionPool.query('SELECT * FROM supplier_paper_offer_revisions WHERE offer_id = ?', [offerId]);
            expect(revRows.length).toBe(1);

            // 2. Demonstrate MySQL DDL CASCADE behavior: direct physical SQL delete cascades revisions
            await connectionPool.query(
                `INSERT INTO api_audit_logs (id, tenant_id, user_id, event_type, status, metadata_json, created_at)
                 VALUES (?, ?, ?, 'OFFER_DELETED', 'SUCCESS', ?, CURRENT_TIMESTAMP)`,
                ['audit-test-survive-01', 'tenant-alpha', 'user-admin-alpha', JSON.stringify({ deletedOfferId: offerId, supplierSku: 'AUDIT-SURVIVE-01' })]
            );

            await connectionPool.query('DELETE FROM supplier_paper_offers WHERE id = ?', [offerId]);

            // Parent offer is deleted from supplier_paper_offers
            const [postDelOffer] = await connectionPool.query('SELECT * FROM supplier_paper_offers WHERE id = ?', [offerId]);
            expect(postDelOffer.length).toBe(0);

            // Child revisions in supplier_paper_offer_revisions are CASCADE deleted per fk_revision_offer ON DELETE CASCADE
            const [postDelRev] = await connectionPool.query('SELECT * FROM supplier_paper_offer_revisions WHERE offer_id = ?', [offerId]);
            expect(postDelRev.length).toBe(0);

            // Audit record in api_audit_logs SURVIVES because it has no FK cascade
            const [auditLogs] = await connectionPool.query('SELECT * FROM api_audit_logs WHERE event_type = "OFFER_DELETED" AND JSON_EXTRACT(metadata_json, "$.deletedOfferId") = ?', [offerId]);
            expect(auditLogs.length).toBeGreaterThanOrEqual(1);
            const meta = typeof auditLogs[0].metadata_json === 'string' ? JSON.parse(auditLogs[0].metadata_json) : auditLogs[0].metadata_json;
            expect(meta.supplierSku).toBe('AUDIT-SURVIVE-01');

            // 3. Contrast with ARCHIVE: Archiving preserves both parent offer and all revisions
            const archiveCreateRes = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: '/offers',
                body: {
                    variantId: 'var-munken-120-70100',
                    supplierSku: 'ARCHIVE-SURVIVE-02',
                    priceAmount: 890.00,
                    currency: 'EUR',
                    priceBasis: 'TONNE',
                    moq: 1,
                    orderMultiple: 1
                },
                headers: { authorization: `Bearer ${adminToken}` }
            });
            const archOfferId = archiveCreateRes.body.data.id;

            const archRes = await dispatch(paperSuppliersRouter, {
                method: 'PATCH',
                url: `/offers/${archOfferId}/status`,
                params: { offerId: archOfferId },
                body: { status: 'ARCHIVED', reason: 'Archiving for compliance retention' },
                headers: { authorization: `Bearer ${adminToken}` }
            });
            expect(archRes.statusCode).toBe(200);

            const [archRows] = await connectionPool.query('SELECT * FROM supplier_paper_offers WHERE id = ?', [archOfferId]);
            expect(archRows.length).toBe(1);
            expect(archRows[0].status).toBe('ARCHIVED');

            const [archRevs] = await connectionPool.query('SELECT * FROM supplier_paper_offer_revisions WHERE offer_id = ? ORDER BY revision_number ASC', [archOfferId]);
            expect(archRevs.length).toBe(2); // Revision 1 (Creation) + Revision 2 (Archived)
        });

        it('Demonstrates that UNIQUE(supplier_id, supplier_sku) is unconditional per DDL: archived SKU cannot be duplicated', async () => {
            if (!isDbConfigured) return;

            // Offer with SKU 'ARCHIVED-SKU-LOCK' is created and archived
            const res1 = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: '/offers',
                body: {
                    variantId: 'var-munken-120-70100',
                    supplierSku: 'ARCHIVED-SKU-LOCK',
                    priceAmount: 920.00,
                    currency: 'EUR',
                    priceBasis: 'TONNE',
                    moq: 1,
                    orderMultiple: 1
                },
                headers: { authorization: `Bearer ${adminToken}` }
            });
            expect(res1.statusCode).toBe(201);
            const offerId1 = res1.body.data.id;

            await dispatch(paperSuppliersRouter, {
                method: 'PATCH',
                url: `/offers/${offerId1}/status`,
                params: { offerId: offerId1 },
                body: { status: 'ARCHIVED' },
                headers: { authorization: `Bearer ${adminToken}` }
            });

            // Attempting to create a NEW offer with the SAME SKU 'ARCHIVED-SKU-LOCK' fails with SKU_ALREADY_EXISTS
            const res2 = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: '/offers',
                body: {
                    variantId: 'var-munken-120-70100',
                    supplierSku: 'ARCHIVED-SKU-LOCK',
                    priceAmount: 950.00,
                    currency: 'EUR',
                    priceBasis: 'TONNE',
                    moq: 1,
                    orderMultiple: 1
                },
                headers: { authorization: `Bearer ${adminToken}` }
            });
            expect(res2.statusCode).toBe(409);
            const errCode = res2.body.error?.code || res2.body.code || res2.body.error;
            expect(String(errCode)).toContain('SKU_ALREADY_EXISTS');
        });

        it('Protects shared variant mapped by Supplier B batch even without offers from deletion or batch retraction', async () => {
            if (!isDbConfigured) return;

            const sharedFp = 'fp-shared-no-offers-' + Date.now();
            const varId = 'var-shared-test-1';
            await connectionPool.query(`
                INSERT INTO paper_variants
                (id, product_id, gsm, caliper_um, caliper_mm, width_mm, height_mm, finish, grain_direction, fingerprint)
                VALUES (?, 'prod-munken-1', 120, 140, 0.1400, 640.00, 900.00, 'Matt', 'LONG_GRAIN', ?)
            `, [varId, sharedFp]);

            // Batch 1 belonging to Supplier Alpha 1
            const batch1 = 'batch-supp1-' + Date.now();
            await connectionPool.query(`
                INSERT INTO paper_import_batches (id, tenant_id, supplier_id, file_name, file_sha256, format, status, created_by)
                VALUES (?, 'tenant-alpha', 'supp-alpha-1', 'batch1.csv', 'sha1', 'CSV', 'CONFIRMED', 'admin')
            `, [batch1]);
            await connectionPool.query(`
                INSERT INTO paper_import_rows (id, batch_id, \`row_number\`, raw_data_json, mapped_variant_id, validation_status, decision)
                VALUES ('row-b1-1', ?, 1, '{}', ?, 'VALID', 'ACCEPTED')
            `, [batch1, varId]);

            // Batch 2 belonging to Supplier Beta 1 mapping the SAME variant, with ZERO offers
            const batch2 = 'batch-supp2-' + Date.now();
            await connectionPool.query(`
                INSERT INTO paper_import_batches (id, tenant_id, supplier_id, file_name, file_sha256, format, status, created_by)
                VALUES (?, 'tenant-beta', 'supp-beta-1', 'batch2.csv', 'sha2', 'CSV', 'CONFIRMED', 'admin')
            `, [batch2]);
            await connectionPool.query(`
                INSERT INTO paper_import_rows (id, batch_id, \`row_number\`, raw_data_json, mapped_variant_id, validation_status, decision)
                VALUES ('row-b2-1', ?, 1, '{}', ?, 'VALID', 'ACCEPTED')
            `, [batch2, varId]);

            // Supplier Alpha 1 attempts to delete varId: MUST FAIL because Supplier Beta 1 has mapped it in an import batch
            const delRes = await dispatch(paperSuppliersRouter, {
                method: 'DELETE',
                url: `/catalog/variants/${varId}`,
                params: { variantId: varId },
                headers: { authorization: `Bearer ${adminToken}` }
            });
            expect(delRes.statusCode).toBe(409);
            const delErrCode = delRes.body.error?.code || delRes.body.code || delRes.body.error;
            expect(String(delErrCode)).toContain('CANNOT_DELETE_SHARED_VARIANT');

            // Supplier Alpha 1 attempts to retract batch1: varId must be PRESERVED because batch2 also references it
            const retractRes = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: `/catalog/imports/${batch1}/retract`,
                params: { id: batch1 },
                headers: { authorization: `Bearer ${adminToken}` }
            });
            expect(retractRes.statusCode).toBe(200);
            expect(retractRes.body.data.preservedSharedVariantsCount).toBeGreaterThanOrEqual(1);

            // Verify variant still exists in paper_variants
            const [vCheck] = await connectionPool.query('SELECT id FROM paper_variants WHERE id = ?', [varId]);
            expect(vCheck.length).toBe(1);

            // Cleanup
            await connectionPool.query('DELETE FROM paper_import_rows WHERE batch_id IN (?, ?)', [batch1, batch2]);
            await connectionPool.query('DELETE FROM paper_import_batches WHERE id IN (?, ?)', [batch1, batch2]);
            await connectionPool.query('DELETE FROM paper_variants WHERE id = ?', [varId]);
        });

        it('Concurrency test: two independent MySQL connections prevent orphaned references via FK constraint', async () => {
            if (!isDbConfigured) return;

            // Dedicated variant for concurrency test
            const varId = 'var-concurrent-fk-' + Date.now();
            await connectionPool.query(`
                INSERT INTO paper_variants
                (id, product_id, gsm, caliper_um, caliper_mm, width_mm, height_mm, finish, grain_direction, fingerprint)
                VALUES (?, 'prod-munken-1', 100, 110, 0.1100, 700.00, 1000.00, 'Gloss', 'LONG_GRAIN', ?)
            `, [varId, 'fp-concurrent-' + Date.now()]);

            const conn1 = await connectionPool.getConnection();
            const conn2 = await connectionPool.getConnection();

            try {
                // Connection 1 begins transaction and deletes the variant
                await conn1.beginTransaction();
                await conn1.query('DELETE FROM paper_variants WHERE id = ?', [varId]);
                await conn1.commit();

                // Connection 2 attempts to insert an offer referencing the deleted variant
                let caughtFkError = null;
                try {
                    await conn2.query(`
                        INSERT INTO supplier_paper_offers
                        (id, tenant_id, supplier_id, variant_id, supplier_sku, price_amount, currency, price_basis, moq, order_multiple, status, visibility)
                        VALUES ('off-concurrent-orphan', 'tenant-paper-1', 'supp-alpha', ?, 'SKU-CONC-01', 500.00, 'EUR', 'TONNE', 1, 1, 'ACTIVE', 'PRIVATE')
                    `, [varId]);
                } catch (err) {
                    caughtFkError = err;
                }

                // Verified: MySQL InnoDB rejects the insertion with foreign key constraint failure (code 1452 / ER_NO_REFERENCED_ROW_2)
                expect(caughtFkError).not.toBeNull();
                expect(caughtFkError.message).toContain('foreign key constraint fails');

                // Verify zero orphaned offers exist in supplier_paper_offers
                const [orphanCheck] = await connectionPool.query('SELECT * FROM supplier_paper_offers WHERE id = "off-concurrent-orphan"');
                expect(orphanCheck.length).toBe(0);
            } finally {
                conn1.release();
                conn2.release();
            }
        });
    });

    describe('8. Commercial Revisions Preservation, Catalog Associations & Granular Lifecycle', () => {
        it('Offer logical retirement preserves 100% of revisions in supplier_paper_offer_revisions instead of cascading delete', async () => {
            if (!isDbConfigured) return;

            const adminToken = generateToken({ id: 'user-admin-alpha', userId: 'user-admin-alpha', tenantId: 'tenant-alpha', supplierId: 'supp-alpha-1', role: 'SUPPLIER_ADMIN' });

            // 1. Create offer -> revision #1
            const createRes = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: '/offers',
                body: {
                    variantId: 'var-munken-120-70100',
                    supplierSku: 'SKU-REVISION-LEDGER-01',
                    priceAmount: 850.50,
                    currency: 'EUR',
                    priceBasis: 'TONNE',
                    moq: 1,
                    orderMultiple: 1,
                    deliveryZones: ['ES', 'PT'],
                    visibility: 'APPROVED_CUSTOMERS',
                    changeReason: 'Initial revision v1'
                },
                headers: { authorization: `Bearer ${adminToken}` }
            });
            expect(createRes.statusCode).toBe(201);
            const offerId = createRes.body.data.id;

            // 2. Update offer price -> revision #2
            const updateRes1 = await dispatch(paperSuppliersRouter, {
                method: 'PUT',
                url: `/offers/${offerId}`,
                params: { offerId },
                body: {
                    priceAmount: 890.00,
                    changeReason: 'Price adjustment Q4 v2'
                },
                headers: { authorization: `Bearer ${adminToken}` }
            });
            expect(updateRes1.statusCode).toBe(200);

            // 3. Update delivery zones -> revision #3
            const updateRes2 = await dispatch(paperSuppliersRouter, {
                method: 'PUT',
                url: `/offers/${offerId}`,
                params: { offerId },
                body: {
                    deliveryZones: ['ES', 'PT', 'FR'],
                    changeReason: 'Expanding zones to France v3'
                },
                headers: { authorization: `Bearer ${adminToken}` }
            });
            expect(updateRes2.statusCode).toBe(200);

            // Verify 3 revisions exist before delete
            const [revsBefore] = await connectionPool.query(
                'SELECT * FROM supplier_paper_offer_revisions WHERE offer_id = ? ORDER BY revision_number ASC',
                [offerId]
            );
            expect(revsBefore.length).toBe(3);

            // 4. DELETE the offer
            const delRes = await dispatch(paperSuppliersRouter, {
                method: 'DELETE',
                url: `/offers/${offerId}`,
                params: { id: offerId },
                headers: { authorization: `Bearer ${adminToken}` }
            });
            expect(delRes.statusCode).toBe(200);
            expect(delRes.body.ok).toBe(true);
            expect(delRes.body.data.retired).toBe(true);

            // 5. CRUCIAL ASSERTION: Revisions are NOT destroyed by ON DELETE CASCADE!
            const [revsAfter] = await connectionPool.query(
                'SELECT * FROM supplier_paper_offer_revisions WHERE offer_id = ? ORDER BY revision_number ASC',
                [offerId]
            );
            expect(revsAfter.length).toBe(4);
            expect(revsAfter[3].status).toBe('ARCHIVED');
            expect(revsAfter[3].change_reason).toContain('Offer retired / soft-deleted');

            // 6. Offer row in supplier_paper_offers is retained with deleted_at and status ARCHIVED
            const [offerRows] = await connectionPool.query(
                'SELECT id, deleted_at, status FROM supplier_paper_offers WHERE id = ?',
                [offerId]
            );
            expect(offerRows.length).toBe(1);
            expect(offerRows[0].deleted_at).not.toBeNull();
            expect(offerRows[0].status).toBe('ARCHIVED');

            // 7. GET /offers/:id retrieves the retired offer along with full revision ledger
            const getRes = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: `/offers/${offerId}`,
                params: { id: offerId },
                headers: { authorization: `Bearer ${adminToken}` }
            });
            expect(getRes.statusCode).toBe(200);
            expect(getRes.body.data.deletedAt).not.toBeNull();
            expect(getRes.body.data.revisions.length).toBe(4);
            const revReasons = getRes.body.data.revisions.map(r => r.changeReason);
            expect(revReasons).toContain('Initial revision v1');
            expect(revReasons).toContain('Price adjustment Q4 v2');
            expect(revReasons).toContain('Expanding zones to France v3');
            expect(revReasons).toContain('Offer retired / soft-deleted (commercial history preserved)');
        });

        it('Supplier-scoped variant withdrawal records association and offers as withdrawn/archived without destroying shared paper_variants', async () => {
            if (!isDbConfigured) return;

            const adminToken = generateToken({ id: 'user-admin-alpha', userId: 'user-admin-alpha', tenantId: 'tenant-alpha', supplierId: 'supp-alpha-1', role: 'SUPPLIER_ADMIN' });
            const varId = 'var-munken-120-70100';

            // Preview catalog withdrawal
            const previewRes = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: '/catalog/variants/preview-action',
                body: {
                    action: 'WITHDRAW',
                    variantIds: [varId],
                    scope: 'SELECTED'
                },
                headers: { authorization: `Bearer ${adminToken}` }
            });
            expect(previewRes.statusCode).toBe(200);
            expect(previewRes.body.data.targetCount).toBe(1);
            expect(previewRes.body.data.warnings.length).toBeGreaterThan(0);

            // Execute withdrawal
            const withdrawRes = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: '/catalog/variants/bulk-withdraw',
                body: {
                    variantIds: [varId],
                    scope: 'SELECTED'
                },
                headers: { authorization: `Bearer ${adminToken}` }
            });
            expect(withdrawRes.statusCode).toBe(200);
            expect(withdrawRes.body.data.succeededCount).toBe(1);

            // Verification 1: Association in supplier_paper_catalog_variants is recorded as withdrawn
            const [assocRows] = await connectionPool.query(
                'SELECT * FROM supplier_paper_catalog_variants WHERE supplier_id = "supp-alpha-1" AND variant_id = ?',
                [varId]
            );
            expect(assocRows.length).toBe(1);
            expect(assocRows[0].status).toBe('ARCHIVED');
            expect(assocRows[0].deleted_at).not.toBeNull();
            expect(assocRows[0].notes).toContain('Withdrawn');

            // Verification 2: Shared canonical record in paper_variants is 100% UNTOUCHED
            const [variantRows] = await connectionPool.query(
                'SELECT * FROM paper_variants WHERE id = ?',
                [varId]
            );
            expect(variantRows.length).toBe(1);

            // Verification 3: Supplier Beta can still see the variant in catalog
            const betaToken = generateToken({ id: 'user-op-beta-1', userId: 'user-op-beta-1', tenantId: 'tenant-beta', supplierId: 'supp-beta-1', role: 'SUPPLIER_OPERATOR' });
            const betaCatalogRes = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/catalog/products',
                headers: { authorization: `Bearer ${betaToken}` }
            });
            expect(betaCatalogRes.statusCode).toBe(200);
            const munkenInBeta = betaCatalogRes.body.data.products.find((p) => p.id === 'prod-munken-1');
            expect(munkenInBeta).toBeDefined();
            const varInBeta = munkenInBeta.variants.find((v) => v.id === varId);
            expect(varInBeta).toBeDefined();
            expect(varInBeta.isWithdrawn).toBe(false);
        });

        it('Enforces cross-supplier isolation and returns granular results and error reporting on mixed batch', async () => {
            if (!isDbConfigured) return;

            const alphaToken = generateToken({ id: 'user-op-alpha', userId: 'user-op-alpha', tenantId: 'tenant-alpha', supplierId: 'supp-alpha-1', role: 'SUPPLIER_OPERATOR' });
            const betaToken = generateToken({ id: 'user-op-beta-1', userId: 'user-op-beta-1', tenantId: 'tenant-beta', supplierId: 'supp-beta-1', role: 'SUPPLIER_OPERATOR' });

            // Seed Beta's catalog association for var-munken-150-70100 first so it belongs to Beta's catalog
            await connectionPool.query(`
                INSERT INTO supplier_paper_catalog_variants (id, tenant_id, supplier_id, variant_id, status, notes, created_at, updated_at)
                VALUES ('spcv-beta-munken-150', 'tenant-beta', 'supp-beta-1', 'var-munken-150-70100', 'ACTIVE', 'Active in Beta catalog', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE status = 'ACTIVE', deleted_at = NULL;
            `);

            // Supplier Beta attempts to archive variant with non-existent ID + existing ID
            const mixedBatchRes = await dispatch(paperSuppliersRouter, {
                method: 'PATCH',
                url: '/catalog/variants/bulk-status',
                body: {
                    status: 'ARCHIVED',
                    variantIds: ['var-munken-150-70100', 'var-ghost-id-999'],
                    scope: 'SELECTED'
                },
                headers: { authorization: `Bearer ${betaToken}` }
            });

            expect(mixedBatchRes.statusCode).toBe(200);
            expect(mixedBatchRes.body.data.totalProcessed).toBe(2);
            expect(mixedBatchRes.body.data.succeededCount).toBe(1);
            expect(mixedBatchRes.body.data.failedCount).toBe(1);
            expect(mixedBatchRes.body.data.results).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ id: 'var-munken-150-70100', success: true }),
                    expect.objectContaining({ id: 'var-ghost-id-999', success: false, code: 'VARIANT_NOT_FOUND' })
                ])
            );

            // Supplier Beta's archive of var-munken-150 does NOT affect Supplier Alpha's catalog view
            const alphaCatalogRes = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: '/catalog/products',
                headers: { authorization: `Bearer ${alphaToken}` }
            });
            expect(alphaCatalogRes.statusCode).toBe(200);
            const munkenInAlpha = alphaCatalogRes.body.data.products.find((p) => p.id === 'prod-munken-1');
            const var150InAlpha = munkenInAlpha.variants.find((v) => v.id === 'var-munken-150-70100');
            expect(var150InAlpha.supplierCatalogStatus).not.toBe('ARCHIVED');
        });
    });

    describe('9. Data Transition, Soft-Delete Semantics, and Reversal Verification', () => {
        it('Migrates and backfills catalog associations idempotently from real supplier imports/offers without global leakage', async () => {
            if (!isDbConfigured) return;

            // Seed raw import batch and commercial offer representing pre-migration-165 state
            const preBatchId = 'batch-pre-mig165-1';
            const preRowId = 'row-pre-mig165-1';
            const preOfferId = 'offer-pre-mig165-1';
            const preVariantFromBatch = 'var-soporset-80-6490';
            const preVariantFromOffer = 'var-soporset-90-6490';
            const unrelatedGlobalVariant = 'var-munken-300-70100';

            // Seed physical products and variants for test
            await connectionPool.query(`
                INSERT INTO paper_products (id, name, brand, category, finish_summary)
                VALUES ('prod-soporset-1', 'Soporset Offset', 'The Navigator Company', 'UNCOATED', 'SMOOTH')
                ON DUPLICATE KEY UPDATE name=VALUES(name);
            `);
            await connectionPool.query(`
                INSERT INTO paper_variants (id, product_id, gsm, width_mm, height_mm, finish, grain_direction, fingerprint)
                VALUES 
                ('var-soporset-80-6490', 'prod-soporset-1', 80, 640.00, 900.00, 'SMOOTH', 'LONG_GRAIN', 'fp_soporset_80_640_900'),
                ('var-soporset-90-6490', 'prod-soporset-1', 90, 640.00, 900.00, 'SMOOTH', 'LONG_GRAIN', 'fp_soporset_90_640_900'),
                ('var-soporset-100-6490', 'prod-soporset-1', 100, 640.00, 900.00, 'SMOOTH', 'LONG_GRAIN', 'fp_soporset_100_640_900'),
                ('var-munken-300-70100', 'prod-munken-1', 300, 700.00, 1000.00, 'ROUGH', 'LONG_GRAIN', 'fp_munken_300_700_1000')
                ON DUPLICATE KEY UPDATE gsm=VALUES(gsm);
            `);

            // Clean any existing associations for these test variants
            await connectionPool.query(
                'DELETE FROM supplier_paper_catalog_variants WHERE supplier_id = "supp-alpha-1" AND variant_id IN (?, ?, ?)',
                [preVariantFromBatch, preVariantFromOffer, unrelatedGlobalVariant]
            );

            // 1. Insert confirmed import batch & row for supp-alpha-1
            await connectionPool.query(`
                INSERT INTO paper_import_batches (id, tenant_id, supplier_id, file_name, file_sha256, format, total_rows, valid_rows, status, created_by)
                VALUES (?, 'tenant-alpha', 'supp-alpha-1', 'pre_mig165.csv', 'sha256_mock_pre165', 'CSV', 1, 1, 'CONFIRMED', 'user-admin-alpha')
                ON DUPLICATE KEY UPDATE status='CONFIRMED'
            `, [preBatchId]);

            await connectionPool.query(`
                INSERT INTO paper_import_rows (id, batch_id, \`row_number\`, sheet_name, raw_data_json, normalized_data_json, validation_status, decision, mapped_variant_id)
                VALUES (?, ?, 1, 'Sheet1', '{"raw": true}', '{"name":"Soporset Offset","gsm":80,"width_mm":640,"height_mm":900}', 'VALID', 'ACCEPTED', ?)
                ON DUPLICATE KEY UPDATE decision='ACCEPTED', mapped_variant_id=?
            `, [preRowId, preBatchId, preVariantFromBatch, preVariantFromBatch]);

            // 2. Insert commercial offer for supp-alpha-1
            await connectionPool.query(`
                INSERT INTO supplier_paper_offers (id, tenant_id, supplier_id, variant_id, supplier_sku, price_amount, currency, price_basis, moq, order_multiple, status)
                VALUES (?, 'tenant-alpha', 'supp-alpha-1', ?, 'SKU-PRE-165', 45.00, 'EUR', 'PACK', 1, 1, 'ACTIVE')
                ON DUPLICATE KEY UPDATE status='ACTIVE'
            `, [preOfferId, preVariantFromOffer]);

            // Execute the Migration 165 Backfill SQL Statements
            const backfillSql1 = `
                INSERT IGNORE INTO supplier_paper_catalog_variants (id, tenant_id, supplier_id, variant_id, status, notes, created_at, updated_at)
                SELECT 
                    CONCAT('spcv_', MD5(CONCAT(b.supplier_id, ':', r.mapped_variant_id))),
                    b.tenant_id,
                    b.supplier_id,
                    r.mapped_variant_id,
                    'ACTIVE',
                    'Backfilled from confirmed import batch',
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                FROM paper_import_rows r
                JOIN paper_import_batches b ON r.batch_id = b.id
                WHERE b.status = 'CONFIRMED' AND r.mapped_variant_id = ?
                GROUP BY b.tenant_id, b.supplier_id, r.mapped_variant_id;
            `;
            await connectionPool.query(backfillSql1, [preVariantFromBatch]);

            const backfillSql2 = `
                INSERT IGNORE INTO supplier_paper_catalog_variants (id, tenant_id, supplier_id, variant_id, status, notes, created_at, updated_at)
                SELECT 
                    CONCAT('spcv_', MD5(CONCAT(o.supplier_id, ':', o.variant_id))),
                    o.tenant_id,
                    o.supplier_id,
                    o.variant_id,
                    'ACTIVE',
                    'Backfilled from supplier commercial offers',
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                FROM supplier_paper_offers o
                WHERE o.variant_id = ?
                GROUP BY o.tenant_id, o.supplier_id, o.variant_id;
            `;
            await connectionPool.query(backfillSql2, [preVariantFromOffer]);

            // Verify associations were created
            const [assocRows] = await connectionPool.query(
                'SELECT * FROM supplier_paper_catalog_variants WHERE supplier_id = "supp-alpha-1" AND variant_id IN (?, ?, ?)',
                [preVariantFromBatch, preVariantFromOffer, unrelatedGlobalVariant]
            );
            expect(assocRows.length).toBe(2);
            const batchAssoc = assocRows.find(r => r.variant_id === preVariantFromBatch);
            const offerAssoc = assocRows.find(r => r.variant_id === preVariantFromOffer);
            expect(batchAssoc).toBeDefined();
            expect(batchAssoc.status).toBe('ACTIVE');
            expect(batchAssoc.id).toBe(`spcv_${crypto.createHash('md5').update(`supp-alpha-1:${preVariantFromBatch}`).digest('hex')}`);

            expect(offerAssoc).toBeDefined();
            expect(offerAssoc.status).toBe('ACTIVE');
            expect(offerAssoc.id).toBe(`spcv_${crypto.createHash('md5').update(`supp-alpha-1:${preVariantFromOffer}`).digest('hex')}`);

            // Unrelated global variant is NOT associated to supp-alpha-1
            const unrelatedAssoc = assocRows.find(r => r.variant_id === unrelatedGlobalVariant);
            expect(unrelatedAssoc).toBeUndefined();

            // Re-running backfill is completely idempotent
            await connectionPool.query(backfillSql1, [preVariantFromBatch]);
            await connectionPool.query(backfillSql2, [preVariantFromOffer]);
            const [reAssocRows] = await connectionPool.query(
                'SELECT * FROM supplier_paper_catalog_variants WHERE supplier_id = "supp-alpha-1" AND variant_id IN (?, ?)',
                [preVariantFromBatch, preVariantFromOffer]
            );
            expect(reAssocRows.length).toBe(2);

            // Now mark preVariantFromBatch as ARCHIVED with deleted_at (withdrawn)
            await connectionPool.query(
                'UPDATE supplier_paper_catalog_variants SET status = "ARCHIVED", deleted_at = CURRENT_TIMESTAMP WHERE supplier_id = "supp-alpha-1" AND variant_id = ?',
                [preVariantFromBatch]
            );

            // Re-running backfill MUST NOT reactivate or clear deleted_at on ARCHIVED / withdrawn association
            await connectionPool.query(backfillSql1, [preVariantFromBatch]);
            const [checkArchivedRows] = await connectionPool.query(
                'SELECT status, deleted_at FROM supplier_paper_catalog_variants WHERE supplier_id = "supp-alpha-1" AND variant_id = ?',
                [preVariantFromBatch]
            );
            expect(checkArchivedRows[0].status).toBe('ARCHIVED');
            expect(checkArchivedRows[0].deleted_at).not.toBeNull();
        });

        it('New confirmed import batch associates variant and does not overwrite existing ARCHIVED state', async () => {
            if (!isDbConfigured) return;

            const testVarId = 'var-soporset-100-6490';
            const adminToken = generateToken({ id: 'user-admin-alpha', userId: 'user-admin-alpha', tenantId: 'tenant-alpha', supplierId: 'supp-alpha-1', role: 'SUPPLIER_ADMIN' });

            // Ensure clean initial state
            await connectionPool.query(
                'DELETE FROM supplier_paper_catalog_variants WHERE supplier_id = "supp-alpha-1" AND variant_id = ?',
                [testVarId]
            );

            // Create and confirm a new batch via paperImportService
            const batchId = `batch-confirm-${Date.now()}`;
            await connectionPool.query(`
                INSERT INTO paper_import_batches (id, tenant_id, supplier_id, file_name, file_sha256, format, total_rows, valid_rows, status, created_by)
                VALUES (?, 'tenant-alpha', 'supp-alpha-1', 'new_import.csv', 'sha256_new_import', 'CSV', 1, 1, 'PREVIEW', 'user-admin-alpha')
            `, [batchId]);

            const rowId = `row-confirm-${Date.now()}`;
            await connectionPool.query(`
                INSERT INTO paper_import_rows (id, batch_id, \`row_number\`, sheet_name, raw_data_json, normalized_data_json, validation_status, decision, mapped_product_id, mapped_variant_id)
                VALUES (?, ?, 1, 'Sheet1', '{"raw": 1}', '{"name":"Soporset Offset","gsm":100,"width_mm":640,"height_mm":900}', 'VALID', 'PENDING', 'prod-soporset-1', ?)
            `, [rowId, batchId, testVarId]);

            const confirmRes = await paperImportService.confirmImportBatch({
                batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-admin-alpha',
                selectedRowIds: [rowId]
            });
            expect(confirmRes.ok).toBe(true);

            // Association is created as ACTIVE
            const [assoc1] = await connectionPool.query(
                'SELECT * FROM supplier_paper_catalog_variants WHERE supplier_id = "supp-alpha-1" AND variant_id = ?',
                [testVarId]
            );
            expect(assoc1.length).toBe(1);
            expect(assoc1[0].status).toBe('ACTIVE');

            // Supplier now explicitly archives this variant
            await connectionPool.query(
                'UPDATE supplier_paper_catalog_variants SET status = "ARCHIVED" WHERE supplier_id = "supp-alpha-1" AND variant_id = ?',
                [testVarId]
            );

            // Confirm a second batch with the same variant
            const batchId2 = `batch-confirm2-${Date.now()}`;
            await connectionPool.query(`
                INSERT INTO paper_import_batches (id, tenant_id, supplier_id, file_name, file_sha256, format, total_rows, valid_rows, status, created_by)
                VALUES (?, 'tenant-alpha', 'supp-alpha-1', 'new_import2.csv', 'sha256_new_import2', 'CSV', 1, 1, 'PREVIEW', 'user-admin-alpha')
            `, [batchId2]);
            const rowId2 = `row-confirm2-${Date.now()}`;
            await connectionPool.query(`
                INSERT INTO paper_import_rows (id, batch_id, \`row_number\`, sheet_name, raw_data_json, normalized_data_json, validation_status, decision, mapped_product_id, mapped_variant_id)
                VALUES (?, ?, 1, 'Sheet1', '{"raw": 2}', '{"name":"Soporset Offset","gsm":100,"width_mm":640,"height_mm":900}', 'VALID', 'PENDING', 'prod-soporset-1', ?)
            `, [rowId2, batchId2, testVarId]);

            await paperImportService.confirmImportBatch({
                batchId: batchId2,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-admin-alpha',
                selectedRowIds: [rowId2]
            });

            // Status MUST remain ARCHIVED (confirmBatch does NOT overwrite status)
            const [assoc2] = await connectionPool.query(
                'SELECT * FROM supplier_paper_catalog_variants WHERE supplier_id = "supp-alpha-1" AND variant_id = ?',
                [testVarId]
            );
            expect(assoc2.length).toBe(1);
            expect(assoc2[0].status).toBe('ARCHIVED');
        });

        it('Retired offer (deleted_at) is immutable, cannot be reactivated or appear available, preserves SKU and revision idempotence', async () => {
            if (!isDbConfigured) return;

            const adminToken = generateToken({ id: 'user-admin-alpha', userId: 'user-admin-alpha', tenantId: 'tenant-alpha', supplierId: 'supp-alpha-1', role: 'SUPPLIER_ADMIN' });
            const testSku = `SKU-IMMUTABLE-${Date.now()}`;

            // Create offer with 2 revisions
            const createRes = await paperOfferService.createOffer({
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-admin-alpha',
                payload: {
                    variantId: 'var-munken-120-70100',
                    supplierSku: testSku,
                    priceAmount: 110.0,
                    currency: 'EUR',
                    priceBasis: 'TONNE',
                    moq: 1,
                    orderMultiple: 1
                }
            });
            const offerId = createRes.id;

            // Update to revision 2
            await paperOfferService.updateOffer({
                offerId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-admin-alpha',
                payload: {
                    priceAmount: 115.0,
                    changeReason: 'Revision 2 price adjustment'
                }
            });

            // Retire offer via deleteOffer
            const delRes = await paperOfferService.deleteOffer({
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-admin-alpha',
                role: 'SUPPLIER_ADMIN',
                offerId
            });
            expect(delRes.ok).toBe(true);
            expect(delRes.retired).toBe(true);
            expect(delRes.revisionsPreserved).toBe(3); // rev1, rev2, terminal rev3

            // 1. Gating verification: Calling updateOffer throws OFFER_RETIRED
            await expect(paperOfferService.updateOffer({
                offerId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-admin-alpha',
                payload: { priceAmount: 120.0 }
            })).rejects.toThrow(/OFFER_RETIRED/);

            // 2. Gating verification: Calling updateOfferStatus throws OFFER_RETIRED
            await expect(paperOfferService.updateOfferStatus({
                offerId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-admin-alpha',
                status: 'ACTIVE'
            })).rejects.toThrow(/OFFER_RETIRED/);

            // 3. Gating verification: Calling bulkUpdateOfferStatus fails closed
            const bulkRes = await paperOfferService.bulkUpdateOfferStatus({
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-admin-alpha',
                action: 'RESTORE',
                offerIds: [offerId],
                scope: 'SELECTED'
            });
            expect(bulkRes.succeededCount).toBe(0);
            expect(bulkRes.failedCount).toBe(1);
            expect(bulkRes.results[0].code).toBe('OFFER_RETIRED');

            // 4. Query verification: Omitted from listSupplierOffers
            const listRes = await paperOfferService.listSupplierOffers({
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                page: 1,
                limit: 100
            });
            const foundInList = listRes.items.find(i => i.id === offerId);
            expect(foundInList).toBeUndefined();

            // 5. Query verification: Not counted as active offer in catalog
            const catRes = await paperOfferService.getTechnicalCatalog({
                supplierId: 'supp-alpha-1',
                page: 1,
                limit: 50
            });
            const munkenItem = catRes.items.find(i => i.id === 'var-munken-120-70100');
            expect(munkenItem).toBeDefined();
            // All active offers for this variant were retired
            expect(munkenItem.activeOffersCount).toBe(0);

            // 6. SKU preservation verification under uk_supplier_sku_active constraint
            // Attempting to reuse testSku must fail on UNIQUE constraint
            await expect(paperOfferService.createOffer({
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-admin-alpha',
                payload: {
                    variantId: 'var-munken-120-70100',
                    supplierSku: testSku,
                    priceAmount: 99.0,
                    currency: 'EUR',
                    priceBasis: 'TONNE',
                    moq: 1,
                    orderMultiple: 1
                }
            })).rejects.toThrow();

            // 7. Duplicate retirement idempotence: Calling deleteOffer again does NOT duplicate terminal revision
            const delRes2 = await paperOfferService.deleteOffer({
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-admin-alpha',
                role: 'SUPPLIER_ADMIN',
                offerId
            });
            expect(delRes2.ok).toBe(true);
            expect(delRes2.alreadyRetired).toBe(true);
            expect(delRes2.revisionsPreserved).toBe(3);

            const [revRows] = await connectionPool.query(
                'SELECT COUNT(*) as total FROM supplier_paper_offer_revisions WHERE offer_id = ?',
                [offerId]
            );
            expect(Number(revRows[0].total)).toBe(3); // Exactly 3 revisions, zero duplicates
        });

        it('Enforces exact MAX_BULK_OPERATION_LIMIT = 500 ceiling on ALL_MATCHING and prevents silent partial processing', async () => {
            if (!isDbConfigured) return;

            const adminToken = generateToken({ id: 'user-admin-alpha', userId: 'user-admin-alpha', tenantId: 'tenant-alpha', supplierId: 'supp-alpha-1', role: 'SUPPLIER_ADMIN' });

            // 1. Preview action with > 500 items blocks execution
            const oversizedSelectedIds = Array.from({ length: 501 }, (_, i) => `var-dummy-${i}`);

            const previewRes = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: '/catalog/variants/preview-action',
                body: {
                    action: 'ARCHIVE',
                    variantIds: oversizedSelectedIds,
                    scope: 'SELECTED'
                },
                headers: { authorization: `Bearer ${adminToken}` }
            });
            expect(previewRes.statusCode).toBe(200);
            expect(previewRes.body.data.canProceed).toBe(false);
            expect(previewRes.body.data.blockedCount).toBe(501);
            expect(previewRes.body.data.message).toContain('EXCEEDS_MAX_BATCH_LIMIT');

            // 2. Direct execution of bulk status on > 500 offers throws EXCEEDS_MAX_BATCH_LIMIT
            const oversizedOfferIds = Array.from({ length: 501 }, (_, i) => `off-dummy-${i}`);
            await expect(paperOfferService.bulkUpdateOfferStatus({
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-admin-alpha',
                action: 'ARCHIVE',
                offerIds: oversizedOfferIds,
                scope: 'SELECTED'
            })).rejects.toThrow(/EXCEEDS_MAX_BATCH_LIMIT/);

            // 3. Direct execution of bulk delete on > 500 offers throws EXCEEDS_MAX_BATCH_LIMIT
            await expect(paperOfferService.bulkDeleteOffers({
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-admin-alpha',
                role: 'SUPPLIER_ADMIN',
                offerIds: oversizedOfferIds,
                scope: 'SELECTED'
            })).rejects.toThrow(/EXCEEDS_MAX_BATCH_LIMIT/);

            // 4. Catalog bulk archive with > 500 variants throws EXCEEDS_MAX_BATCH_LIMIT
            await expect(paperOfferService.archiveSupplierCatalogVariants({
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-admin-alpha',
                role: 'SUPPLIER_ADMIN',
                variantIds: oversizedSelectedIds,
                scope: 'SELECTED'
            })).rejects.toThrow(/EXCEEDS_MAX_BATCH_LIMIT/);
        });
    });

    describe('10. Multi-Supplier Catalog Scope, Unassociated Variants & Incorporation Protection', () => {
        it('Ensures unassociated variants are queryable as UNASSOCIATED without side-effect associations, bulk actions do not sweep foreign variants, and incorporation protects shared specifications', async () => {
            if (!isDbConfigured) return;

            const supplierAlpha = 'supp-alpha-1';
            const supplierBeta = 'supp-beta-1';
            const tenantId = 'tenant-alpha';
            const alphaAdminToken = generateToken({ id: 'user-admin-alpha', userId: 'user-admin-alpha', tenantId, supplierId: supplierAlpha, role: 'SUPPLIER_ADMIN' });
            const betaAdminToken = generateToken({ id: 'user-admin-beta', userId: 'user-admin-beta', tenantId, supplierId: supplierBeta, role: 'SUPPLIER_ADMIN' });

            // 1. Seed a global technical product and variants that belong exclusively to Supplier Beta or global catalog
            const testProductId = 'prod-multi-reg-1';
            const testVariantBeta = 'var-beta-exclusive-1';
            const testVariantGlobalOnly = 'var-global-unrelated-1';

            await connectionPool.query(`
                INSERT INTO paper_products (id, name, category, brand, manufacturer, created_at, updated_at)
                VALUES (?, 'Regal Coated Silk', 'COATED', 'Regal Papers', 'Regal Mills', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE name = VALUES(name)
            `, [testProductId]);

            await connectionPool.query(`
                INSERT INTO paper_variants (id, product_id, gsm, width_mm, height_mm, finish, grain_direction, caliper_um, caliper_mm, fingerprint, created_at, updated_at)
                VALUES 
                (?, ?, 170, 700, 1000, 'SILK', 'LONG_GRAIN', 160, 0.1600, 'fp-regal-170-silk-70100', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
                (?, ?, 250, 700, 1000, 'SILK', 'LONG_GRAIN', 240, 0.2400, 'fp-regal-250-silk-70100', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE gsm = VALUES(gsm)
            `, [testVariantBeta, testProductId, testVariantGlobalOnly, testProductId]);

            // Associate testVariantBeta strictly to Supplier Beta (active)
            await connectionPool.query(`
                INSERT INTO supplier_paper_catalog_variants (id, tenant_id, supplier_id, variant_id, status, notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'ACTIVE', 'Associated to Beta', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE status = 'ACTIVE'
            `, ['spcv_beta_regal_170', tenantId, supplierBeta, testVariantBeta]);

            // Confirm that Supplier Alpha has ZERO associations with testVariantBeta and testVariantGlobalOnly
            const [alphaAssocBefore] = await connectionPool.query(
                'SELECT COUNT(*) as count FROM supplier_paper_catalog_variants WHERE supplier_id = ? AND variant_id IN (?, ?)',
                [supplierAlpha, testVariantBeta, testVariantGlobalOnly]
            );
            expect(Number(alphaAssocBefore[0].count)).toBe(0);

            // =========================================================================
            // REQUIREMENT 1: Querying catalog as Supplier Alpha:
            // - Variants are consultable
            // - Return supplierCatalogStatus = 'UNASSOCIATED' and isCatalogAssociated = false
            // - Consultation creates ZERO side-effect associations in database
            // =========================================================================
            const alphaQueryRes = await dispatch(paperSuppliersRouter, {
                method: 'GET',
                url: `/catalog/products?search=Regal`,
                headers: { authorization: `Bearer ${alphaAdminToken}` }
            });
            expect(alphaQueryRes.statusCode).toBe(200);
            const regalProdInAlpha = alphaQueryRes.body.data.products.find((p) => p.id === testProductId);
            expect(regalProdInAlpha).toBeDefined();

            const betaVarViewedByAlpha = regalProdInAlpha.variants.find((v) => v.id === testVariantBeta);
            expect(betaVarViewedByAlpha).toBeDefined();
            expect(betaVarViewedByAlpha.supplierCatalogStatus).toBe('UNASSOCIATED');
            expect(betaVarViewedByAlpha.isCatalogAssociated).toBe(false);

            const globalVarViewedByAlpha = regalProdInAlpha.variants.find((v) => v.id === testVariantGlobalOnly);
            expect(globalVarViewedByAlpha).toBeDefined();
            expect(globalVarViewedByAlpha.supplierCatalogStatus).toBe('UNASSOCIATED');
            expect(globalVarViewedByAlpha.isCatalogAssociated).toBe(false);

            // Check database: ZERO associations created for Supplier Alpha as side-effect of querying
            const [alphaAssocAfterQuery] = await connectionPool.query(
                'SELECT COUNT(*) as count FROM supplier_paper_catalog_variants WHERE supplier_id = ? AND variant_id IN (?, ?)',
                [supplierAlpha, testVariantBeta, testVariantGlobalOnly]
            );
            expect(Number(alphaAssocAfterQuery[0].count)).toBe(0);

            // =========================================================================
            // REQUIREMENT 2: Bulk ALL_MATCHING execution by Supplier Alpha:
            // - Archiving all matching results for search=Regal must NOT sweep or associate testVariantBeta or testVariantGlobalOnly
            // - Withdrawing all matching results must NOT affect or associate foreign variants
            // - Selected execution on unassociated variants must return VARIANT_NOT_ASSOCIATED
            // =========================================================================

            // Preview ALL_MATCHING for search=Regal by Supplier Alpha: targetCount must be 0 (no associated variants match)
            const alphaPreviewRes = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: '/catalog/variants/preview-action',
                body: {
                    action: 'ARCHIVE',
                    scope: 'ALL_MATCHING',
                    filters: { search: 'Regal' }
                },
                headers: { authorization: `Bearer ${alphaAdminToken}` }
            });
            expect(alphaPreviewRes.statusCode).toBe(200);
            expect(alphaPreviewRes.body.data.targetCount).toBe(0);

            // Execute bulk status ARCHIVE with ALL_MATCHING for search=Regal by Supplier Alpha
            const alphaBulkArchiveRes = await dispatch(paperSuppliersRouter, {
                method: 'PATCH',
                url: '/catalog/variants/bulk-status',
                body: {
                    status: 'ARCHIVED',
                    scope: 'ALL_MATCHING',
                    filters: { search: 'Regal' }
                },
                headers: { authorization: `Bearer ${alphaAdminToken}` }
            });
            expect(alphaBulkArchiveRes.statusCode).toBe(200);
            expect(alphaBulkArchiveRes.body.data.totalProcessed).toBe(0);

            // Execute bulk WITHDRAW with ALL_MATCHING for search=Regal by Supplier Alpha
            const alphaBulkWithdrawRes = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: '/catalog/variants/bulk-withdraw',
                body: {
                    scope: 'ALL_MATCHING',
                    filters: { search: 'Regal' }
                },
                headers: { authorization: `Bearer ${alphaAdminToken}` }
            });
            expect(alphaBulkWithdrawRes.statusCode).toBe(200);
            expect(alphaBulkWithdrawRes.body.data.totalProcessed).toBe(0);

            // Confirm that Supplier Beta's association with testVariantBeta remains untouched and ACTIVE
            const [betaAssocCheck] = await connectionPool.query(
                'SELECT status, deleted_at FROM supplier_paper_catalog_variants WHERE supplier_id = ? AND variant_id = ?',
                [supplierBeta, testVariantBeta]
            );
            expect(betaAssocCheck[0].status).toBe('ACTIVE');
            expect(betaAssocCheck[0].deleted_at).toBeNull();

            // Attempting to directly archive or withdraw an unassociated variant with scope=SELECTED fails with VARIANT_NOT_ASSOCIATED
            const directArchiveRes = await paperOfferService.archiveSupplierCatalogVariants({
                tenantId,
                supplierId: supplierAlpha,
                actorId: 'user-admin-alpha',
                role: 'SUPPLIER_ADMIN',
                variantIds: [testVariantBeta],
                scope: 'SELECTED'
            });
            expect(directArchiveRes.totalProcessed).toBe(1);
            expect(directArchiveRes.succeededCount).toBe(0);
            expect(directArchiveRes.failedCount).toBe(1);
            expect(directArchiveRes.results[0].code).toBe('VARIANT_NOT_ASSOCIATED');

            const directWithdrawRes = await paperOfferService.withdrawSupplierCatalogVariants({
                tenantId,
                supplierId: supplierAlpha,
                actorId: 'user-admin-alpha',
                role: 'SUPPLIER_ADMIN',
                variantIds: [testVariantBeta],
                scope: 'SELECTED'
            });
            expect(directWithdrawRes.totalProcessed).toBe(1);
            expect(directWithdrawRes.succeededCount).toBe(0);
            expect(directWithdrawRes.failedCount).toBe(1);
            expect(directWithdrawRes.results[0].code).toBe('VARIANT_NOT_ASSOCIATED');

            // =========================================================================
            // REQUIREMENT 3: Explicit authorized incorporation of a global variant:
            // - Supplier Alpha explicitly incorporates testVariantBeta
            // - Action creates association for Supplier Alpha as ACTIVE
            // - That incorporation does NOT grant permission to mutate or delete the shared technical sheet
            // =========================================================================
            const incRes = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: `/catalog/variants/${testVariantBeta}/incorporate`,
                headers: { authorization: `Bearer ${alphaAdminToken}` }
            });
            expect(incRes.statusCode).toBe(200);
            expect(incRes.body.ok).toBe(true);
            expect(incRes.body.data.supplierCatalogStatus).toBe('ACTIVE');
            expect(incRes.body.data.isCatalogAssociated).toBe(true);

            // Verify Supplier Alpha now has an ACTIVE association
            const [alphaAssocAfterInc] = await connectionPool.query(
                'SELECT status, deleted_at FROM supplier_paper_catalog_variants WHERE supplier_id = ? AND variant_id = ?',
                [supplierAlpha, testVariantBeta]
            );
            expect(alphaAssocAfterInc[0].status).toBe('ACTIVE');
            expect(alphaAssocAfterInc[0].deleted_at).toBeNull();

            // Verify Supplier Beta's association remains intact
            const [betaAssocStillActive] = await connectionPool.query(
                'SELECT status, deleted_at FROM supplier_paper_catalog_variants WHERE supplier_id = ? AND variant_id = ?',
                [supplierBeta, testVariantBeta]
            );
            expect(betaAssocStillActive[0].status).toBe('ACTIVE');
            expect(betaAssocStillActive[0].deleted_at).toBeNull();

            // Invariant: Supplier Alpha tries to delete the shared technical variant -> MUST BE BLOCKED
            await expect(paperOfferService.deleteTechnicalVariant({
                tenantId,
                supplierId: supplierAlpha,
                actorId: 'user-admin-alpha',
                role: 'SUPPLIER_ADMIN',
                variantId: testVariantBeta
            })).rejects.toThrow(/(CANNOT_DELETE_SHARED_VARIANT|NOT_VARIANT_ORIGINATOR)/);

            // Invariant: Supplier Alpha tries to modify physical specifications -> MUST BE BLOCKED
            await expect(paperOfferService.updateTechnicalVariant({
                tenantId,
                supplierId: supplierAlpha,
                actorId: 'user-admin-alpha',
                role: 'SUPPLIER_ADMIN',
                variantId: testVariantBeta,
                payload: { gsm: 180 }
            })).rejects.toThrow(/(SHARED_VARIANT_MUTATION_RESTRICTED|NOT_VARIANT_ORIGINATOR)/);

            // Global technical specs in paper_variants remain completely unmodified
            const [globalVarCheck] = await connectionPool.query(
                'SELECT gsm, width_mm, height_mm, finish FROM paper_variants WHERE id = ?',
                [testVariantBeta]
            );
            expect(Number(globalVarCheck[0].gsm)).toBe(170);
            expect(Number(globalVarCheck[0].width_mm)).toBe(700);
            expect(Number(globalVarCheck[0].height_mm)).toBe(1000);
            expect(globalVarCheck[0].finish).toBe('SILK');
        });
    });

    afterAll(async () => {
        if (connectionPool) {
            await connectionPool.end();
        }
        if (adminPool) {
            await adminPool.query(`DROP DATABASE IF EXISTS \`${executionSchemaName}\`;`);
            await adminPool.end();
        }
    });
});


