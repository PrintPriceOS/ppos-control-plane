/**
 * tests/security_paper_supplier_and_materials_isolation.test.js
 * 
 * Acceptance tests for Phase I1 (Paper Supplier Hub & Materials Domain Isolation).
 * Uses real ephemeral MySQL database to verify:
 * 1. Two suppliers (Supplier 1, Supplier 2) and two printhouses (Printhouse A, Printhouse B).
 * 2. Cross-tenant and cross-printhouse reads/mutations denied (HTTP 403).
 * 3. Supplier roles blocked from /api/admin/* and printhouse material operations.
 * 4. Supplier status checks: ACTIVE allowed, SUSPENDED / PENDING_REVIEW rejected with HTTP 403.
 * 5. Concurrent receipt, atomic transactions with row locks, idempotency key replay,
 *    payload fingerprint mismatch rejection (HTTP 409), and over-receipt guard (HTTP 400).
 */
const assert = require('assert');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test_secret_for_supplier_isolation';
const JWT_AUDIENCE = 'ppos:control';
const JWT_ISSUER = 'https://auth.printprice.pro';

process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_AUDIENCE = JWT_AUDIENCE;
process.env.JWT_ISSUER = JWT_ISSUER;
process.env.PAPER_SUPPLIER_HUB_ENABLED = 'true';

const dbConfig = {
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: 'root_password_ppos_2026',
    database: 'ppos_test_ephemeral',
    multipleStatements: true
};

let connectionPool = null;
let mysqlClient = null;
let materialService = null;
let paperSuppliersRouter = null;
let materialsAdminRouter = null;

function generateToken(payload) {
    return jwt.sign({
        sub: payload.id || 'user-1',
        email: payload.email || 'user@test.local',
        role: payload.role,
        tenant_id: payload.tenantId,
        printhouse_id: payload.printhouseId || null,
        supplier_id: payload.supplierId || null,
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

describe('Phase I1 — Paper Supplier & Materials Domain Isolation Suite', () => {
    beforeAll(async () => {
        connectionPool = mysql.createPool(dbConfig);

        // Bootstrap schema
        const schema = `
            CREATE TABLE IF NOT EXISTS tenants (
                id VARCHAR(64) PRIMARY KEY,
                name VARCHAR(128) NOT NULL,
                plan VARCHAR(32) DEFAULT 'growth',
                metadata_json JSON NULL
            ) ENGINE=InnoDB;

            CREATE TABLE IF NOT EXISTS printer_nodes (
                id VARCHAR(64) PRIMARY KEY,
                tenant_id VARCHAR(64) NOT NULL,
                name VARCHAR(128) NOT NULL,
                status VARCHAR(32) DEFAULT 'active'
            ) ENGINE=InnoDB;

            CREATE TABLE IF NOT EXISTS paper_suppliers (
                id VARCHAR(64) PRIMARY KEY,
                tenant_id VARCHAR(64) NOT NULL,
                name VARCHAR(128) NOT NULL,
                status VARCHAR(32) DEFAULT 'ACTIVE',
                metadata_json JSON NULL
            ) ENGINE=InnoDB;

            CREATE TABLE IF NOT EXISTS materials_catalog (
                id VARCHAR(64) PRIMARY KEY,
                tenant_id VARCHAR(64) NOT NULL DEFAULT 'ppos-production',
                printhouse_id VARCHAR(64) NULL,
                material_name VARCHAR(128) NOT NULL,
                material_type VARCHAR(64) NOT NULL,
                substrate_class VARCHAR(64) NULL,
                gsm INT NULL,
                sheet_format VARCHAR(64) NULL,
                finish_type VARCHAR(64) NULL,
                supplier_name VARCHAR(128) NULL,
                supplier_country VARCHAR(64) NULL,
                cost_per_unit DECIMAL(10,4) DEFAULT 0.0000,
                unit_name VARCHAR(32) DEFAULT 'sheets',
                metadata_json JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB;

            CREATE TABLE IF NOT EXISTS predictive_material_inventory (
                id VARCHAR(64) PRIMARY KEY,
                node_id VARCHAR(64) NOT NULL,
                material_catalog_id VARCHAR(64) NULL,
                material_name VARCHAR(128) NOT NULL,
                material_type VARCHAR(64) NOT NULL,
                paper_gsm INT NULL,
                finish VARCHAR(64) NULL,
                current_stock_units INT DEFAULT 0,
                reserved_stock_units INT DEFAULT 0,
                available_units INT DEFAULT 0,
                reorder_point INT DEFAULT 100,
                replenishment_lead_days INT DEFAULT 7,
                shortage_risk VARCHAR(32) DEFAULT 'NONE',
                depletion_forecast_days INT DEFAULT 30,
                operational_status VARCHAR(32) DEFAULT 'STABLE',
                status VARCHAR(32) DEFAULT 'STABLE',
                daily_burn_rate DECIMAL(10,2) DEFAULT 0.00,
                forecasted_depletion_date TIMESTAMP NULL,
                procurement_risk VARCHAR(32) DEFAULT 'LOW',
                supplier_name VARCHAR(128) NULL,
                cost_per_unit DECIMAL(10,4) DEFAULT 0.0000,
                tenant_id VARCHAR(64) NOT NULL DEFAULT 'ppos-production',
                printhouse_id VARCHAR(64) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB;

            CREATE TABLE IF NOT EXISTS material_procurements (
                id VARCHAR(64) PRIMARY KEY,
                material_inventory_id VARCHAR(64) NOT NULL,
                supplier_name VARCHAR(128) NULL,
                ordered_units INT NOT NULL,
                expected_delivery_date TIMESTAMP NULL,
                procurement_status VARCHAR(32) DEFAULT 'ORDERED',
                procurement_risk VARCHAR(32) DEFAULT 'LOW',
                notes TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB;

            CREATE TABLE IF NOT EXISTS material_inventory_events (
                id VARCHAR(64) PRIMARY KEY,
                material_inventory_id VARCHAR(64) NOT NULL,
                event_type VARCHAR(32) NOT NULL,
                quantity_units INT NOT NULL,
                before_stock INT NOT NULL,
                after_stock INT NOT NULL,
                job_id VARCHAR(64) NULL,
                dispatch_id VARCHAR(64) NULL,
                operator_id VARCHAR(64) NULL,
                reason TEXT NULL,
                metadata_json JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB;
        `;
        await connectionPool.query(schema);

        // Seed 2 Printhouses and 2 Suppliers
        await connectionPool.query(`
            DELETE FROM tenants;
            DELETE FROM printer_nodes;
            DELETE FROM paper_suppliers;
            DELETE FROM materials_catalog;
            DELETE FROM predictive_material_inventory;
            DELETE FROM material_procurements;
            DELETE FROM material_inventory_events;

            INSERT INTO tenants (id, name) VALUES 
                ('tenant-print-a', 'Printhouse A Corp'),
                ('tenant-print-b', 'Printhouse B Ltd'),
                ('tenant-supp-1', 'Fedrigoni Distributor 1'),
                ('tenant-supp-2', 'Inapa Paper Supplier 2');

            INSERT INTO printer_nodes (id, tenant_id, name, status) VALUES
                ('node-alpha', 'tenant-print-a', 'Heidelberg XL 106', 'active'),
                ('node-beta', 'tenant-print-b', 'Komori GL 840', 'active');

            INSERT INTO paper_suppliers (id, tenant_id, name, status, metadata_json) VALUES
                ('supp-org-1', 'tenant-supp-1', 'Fedrigoni Iberia', 'ACTIVE', '{"currencies":["EUR"]}'),
                ('supp-org-2', 'tenant-supp-2', 'Inapa España', 'SUSPENDED', '{"currencies":["EUR"]}');
        `);

        // Connect project client to ephemeral database
        mysqlClient = require('../src/api/services/mysqlClient');
        mysqlClient.getPool = () => connectionPool;
        mysqlClient.query = async (sql, params) => {
            const [rows] = await connectionPool.query(sql, params);
            return rows;
        };


        materialService = require('../src/api/services/materialAvailabilityService');
        paperSuppliersRouter = require('../src/api/routes/paperSuppliersRoutes');
        materialsAdminRouter = require('../src/api/routes/materialsAdmin');
    });

    afterAll(async () => {
        if (connectionPool) {
            await connectionPool.query('DROP TABLE IF EXISTS material_inventory_events, material_procurements, predictive_material_inventory, materials_catalog, paper_suppliers, printer_nodes, tenants;');
            await connectionPool.end();
        }
    });

    describe('1. Two Suppliers and Two Printhouses: Multi-Tenant Role Isolation', () => {
        it('allows active Supplier 1 to access /api/v1/paper-suppliers/me', async () => {
            const token = generateToken({
                id: 'user-supp-1',
                role: 'SUPPLIER_ADMIN',
                tenantId: 'tenant-supp-1',
                supplierId: 'supp-org-1'
            });

            const req = {
                method: 'GET',
                url: '/me',
                originalUrl: '/api/v1/paper-suppliers/me',
                headers: { authorization: `Bearer ${token}` }
            };

            const res = await dispatch(paperSuppliersRouter, req);
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.ok, true);
            assert.strictEqual(res.body.data.supplierId, 'supp-org-1');
            assert.strictEqual(res.body.data.name, 'Fedrigoni Iberia');
        });

        it('denies Printhouse A user from accessing Paper Supplier endpoints (HTTP 403)', async () => {
            const token = generateToken({
                id: 'user-print-a',
                role: 'PRINTHOUSE_ADMIN',
                tenantId: 'tenant-print-a',
                printhouseId: 'node-alpha'
            });

            const req = {
                method: 'GET',
                url: '/me',
                originalUrl: '/api/v1/paper-suppliers/me',
                headers: { authorization: `Bearer ${token}` }
            };

            const res = await dispatch(paperSuppliersRouter, req);
            assert.strictEqual(res.statusCode, 403);
            assert.match(res.body.error.message, /requires a Paper Supplier role/);
        });

        it('denies Supplier 1 from accessing Printhouse materials admin endpoints (HTTP 403)', async () => {
            const token = generateToken({
                id: 'user-supp-1',
                role: 'SUPPLIER_ADMIN',
                tenantId: 'tenant-supp-1',
                supplierId: 'supp-org-1'
            });

            const req = {
                method: 'GET',
                url: '/node/node-alpha',
                originalUrl: '/api/admin/materials/node/node-alpha',
                headers: { authorization: `Bearer ${token}` },
                params: { nodeId: 'node-alpha' }
            };

            const res = await dispatch(materialsAdminRouter, req);
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.error, 'FORBIDDEN_SUPPLIER_ACCESS_TO_PRINTHOUSE_MATERIALS');
        });

        it('restricts /api/admin/materials/debug strictly to SUPER_ADMIN', async () => {
            // Printhouse Admin attempt
            const tokenPrinthouse = generateToken({
                id: 'user-print-a',
                role: 'PRINTHOUSE_ADMIN',
                tenantId: 'tenant-print-a'
            });
            const req1 = {
                method: 'GET',
                url: '/debug',
                originalUrl: '/api/admin/materials/debug',
                headers: { authorization: `Bearer ${tokenPrinthouse}` }
            };
            const res1 = await dispatch(materialsAdminRouter, req1);
            assert.strictEqual(res1.statusCode, 403);
            assert.strictEqual(res1.body.error.code, 'FORBIDDEN');

            // Super Admin attempt
            const tokenAdmin = generateToken({
                id: 'admin-1',
                role: 'SUPER_ADMIN',
                email: 'admin@printprice.pro',
                tenantId: 'ppos-production'
            });
            const req2 = {
                method: 'GET',
                url: '/debug',
                originalUrl: '/api/admin/materials/debug',
                headers: { authorization: `Bearer ${tokenAdmin}` }
            };
            const res2 = await dispatch(materialsAdminRouter, req2);
            assert.strictEqual(res2.statusCode, 200);
            assert.strictEqual(res2.body.ok, true);
        });
    });

    describe('2. Cross-Tenant Material Ownership Isolation', () => {
        let matAId = 'mat-print-a-1';
        let matBId = 'mat-print-b-1';

        beforeAll(async () => {
            // Seed materials in Printhouse A and Printhouse B
            await materialService.createMaterial({
                id: matAId,
                material_name: 'Sappi Magno Satin 150g',
                material_type: 'PAPER',
                initial_stock: 10000,
                node_id: 'node-alpha'
            }, 'tenant-print-a', 'node-alpha');

            await materialService.createMaterial({
                id: matBId,
                material_name: 'Fedrigoni Arena Natural 120g',
                material_type: 'PAPER',
                initial_stock: 5000,
                node_id: 'node-beta'
            }, 'tenant-print-b', 'node-beta');
        });

        it('allows Printhouse A to view its own material', async () => {
            const token = generateToken({
                id: 'user-print-a',
                role: 'PRINTHOUSE_ADMIN',
                tenantId: 'tenant-print-a',
                printhouseId: 'node-alpha'
            });

            const req = {
                method: 'GET',
                url: `/${matAId}`,
                originalUrl: `/api/admin/materials/${matAId}`,
                params: { id: matAId },
                headers: { authorization: `Bearer ${token}` }
            };

            const res = await dispatch(materialsAdminRouter, req);
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.ok, true);
            assert.strictEqual(res.body.data.id, matAId);
        });

        it('denies Printhouse A from inspecting or manipulating Printhouse B material (HTTP 403)', async () => {
            const token = generateToken({
                id: 'user-print-a',
                role: 'PRINTHOUSE_ADMIN',
                tenantId: 'tenant-print-a',
                printhouseId: 'node-alpha'
            });

            const req = {
                method: 'GET',
                url: `/${matBId}`,
                originalUrl: `/api/admin/materials/${matBId}`,
                params: { id: matBId },
                headers: { authorization: `Bearer ${token}` }
            };

            const res = await dispatch(materialsAdminRouter, req);
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.code, 'FORBIDDEN_CROSS_TENANT_MATERIAL_ACCESS');
        });
    });

    describe('3. Atomic & Idempotent Receipt in Real Ephemeral MySQL', () => {
        let testMaterialId = 'mat-atomic-1';
        let testProcurementId = 'proc-atomic-100';

        beforeAll(async () => {
            await materialService.createMaterial({
                id: testMaterialId,
                material_name: 'Inapa Explorer 80g',
                material_type: 'PAPER',
                initial_stock: 2000,
                node_id: 'node-alpha'
            }, 'tenant-print-a', 'node-alpha');

            await connectionPool.query(`
                INSERT INTO material_procurements (id, material_inventory_id, supplier_name, ordered_units, procurement_status)
                VALUES (?, ?, 'Fedrigoni Iberia', 5000, 'ORDERED');
            `, [testProcurementId, testMaterialId]);
        });

        it('successfully executes atomic receipt: stock, status and events confirm together', async () => {
            const idempotencyKey = 'ik-test-unique-001';
            const requestBody = { accepted_quantity: 5000, bay: 'Bay-3' };

            const result = await materialService.receiveProcurementAtomic(
                testProcurementId,
                'operator-alice',
                'tenant-print-a',
                'node-alpha',
                false,
                { idempotencyKey, acceptedQuantity: 5000, requestBody }
            );

            assert.strictEqual(result.received, true);
            assert.strictEqual(result.afterStock, 7000); // 2000 initial + 5000 received

            // Verify database row state
            const [procs] = await connectionPool.query('SELECT * FROM material_procurements WHERE id = ?', [testProcurementId]);
            assert.strictEqual(procs[0].procurement_status, 'RECEIVED');

            const [mats] = await connectionPool.query('SELECT current_stock_units FROM predictive_material_inventory WHERE id = ?', [testMaterialId]);
            assert.strictEqual(mats[0].current_stock_units, 7000);

            const [events] = await connectionPool.query('SELECT * FROM material_inventory_events WHERE material_inventory_id = ? AND event_type = "RESTOCK_RECEIVED"', [testMaterialId]);
            assert.strictEqual(events.length, 1);
            assert.strictEqual(events[0].quantity_units, 5000);
            assert.strictEqual(events[0].after_stock, 7000);
        });

        it('replays idempotently without incrementing stock when re-sent with exact same key and payload', async () => {
            const idempotencyKey = 'ik-test-unique-001';
            const requestBody = { accepted_quantity: 5000, bay: 'Bay-3' };

            const replayResult = await materialService.receiveProcurementAtomic(
                testProcurementId,
                'operator-alice',
                'tenant-print-a',
                'node-alpha',
                false,
                { idempotencyKey, acceptedQuantity: 5000, requestBody }
            );

            assert.strictEqual(replayResult.received, true);
            assert.strictEqual(replayResult.idempotentReplay, true);

            // Verify stock did NOT increment again
            const [mats] = await connectionPool.query('SELECT current_stock_units FROM predictive_material_inventory WHERE id = ?', [testMaterialId]);
            assert.strictEqual(mats[0].current_stock_units, 7000);
        });

        it('rejects with HTTP 409 IDEMPOTENCY_PAYLOAD_MISMATCH if same idempotency key is used with altered payload', async () => {
            const idempotencyKey = 'ik-test-unique-001';
            const alteredPayload = { accepted_quantity: 4000, bay: 'Bay-Altered' };

            await assert.rejects(async () => {
                await materialService.receiveProcurementAtomic(
                    testProcurementId,
                    'operator-alice',
                    'tenant-print-a',
                    'node-alpha',
                    false,
                    { idempotencyKey, acceptedQuantity: 4000, requestBody: alteredPayload }
                );
            }, (err) => {
                assert.strictEqual(err.statusCode, 409);
                assert.strictEqual(err.code, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
                return true;
            });
        });

        it('rejects over-receipt exceeding ordered quantity with HTTP 400', async () => {
            const overProcId = 'proc-over-receipt';
            await connectionPool.query(`
                INSERT INTO material_procurements (id, material_inventory_id, supplier_name, ordered_units, procurement_status)
                VALUES (?, ?, 'Fedrigoni Iberia', 1000, 'ORDERED');
            `, [overProcId, testMaterialId]);

            await assert.rejects(async () => {
                await materialService.receiveProcurementAtomic(
                    overProcId,
                    'operator-alice',
                    'tenant-print-a',
                    'node-alpha',
                    false,
                    { idempotencyKey: 'ik-over-01', acceptedQuantity: 1500, requestBody: { accepted_quantity: 1500 } }
                );
            }, (err) => {
                assert.strictEqual(err.statusCode, 400);
                assert.strictEqual(err.code, 'RECEIPT_EXCEEDS_ORDERED_QUANTITY');
                return true;
            });
        });

        it('prevents cross-tenant procurement receipt (HTTP 403)', async () => {
            const foreignProcId = 'proc-foreign-tenant';
            await connectionPool.query(`
                INSERT INTO material_procurements (id, material_inventory_id, supplier_name, ordered_units, procurement_status)
                VALUES (?, ?, 'Fedrigoni Iberia', 1000, 'ORDERED');
            `, [foreignProcId, testMaterialId]);

            await assert.rejects(async () => {
                await materialService.receiveProcurementAtomic(
                    foreignProcId,
                    'operator-bob',
                    'tenant-print-b', // Foreign tenant
                    'node-beta',
                    false,
                    { idempotencyKey: 'ik-cross-01', acceptedQuantity: 1000, requestBody: {} }
                );
            }, (err) => {
                assert.strictEqual(err.statusCode, 403);
                assert.strictEqual(err.message, 'FORBIDDEN_CROSS_TENANT_PROCUREMENT_RECEIPT');
                return true;
            });
        });

        it('handles concurrent receipt requests safely without race condition double increments', async () => {
            const concurrentProcId = 'proc-concurrent-race-1';
            await connectionPool.query(`
                INSERT INTO material_procurements (id, material_inventory_id, supplier_name, ordered_units, procurement_status)
                VALUES (?, ?, 'Fedrigoni Iberia', 3000, 'ORDERED');
            `, [concurrentProcId, testMaterialId]);

            // Attempt two concurrent receives with DIFFERENT idempotency keys
            const promise1 = materialService.receiveProcurementAtomic(
                concurrentProcId,
                'operator-alice',
                'tenant-print-a',
                'node-alpha',
                false,
                { idempotencyKey: 'ik-race-A', acceptedQuantity: 3000, requestBody: {} }
            );

            const promise2 = materialService.receiveProcurementAtomic(
                concurrentProcId,
                'operator-alice',
                'tenant-print-a',
                'node-alpha',
                false,
                { idempotencyKey: 'ik-race-B', acceptedQuantity: 3000, requestBody: {} }
            );

            const results = await Promise.allSettled([promise1, promise2]);
            const fulfilled = results.filter(r => r.status === 'fulfilled');
            const rejected = results.filter(r => r.status === 'rejected');

            // Exactly ONE must succeed and the other must be rejected due to ALREADY_RECEIVED
            assert.strictEqual(fulfilled.length, 1);
            assert.strictEqual(rejected.length, 1);
            assert.strictEqual(rejected[0].reason.statusCode, 409);
            assert.strictEqual(rejected[0].reason.code, 'ALREADY_RECEIVED');
        });
    });

    describe('4. Supplier Role Hierarchy & Suspension Governance', () => {
        it('denies suspended supplier access to supplier hub operations (HTTP 403)', async () => {
            const tokenSuspended = generateToken({
                id: 'user-supp-2',
                role: 'SUPPLIER_ADMIN',
                tenantId: 'tenant-supp-2',
                supplierId: 'supp-org-2'
            });

            const { requireApprovedSupplier } = require('../src/api/middleware/auth');
            const req = {
                method: 'POST',
                url: '/publish',
                headers: { authorization: `Bearer ${tokenSuspended}` },
                user: {
                    id: 'user-supp-2',
                    role: 'SUPPLIER_ADMIN',
                    tenantId: 'tenant-supp-2',
                    supplierId: 'supp-org-2'
                }
            };

            let statusCode = 200;
            let responseBody = null;
            let nextCalled = false;
            const res = {
                status(code) { statusCode = code; return this; },
                json(data) { responseBody = data; return this; }
            };

            await requireApprovedSupplier(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, false);
            assert.strictEqual(statusCode, 403);
            assert.strictEqual(responseBody.error.code, 'SUPPLIER_SUSPENDED');
        });

        it('denies SUPPLIER_VIEWER from executing mutation operations requiring ADMIN or OPERATOR (HTTP 403)', async () => {
            const tokenViewer = generateToken({
                id: 'user-supp-viewer',
                role: 'SUPPLIER_VIEWER',
                tenantId: 'tenant-supp-1',
                supplierId: 'supp-org-1'
            });

            const { requireSupplierScope } = require('../src/api/middleware/auth');
            const req = {
                method: 'POST',
                url: '/publish',
                headers: { authorization: `Bearer ${tokenViewer}` },
                user: {
                    id: 'user-supp-viewer',
                    role: 'SUPPLIER_VIEWER',
                    tenantId: 'tenant-supp-1',
                    supplierId: 'supp-org-1'
                }
            };

            let statusCode = 200;
            let responseBody = null;
            let nextCalled = false;
            const res = {
                status(code) { statusCode = code; return this; },
                json(data) { responseBody = data; return this; }
            };

            const operatorGuard = requireSupplierScope('OPERATOR');
            operatorGuard(req, res, () => { nextCalled = true; });

            assert.strictEqual(nextCalled, false);
            assert.strictEqual(statusCode, 403);
            assert.strictEqual(responseBody.error.code, 'FORBIDDEN');
        });
    });

});
