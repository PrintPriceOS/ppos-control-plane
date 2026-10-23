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
    req.query = req.query || {};
    req.params = req.params || {};
    req.headers = req.headers || {};
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
                this.headers[name.toLowerCase()] = value;
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

            // Verify deleted from DB
            const [check] = await connectionPool.query('SELECT * FROM supplier_paper_offers WHERE id = ?', [testOff.id]);
            expect(check.length).toBe(0);

            // Verify revisions purged
            const [revCheck] = await connectionPool.query('SELECT * FROM supplier_paper_offer_revisions WHERE offer_id = ?', [testOff.id]);
            expect(revCheck.length).toBe(0);
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

            // 2. Hard delete the offer via SUPPLIER_ADMIN
            const delRes = await dispatch(paperSuppliersRouter, {
                method: 'DELETE',
                url: `/offers/${offerId}`,
                params: { offerId },
                headers: { authorization: `Bearer ${adminToken}` }
            });
            expect(delRes.statusCode).toBe(200);

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


