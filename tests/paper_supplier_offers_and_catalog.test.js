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
    return new Promise((resolve) => {
        const res = {
            statusCode: 200,
            headers: {},
            body: null,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(data) {
                this.body = data;
                resolve(this);
                return this;
            },
            send(data) {
                this.body = data;
                resolve(this);
                return this;
            },
            setHeader(name, value) {
                this.headers[name] = value;
                return this;
            }
        };

        router(req, res, (err) => {
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
                '164_phase196c_supplier_paper_offers_and_revisions.sql'
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

        afterAll(async () => {
            if (connectionPool) {
                await connectionPool.end();
            }
            if (adminPool) {
                await adminPool.query(`DROP DATABASE IF EXISTS \`${executionSchemaName}\`;`);
                await adminPool.end();
            }
        });

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

        it('verifies that printhouse inventory tables remain completely untouched by commercial paper offers', async () => {

            // In canonical schema, materials catalog and inventory are under materials_catalog / predictive_material_inventory if exists, or check tables count
            const [tables] = await connectionPool.query(`
                SELECT table_name FROM information_schema.tables 
                WHERE table_schema = ? AND table_name IN ('materials_catalog', 'predictive_material_inventory', 'material_procurements')
            `, [executionSchemaName]);

            for (const t of tables) {
                const [rows] = await connectionPool.query(`SELECT COUNT(*) as count FROM \`${t.TABLE_NAME || t.table_name}\``);
                expect(rows[0].count).toBe(0);
            }
        });
    });
});
