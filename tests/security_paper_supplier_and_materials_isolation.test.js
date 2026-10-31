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

// 1. ENTORNO DE PRUEBAS: Usa TEST_MYSQL_* estrictamente sin fallback a MYSQL_* ni contraseña incrustada
function getTestDatabaseConfig() {
    return {
        host: process.env.TEST_MYSQL_HOST,
        port: process.env.TEST_MYSQL_PORT ? parseInt(process.env.TEST_MYSQL_PORT, 10) : undefined,
        user: process.env.TEST_MYSQL_USER,
        password: process.env.TEST_MYSQL_PASSWORD
    };
}

function validateTestDatabaseConfig(cfg) {
    if (!cfg || !cfg.host || !cfg.port || !cfg.user || cfg.password === undefined) {
        throw new Error('TEST_CONFIGURATION_UNAUTHORIZED: Missing mandatory TEST_MYSQL_* environment configuration. Fallback to MYSQL_* is prohibited.');
    }
    // Block unauthorized non-localhost / non-docker test host
    const allowedHosts = ['127.0.0.1', 'localhost'];
    if (!allowedHosts.includes(cfg.host)) {
        throw new Error(`TEST_CONFIGURATION_UNAUTHORIZED: Test host ${cfg.host} is not an authorized test target.`);
    }
}

// Generate unique exclusive execution schema name: ppos_test_i1r2_<timestamp>_<random>
const executionRunToken = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const executionSchemaName = `ppos_test_i1r2_${executionRunToken}`;

let connectionPool = null;
let adminPool = null;
let mysqlClient = require('../src/api/services/mysqlClient');
let materialService = require('../src/api/services/materialAvailabilityService');
let paperSuppliersRouter = require('../src/api/routes/paperSuppliersRoutes');
let materialsAdminRouter = require('../src/api/routes/materialsAdmin');
let testFastifyApp = null;

function generateToken(payload) {
    return jwt.sign({
        sub: payload.id || 'user-1',
        email: payload.email || 'user@test.local',
        role: payload.role,
        tenant_id: payload.tenantId,
        printhouse_id: payload.printhouseId || null,
        supplier_id: payload.supplierId || null,
        has_supplier_capability: payload.hasSupplierCapability || false,
        has_printhouse_capability: payload.hasPrinthouseCapability || false,
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
    let isConfiguredRun = true;

    const originalEnv = { ...process.env };

    beforeAll(async () => {
        const testDbConfig = getTestDatabaseConfig();

        // Check if environment variables are provided
        if (!testDbConfig.host || !testDbConfig.port || !testDbConfig.user || testDbConfig.password === undefined) {
            isConfiguredRun = false;
            return;
        }

        // 1. Preflight validation: abort before any DDL/DML if config is not authorized
        validateTestDatabaseConfig(testDbConfig);

        // Close any pre-existing mysqlClient pool to prevent leaked or shared connections
        await mysqlClient.closePool();

        // 2. Connect to MySQL server to create exclusive schema
        adminPool = mysql.createPool({
            host: testDbConfig.host,
            port: testDbConfig.port,
            user: testDbConfig.user,
            password: testDbConfig.password,
            multipleStatements: true
        });

        // Create exclusive execution schema
        await adminPool.query(`CREATE DATABASE IF NOT EXISTS \`${executionSchemaName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);

        // 3. Connect to exclusive execution schema
        connectionPool = mysql.createPool({
            host: testDbConfig.host,
            port: testDbConfig.port,
            user: testDbConfig.user,
            password: testDbConfig.password,
            database: executionSchemaName,
            multipleStatements: true
        });

        // 4. Strict isolation: Eradicate inherited DATABASE_URL so it cannot override TEST_MYSQL_*
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

        // Canonical bootstrap executing strictly through connectionPool bound to exclusive execution schema
        const { runBootstrap } = require('../scripts/bootstrap_canonical_schema');
        await runBootstrap({
            host: testDbConfig.host,
            database: executionSchemaName,
            pool: connectionPool
        });

        // Reconnect mysqlClient and apply migration ledger + phase migrations canonically
        mysqlClient = require('../src/api/services/mysqlClient');
        const ledgerModule = require('../src/migrations/phase184g_migration_ledger_schema');
        await ledgerModule.up(mysqlClient);
        const ledgerGovModule = require('../src/migrations/phase185_migration_ledger_governance_schema');
        await ledgerGovModule.up(mysqlClient);

        // Execute sequential migration suite up to phase 196a (migration 162)
        const fs = require('fs');
        const path = require('path');
        const { parseMigrationSql } = require('../src/api/services/migrationSqlParser');
        const migrationsDir = path.join(__dirname, '../migrations');
        const requiredMigrations = [
            '001_create_schema_version.sql',
            '007_mes_material_orchestration.sql',
            '015_phase76_printhouse_capabilities.sql',
            '139_phase191d_machine_capabilities_migration.sql',
            '140_phase191e_materials_capacity_leadtimes.sql',
            '158_phase195e_auth_sessions_and_mfa.sql',
            '162_phase196a_paper_suppliers_and_procurement_idempotency.sql'
        ];

        for (const file of requiredMigrations) {
            const filePath = path.join(migrationsDir, file);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                const parsed = parseMigrationSql(content);
                for (const stmt of parsed.statements) {
                    await connectionPool.query(stmt.sql);
                }
            }
        }
        // Clean & seed 2 Printhouses and 2 Suppliers + capabilities
        await connectionPool.query(`
            DELETE FROM procurement_receipt_records;
            DELETE FROM supplier_memberships;
            DELETE FROM tenant_capabilities;
            DELETE FROM user_sessions;
            DELETE FROM material_inventory_events;
            DELETE FROM material_procurements;
            DELETE FROM predictive_material_inventory;
            DELETE FROM materials_catalog;
            DELETE FROM paper_suppliers;
            DELETE FROM printer_nodes;
            DELETE FROM tenants;

            INSERT INTO tenants (id, name) VALUES 
                ('tenant-print-a', 'Printhouse A Corp'),
                ('tenant-print-b', 'Printhouse B Ltd'),
                ('tenant-supp-1', 'Fedrigoni Distributor 1'),
                ('tenant-supp-2', 'Inapa Paper Supplier 2'),
                ('tenant-dual-org', 'Dual Print and Paper Co');

            INSERT INTO printer_nodes (id, tenant_id, name, status, email) VALUES
                ('node-alpha', 'tenant-print-a', 'Heidelberg XL 106', 'active', 'node-alpha@print-a.local'),
                ('node-beta', 'tenant-print-b', 'Komori GL 840', 'active', 'node-beta@print-b.local'),
                ('node-dual-1', 'tenant-dual-org', 'Dual Factory Press', 'active', 'node-dual-1@dual.local');

            INSERT INTO paper_suppliers (id, tenant_id, name, status, contact_email, currencies_json) VALUES
                ('supp-org-1', 'tenant-supp-1', 'Fedrigoni Iberia', 'ACTIVE', 'orders@fedrigoni.local', '["EUR"]'),
                ('supp-org-2', 'tenant-supp-2', 'Inapa España', 'SUSPENDED', 'ops@inapa.local', '["EUR"]'),
                ('supp-org-dual', 'tenant-dual-org', 'Dual Paper Supply Arm', 'ACTIVE', 'supply@dual.local', '["EUR", "USD"]');

            INSERT INTO tenant_capabilities (id, tenant_id, capability, is_active) VALUES
                ('cap-1', 'tenant-print-a', 'PRINTHOUSE', 1),
                ('cap-2', 'tenant-supp-1', 'PAPER_SUPPLIER', 1),
                ('cap-3', 'tenant-dual-org', 'PRINTHOUSE', 1),
                ('cap-4', 'tenant-dual-org', 'PAPER_SUPPLIER', 1),
                ('cap-5', 'tenant-supp-2', 'PAPER_SUPPLIER', 1);

            INSERT INTO supplier_memberships (id, user_id, tenant_id, supplier_id, supplier_role, is_active) VALUES
                ('mem-1', 'user-supp-1', 'tenant-supp-1', 'supp-org-1', 'SUPPLIER_ADMIN', 1),
                ('mem-2', 'user-dual-admin', 'tenant-dual-org', 'supp-org-dual', 'SUPPLIER_ADMIN', 1),
                ('mem-3', 'user-supp-2', 'tenant-supp-2', 'supp-org-2', 'SUPPLIER_ADMIN', 1),
                ('mem-4', 'user-supp-viewer', 'tenant-supp-1', 'supp-org-1', 'SUPPLIER_VIEWER', 1);
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
    }, 30000);

    afterAll(async () => {
        try {
            // Strict cleanup: Drop ONLY the exclusive execution schema verified to belong to this run
            if (connectionPool) {
                await connectionPool.end();
            }
            if (adminPool) {
                // Verify schema name belongs strictly to this run before dropping
                if (executionSchemaName.startsWith('ppos_test_i1r2_') && executionSchemaName.includes(executionRunToken)) {
                    await adminPool.query(`DROP DATABASE IF EXISTS \`${executionSchemaName}\`;`);
                }
                await adminPool.end();
            }
            if (mysqlClient && mysqlClient.closePool) {
                await mysqlClient.closePool();
            }
        } finally {
            // Point 4: Restore environment variables and pool state in finally
            for (const key of Object.keys(process.env)) {
                if (!(key in originalEnv)) {
                    delete process.env[key];
                }
            }
            for (const [key, value] of Object.entries(originalEnv)) {
                process.env[key] = value;
            }
        }
    });

    beforeEach((ctx) => {
        if (!isConfiguredRun) {
            ctx.skip();
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

        it('verifies blocking of supplier actor across the real admin router chain for materials, machines, and tenant management', async () => {
            const tokenSupplier = generateToken({
                id: 'user-supp-1',
                role: 'SUPPLIER_ADMIN',
                tenantId: 'tenant-supp-1',
                supplierId: 'supp-org-1'
            });

            // 1. Printhouse materials router: /node/:nodeId blocks supplier actor
            const reqMaterials = {
                method: 'GET',
                url: '/node/node-alpha',
                originalUrl: '/api/admin/materials/node/node-alpha',
                headers: { authorization: `Bearer ${tokenSupplier}` },
                params: { nodeId: 'node-alpha' }
            };
            const resMaterials = await dispatch(materialsAdminRouter, reqMaterials);
            assert.strictEqual(resMaterials.statusCode, 403);
            assert.strictEqual(resMaterials.body.error, 'FORBIDDEN_SUPPLIER_ACCESS_TO_PRINTHOUSE_MATERIALS');

            // 2. Printhouse publication endpoint: requireRole('TENANT_ADMIN') blocks supplier actor
            const { requireRole } = require('../src/api/middleware/auth');
            const tenantAdminGuard = requireRole('TENANT_ADMIN');
            let guardPassed = false;
            let guardStatusCode = 200;
            let guardBody = null;
            const reqGuard = {
                user: {
                    id: 'user-supp-1',
                    role: 'SUPPLIER_ADMIN',
                    tenantId: 'tenant-supp-1',
                    supplierId: 'supp-org-1'
                }
            };
            const resGuard = {
                status(code) { guardStatusCode = code; return this; },
                json(data) { guardBody = data; return this; }
            };
            tenantAdminGuard(reqGuard, resGuard, () => { guardPassed = true; });
            assert.strictEqual(guardPassed, false);
            assert.strictEqual(guardStatusCode, 403);
            assert.strictEqual(guardBody.error.code, 'FORBIDDEN');

            // 3. Admin router global routes protection middleware blocks supplier actor from global routes (/tenants/:id)
            const { resolveActorContext } = require('../src/api/middleware/auth');
            const actorContext = resolveActorContext(reqGuard);
            assert.strictEqual(actorContext.isSuperAdmin, false);
            assert.strictEqual(['OPS_ADMIN', 'SYSTEM_ADMIN'].includes(actorContext.role), false);
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
            if (!isConfiguredRun) return;
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
            if (!isConfiguredRun) return;
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

        it('handles concurrent receipt requests through real HTTP router endpoint safely', async () => {
            const endpointProcId = 'proc-endpoint-race-1';
            await connectionPool.query(`
                INSERT INTO material_procurements (id, material_inventory_id, supplier_name, ordered_units, procurement_status)
                VALUES (?, ?, 'Fedrigoni Iberia', 2000, 'ORDERED');
            `, [endpointProcId, testMaterialId]);

            const token = generateToken({
                id: 'operator-alice',
                role: 'PRINTHOUSE_ADMIN',
                tenantId: 'tenant-print-a',
                printhouseId: 'node-alpha'
            });

            const makeReq = (idempotencyKey) => ({
                method: 'POST',
                url: `/procurements/${endpointProcId}/receive`,
                originalUrl: `/api/admin/materials/procurements/${endpointProcId}/receive`,
                params: { id: endpointProcId },
                headers: {
                    authorization: `Bearer ${token}`,
                    'idempotency-key': idempotencyKey
                },
                body: { accepted_quantity: 2000 }
            });

            const [res1, res2] = await Promise.all([
                dispatch(materialsAdminRouter, makeReq('ik-endpoint-race-1')),
                dispatch(materialsAdminRouter, makeReq('ik-endpoint-race-2'))
            ]);

            const statuses = [res1.statusCode, res2.statusCode].sort();
            // Exactly one 200 OK and one 409 Conflict
            assert.deepStrictEqual(statuses, [200, 409]);
            const conflictRes = res1.statusCode === 409 ? res1 : res2;
            assert.strictEqual(conflictRes.body.code, 'ALREADY_RECEIVED');
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

        it('allows suspended supplier to query their limited account status via GET /status while blocking operations', async () => {
            const tokenSuspended = generateToken({
                id: 'user-supp-2',
                role: 'SUPPLIER_ADMIN',
                tenantId: 'tenant-supp-2',
                supplierId: 'supp-org-2'
            });

            // 1. Operational endpoint /me is blocked
            const reqMe = {
                method: 'GET',
                url: '/me',
                originalUrl: '/api/v1/paper-suppliers/me',
                headers: { authorization: `Bearer ${tokenSuspended}` }
            };
            const resMe = await dispatch(paperSuppliersRouter, reqMe);
            assert.strictEqual(resMe.statusCode, 403);
            assert.strictEqual(resMe.body.error.code, 'SUPPLIER_SUSPENDED');

            // 2. Explicit diagnostic endpoint /status is permitted with isSuspended: true
            const reqStatus = {
                method: 'GET',
                url: '/status',
                originalUrl: '/api/v1/paper-suppliers/status',
                headers: { authorization: `Bearer ${tokenSuspended}` }
            };
            const resStatus = await dispatch(paperSuppliersRouter, reqStatus);
            assert.strictEqual(resStatus.statusCode, 200);
            assert.strictEqual(resStatus.body.ok, true);
            assert.strictEqual(resStatus.body.actor.supplierStatus, 'SUSPENDED');
            assert.strictEqual(resStatus.body.actor.isSuspended, true);
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
            await operatorGuard(req, res, () => { nextCalled = true; });

            assert.strictEqual(nextCalled, false);
            assert.strictEqual(statusCode, 403);
            assert.strictEqual(responseBody.error.code, 'FORBIDDEN');
        });

        it('denies unknown supplier capability fail-closed with FORBIDDEN_UNKNOWN_CAPABILITY (HTTP 403)', async () => {
            const tokenAdmin = generateToken({
                id: 'user-supp-1',
                role: 'SUPPLIER_ADMIN',
                tenantId: 'tenant-supp-1',
                supplierId: 'supp-org-1'
            });

            const { requireSupplierScope } = require('../src/api/middleware/auth');
            const req = {
                method: 'POST',
                url: '/admin-action',
                headers: { authorization: `Bearer ${tokenAdmin}` },
                user: {
                    id: 'user-supp-1',
                    role: 'SUPPLIER_ADMIN',
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

            const invalidGuard = requireSupplierScope('ROOT_POWER'); // Unknown capability
            invalidGuard(req, res, () => { nextCalled = true; });

            assert.strictEqual(nextCalled, false);
            assert.strictEqual(statusCode, 403);
            assert.strictEqual(responseBody.error.code, 'FORBIDDEN_UNKNOWN_CAPABILITY');
        });

        it('denies access when supplier organization does not exist in database (HTTP 403, no fallback)', async () => {
            const tokenGhost = generateToken({
                id: 'user-ghost-supp',
                role: 'SUPPLIER_ADMIN',
                tenantId: 'tenant-supp-ghost',
                supplierId: 'supp-non-existent-999'
            });

            const { requireApprovedSupplier } = require('../src/api/middleware/auth');
            const req = {
                method: 'GET',
                url: '/catalog',
                headers: { authorization: `Bearer ${tokenGhost}` },
                user: {
                    id: 'user-ghost-supp',
                    role: 'SUPPLIER_ADMIN',
                    tenantId: 'tenant-supp-ghost',
                    supplierId: 'supp-non-existent-999'
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
            assert.strictEqual(responseBody.error.code, 'SUPPLIER_NOT_FOUND');
        });
    });

    describe('5. Header Spoofing & Dual-Capacity Session Validation', () => {
        it('ignores client X-Supplier-Id header attempting to hijack another supplier', async () => {
            // User belongs to supp-org-1, sends header X-Supplier-Id: supp-org-2
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
                headers: { 
                    authorization: `Bearer ${token}`,
                    'x-supplier-id': 'supp-org-2' // Spoof attempt
                }
            };

            const res = await dispatch(paperSuppliersRouter, req);
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.ok, true);
            // Server MUST resolve to supp-org-1 from validated token/session, NOT supp-org-2 from header
            assert.strictEqual(res.body.data.supplierId, 'supp-org-1');
            assert.strictEqual(res.body.data.name, 'Fedrigoni Iberia');
        });

        it('supports dual-capacity user switching context safely via validated capabilities', async () => {
            // User from tenant-dual-org has BOTH Printhouse and Supplier capabilities
            const tokenDual = generateToken({
                id: 'user-dual-admin',
                role: 'PRINTHOUSE_ADMIN',
                tenantId: 'tenant-dual-org',
                printhouseId: 'node-dual-1',
                supplierId: 'supp-org-dual',
                hasSupplierCapability: true,
                hasPrinthouseCapability: true
            });

            // 1. Dual user accesses Materials Admin in Printhouse context
            const reqPrint = {
                method: 'GET',
                url: '/node/node-dual-1',
                originalUrl: '/api/admin/materials/node/node-dual-1',
                headers: { 
                    authorization: `Bearer ${tokenDual}`,
                    'x-active-context': 'printhouse'
                },
                params: { nodeId: 'node-dual-1' }
            };
            const resPrint = await dispatch(materialsAdminRouter, reqPrint);
            assert.strictEqual(resPrint.statusCode, 200);

            // 2. Dual user accesses Paper Supplier Hub requesting supplier context
            const reqSupp = {
                method: 'GET',
                url: '/me',
                originalUrl: '/api/v1/paper-suppliers/me',
                headers: { 
                    authorization: `Bearer ${tokenDual}`,
                    'x-active-context': 'supplier'
                }
            };
            const resSupp = await dispatch(paperSuppliersRouter, reqSupp);
            assert.strictEqual(resSupp.statusCode, 200);
            assert.strictEqual(resSupp.body.ok, true);
            assert.strictEqual(resSupp.body.data.supplierId, 'supp-org-dual');
        });

        it('denies printhouse-only user from selecting supplier context via X-Active-Context header', async () => {
            const tokenPrintOnly = generateToken({
                id: 'user-print-a',
                role: 'PRINTHOUSE_ADMIN',
                tenantId: 'tenant-print-a',
                printhouseId: 'node-alpha',
                hasSupplierCapability: false
            });

            const req = {
                method: 'GET',
                url: '/me',
                originalUrl: '/api/v1/paper-suppliers/me',
                headers: { 
                    authorization: `Bearer ${tokenPrintOnly}`,
                    'x-active-context': 'supplier' // Unauthorized request to switch
                }
            };

            const res = await dispatch(paperSuppliersRouter, req);
            assert.strictEqual(res.statusCode, 403);
            assert.match(res.body.error.message, /requires a Paper Supplier role/);
        });
    });

    describe('6. Printhouse Materials Security: Write Permissions, Legacy Routes & Center Isolation', () => {
        let centerMaterialA = 'mat-center-a-1';
        let centerMaterialB = 'mat-center-b-1';

        beforeAll(async () => {
            if (!isConfiguredRun) return;
            // Setup two distinct centers (printer nodes) inside the SAME tenant (tenant-print-a)
            await connectionPool.query(`
                INSERT INTO printer_nodes (id, tenant_id, name, status, email) VALUES
                    ('node-center-alpha', 'tenant-print-a', 'Center Alpha Press', 'active', 'node-center-alpha@print-a.local'),
                    ('node-center-gamma', 'tenant-print-a', 'Center Gamma Press', 'active', 'node-center-gamma@print-a.local');
            `);

            await materialService.createMaterial({
                id: centerMaterialA,
                material_name: 'Center Alpha Paper 100g',
                material_type: 'PAPER',
                initial_stock: 1000,
                node_id: 'node-center-alpha'
            }, 'tenant-print-a', 'node-center-alpha');

            await materialService.createMaterial({
                id: centerMaterialB,
                material_name: 'Center Gamma Paper 100g',
                material_type: 'PAPER',
                initial_stock: 1000,
                node_id: 'node-center-gamma'
            }, 'tenant-print-a', 'node-center-gamma');
        });

        it('rejects read-only VIEWER role on material creation and mutations (HTTP 403)', async () => {
            const tokenViewer = generateToken({
                id: 'user-viewer-a',
                role: 'VIEWER',
                tenantId: 'tenant-print-a',
                printhouseId: 'node-center-alpha'
            });

            // Attempt to create material
            const reqCreate = {
                method: 'POST',
                url: '/',
                originalUrl: '/api/admin/materials',
                headers: { authorization: `Bearer ${tokenViewer}` },
                body: {
                    material_name: 'Unauthorized Sheet',
                    material_type: 'PAPER',
                    node_id: 'node-center-alpha'
                }
            };
            const resCreate = await dispatch(materialsAdminRouter, reqCreate);
            assert.strictEqual(resCreate.statusCode, 403);
            assert.strictEqual(resCreate.body.code, 'FORBIDDEN_WRITE_PERMISSION_REQUIRED');

            // Attempt to adjust stock
            const reqAdjust = {
                method: 'POST',
                url: `/${centerMaterialA}/adjust`,
                originalUrl: `/api/admin/materials/${centerMaterialA}/adjust`,
                headers: { authorization: `Bearer ${tokenViewer}` },
                params: { id: centerMaterialA },
                body: { quantity_delta: 500, reason: 'unauthorized audit' }
            };
            const resAdjust = await dispatch(materialsAdminRouter, reqAdjust);
            assert.strictEqual(resAdjust.statusCode, 403);
            assert.strictEqual(resAdjust.body.code, 'FORBIDDEN_WRITE_PERMISSION_REQUIRED');
        });

        it('protects legacy /reserve and /release endpoints with node ownership and write permissions', async () => {
            const tokenAdmin = generateToken({
                id: 'user-admin-a',
                role: 'PRINTHOUSE_ADMIN',
                tenantId: 'tenant-print-a',
                printhouseId: 'node-center-alpha'
            });

            // 1. Reserve on owned node succeeds
            const reqReserve = {
                method: 'POST',
                url: '/reserve',
                originalUrl: '/api/admin/materials/reserve',
                headers: { authorization: `Bearer ${tokenAdmin}` },
                body: {
                    dispatch_id: 'disp-leg-01',
                    node_id: 'node-center-alpha',
                    specs: { material_id: centerMaterialA, units: 100 }
                }
            };
            const resReserve = await dispatch(materialsAdminRouter, reqReserve);
            assert.strictEqual(resReserve.statusCode, 200);

            // 2. Reserve targeting a node of a DIFFERENT tenant fails closed (HTTP 403)
            const reqForeignReserve = {
                method: 'POST',
                url: '/reserve',
                originalUrl: '/api/admin/materials/reserve',
                headers: { authorization: `Bearer ${tokenAdmin}` },
                body: {
                    dispatch_id: 'disp-leg-02',
                    node_id: 'node-beta', // Belongs to tenant-print-b!
                    specs: { material_id: centerMaterialA, units: 100 }
                }
            };
            const resForeignReserve = await dispatch(materialsAdminRouter, reqForeignReserve);
            assert.strictEqual(resForeignReserve.statusCode, 403);
            assert.strictEqual(resForeignReserve.body.code, 'FORBIDDEN_CROSS_TENANT_NODE_ACCESS');
        });

        it('prevents center cross-receipt within same tenant when printhouseId is restricted', async () => {
            const procCenterId = 'proc-center-gamma-100';
            await connectionPool.query(`
                INSERT INTO material_procurements (id, material_inventory_id, supplier_name, ordered_units, procurement_status)
                VALUES (?, ?, 'Fedrigoni Iberia', 500, 'ORDERED');
            `, [procCenterId, centerMaterialB]);

            // Attempt receipt from node-center-alpha for a material dedicated to node-center-gamma
            await assert.rejects(async () => {
                await materialService.receiveProcurementAtomic(
                    procCenterId,
                    'operator-alpha',
                    'tenant-print-a',
                    'node-center-alpha', // Cross-center attempt!
                    false,
                    { idempotencyKey: 'ik-center-iso-1', acceptedQuantity: 500, requestBody: {} }
                );
            }, (err) => {
                assert.strictEqual(err.statusCode, 403);
                assert.strictEqual(err.code, 'FORBIDDEN_CROSS_PRINTHOUSE_PROCUREMENT_RECEIPT');
                return true;
            });
        });
    });

    describe('7. Transaction Integrity & Rollback Verification', () => {
        it('rolls back document status, stock increment, and event ledger when an error occurs before commit', async () => {
            const rollbackMatId = 'mat-rollback-test';
            const rollbackProcId = 'proc-rollback-test';

            await materialService.createMaterial({
                id: rollbackMatId,
                material_name: 'Rollback Paper 300g',
                material_type: 'PAPER',
                initial_stock: 1000,
                node_id: 'node-alpha'
            }, 'tenant-print-a', 'node-alpha');

            await connectionPool.query(`
                INSERT INTO material_procurements (id, material_inventory_id, supplier_name, ordered_units, procurement_status)
                VALUES (?, ?, 'Fedrigoni Iberia', 1000, 'ORDERED');
            `, [rollbackProcId, rollbackMatId]);

            // We simulate a transactional crash by monkey-patching connection.commit once
            const pool = mysqlClient.getPool();
            const originalGetConnection = pool.getConnection.bind(pool);

            pool.getConnection = async function() {
                const conn = await originalGetConnection();
                const origCommit = conn.commit.bind(conn);
                conn.commit = async function() {
                    // Intentionally throw error after DB updates, right at commit point
                    throw new Error('SIMULATED_TRANSACTION_CRASH_BEFORE_COMMIT');
                };
                return conn;
            };

            let caughtError = null;
            try {
                await materialService.receiveProcurementAtomic(
                    rollbackProcId,
                    'operator-rollback',
                    'tenant-print-a',
                    'node-alpha',
                    false,
                    { idempotencyKey: 'ik-rollback-01', acceptedQuantity: 1000, requestBody: {} }
                );
            } catch (err) {
                caughtError = err;
            } finally {
                // Restore original getConnection
                pool.getConnection = originalGetConnection;
            }

            assert.ok(caughtError);
            assert.strictEqual(caughtError.message, 'SIMULATED_TRANSACTION_CRASH_BEFORE_COMMIT');

            // VERIFY ROLLBACK:
            // 1. Procurement status MUST remain ORDERED (not RECEIVED)
            const [procs] = await connectionPool.query('SELECT procurement_status FROM material_procurements WHERE id = ?', [rollbackProcId]);
            assert.strictEqual(procs[0].procurement_status, 'ORDERED');

            // 2. Stock units MUST remain 1000 (not 2000)
            const [mats] = await connectionPool.query('SELECT current_stock_units FROM predictive_material_inventory WHERE id = ?', [rollbackMatId]);
            assert.strictEqual(mats[0].current_stock_units, 1000);

            // 3. Inventory event ledger MUST NOT contain any RESTOCK_RECEIVED event for this procurement
            const [events] = await connectionPool.query('SELECT * FROM material_inventory_events WHERE material_inventory_id = ? AND event_type = "RESTOCK_RECEIVED"', [rollbackMatId]);
            assert.strictEqual(events.length, 0);

            // 4. Persistent idempotency record MUST NOT exist
            const [records] = await connectionPool.query('SELECT * FROM procurement_receipt_records WHERE procurement_id = ?', [rollbackProcId]);
            assert.strictEqual(records.length, 0);
        });
    });

    describe('8. Session Revocation & Feature Flag Strict Enforcement', () => {
        it('rejects access when JWT session has been revoked in user_sessions (HTTP 401)', async () => {
            const sessionId = 'sess-revoked-001';
            const userId = 'user-supp-revoked';
            const tenantId = 'tenant-supp-1';

            // Insert revoked session into user_sessions
            await connectionPool.query(`
                INSERT INTO user_sessions (id, user_id, tenant_id, role, status, last_activity_at, expires_at, revoked_at, revoked_reason)
                VALUES (?, ?, ?, 'SUPPLIER_ADMIN', 'REVOKED', NOW(), DATE_ADD(NOW(), INTERVAL 1 HOUR), NOW(), 'Security compliance revocation');
            `, [sessionId, userId, tenantId]);

            const token = generateToken({
                id: userId,
                jti: sessionId,
                role: 'SUPPLIER_ADMIN',
                tenantId: tenantId,
                supplierId: 'supp-org-1'
            });

            const req = {
                method: 'GET',
                url: '/me',
                originalUrl: '/api/v1/paper-suppliers/me',
                headers: { authorization: `Bearer ${token}` }
            };

            const res = await dispatch(paperSuppliersRouter, req);
            assert.strictEqual(res.statusCode, 401);
            assert.strictEqual(res.body.ok, false);
            assert.match(res.body.error.message, /Session has been revoked on the server/);
        });

        it('denies all access with HTTP 403 FEATURE_DISABLED when PAPER_SUPPLIER_HUB_ENABLED is false', async () => {
            const originalFlag = process.env.PAPER_SUPPLIER_HUB_ENABLED;
            process.env.PAPER_SUPPLIER_HUB_ENABLED = 'false';

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

            let res = null;
            try {
                res = await dispatch(paperSuppliersRouter, req);
            } finally {
                process.env.PAPER_SUPPLIER_HUB_ENABLED = originalFlag;
            }

            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.error.code, 'FEATURE_DISABLED');
        });
    });

    describe('9. Point 1 — Test Environment Hardening & Preflight Config Abort', () => {
        it('aborts immediately before any DDL/DML when test configuration is unauthorized or missing', () => {
            // Missing host / port / user / password
            assert.throws(() => {
                validateTestDatabaseConfig(null);
            }, /TEST_CONFIGURATION_UNAUTHORIZED/);

            assert.throws(() => {
                validateTestDatabaseConfig({ host: '127.0.0.1', port: 3306, user: 'root' }); // missing password
            }, /TEST_CONFIGURATION_UNAUTHORIZED/);

            // Unauthorized remote host (prohibits remote production / external db)
            assert.throws(() => {
                validateTestDatabaseConfig({
                    host: 'db.production.printprice.pro',
                    port: 3306,
                    user: 'root',
                    password: 'secret'
                });
            }, /is not an authorized test target/);
        });

        it('aborts before any DDL when DATABASE_URL conflicts with exclusive test schema without emitting DDL/DML to foreign target', async () => {
            const { runBootstrap } = require('../scripts/bootstrap_canonical_schema');

            const foreignQueries = [];
            // Mock connection pool pointing to a conflicting or shared database
            const mockForeignPool = {
                query: async (sql) => {
                    foreignQueries.push(sql);
                    if (sql.includes('SELECT DATABASE()')) {
                        return [[{ current_db: 'shared_test_schema' }]];
                    }
                    return [[]];
                }
            };

            const targetExclusiveSchema = 'ppos_test_i1r2_exclusive_target';

            // Attempt to run bootstrap with target exclusive schema but connected to foreign pool
            await assert.rejects(async () => {
                await runBootstrap({
                    host: '127.0.0.1',
                    database: targetExclusiveSchema,
                    pool: mockForeignPool
                });
            }, (err) => {
                assert.match(err.message, /SAFETY ABORT: Target database mismatch before first DDL/);
                assert.match(err.message, /Expected exclusive schema 'ppos_test_i1r2_exclusive_target'/);
                assert.match(err.message, /connected pool is pointing to 'shared_test_schema'/);
                return true;
            });

            // Zero DDL (CREATE, ALTER, DROP) or DML (INSERT, UPDATE, DELETE) must have been emitted to the foreign target!
            const mutatingQueries = foreignQueries.filter(q =>
                /^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(q)
            );
            assert.strictEqual(mutatingQueries.length, 0, `Expected 0 mutations against foreign pool, but found: ${mutatingQueries.join('; ')}`);
            assert.strictEqual(foreignQueries.length, 1, 'Only SELECT DATABASE() safety check should have been issued');
        });
    });

    describe('10. Point 2 — Joint Tenant, Center, Node & Material Validation (Bypass Guard)', () => {
        let ownNode = 'node-center-alpha';
        let ownMat = 'mat-center-a-1';
        let otherTenantMat = 'mat-print-b-1';
        let otherCenterMat = 'mat-center-b-1';

        it('rejects reservation with own node + material of another tenant, leaving stock and events intact', async () => {
            const token = generateToken({
                id: 'user-admin-a',
                role: 'PRINTHOUSE_ADMIN',
                tenantId: 'tenant-print-a',
                printhouseId: ownNode
            });

            // Read stock, reservation, and event counts before attempt
            const [stockBefore] = await connectionPool.query('SELECT current_stock_units, reserved_stock_units FROM predictive_material_inventory WHERE id = ?', [otherTenantMat]);
            const [eventsBefore] = await connectionPool.query('SELECT COUNT(*) AS total FROM material_inventory_events WHERE material_inventory_id = ?', [otherTenantMat]);
            const [reservationsBefore] = await connectionPool.query('SELECT COUNT(*) AS total FROM manufacturing_material_reservations');

            const req = {
                method: 'POST',
                url: '/reserve',
                originalUrl: '/api/admin/materials/reserve',
                headers: { authorization: `Bearer ${token}` },
                body: {
                    dispatch_id: 'disp-bypass-attempt-1',
                    node_id: ownNode,
                    specs: { material_id: otherTenantMat, units: 100 }
                }
            };

            const res = await dispatch(materialsAdminRouter, req);
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.code, 'FORBIDDEN_CROSS_TENANT_MATERIAL_ACCESS');

            // Verify 100% invariance
            const [stockAfter] = await connectionPool.query('SELECT current_stock_units, reserved_stock_units FROM predictive_material_inventory WHERE id = ?', [otherTenantMat]);
            assert.deepStrictEqual(stockAfter, stockBefore);

            const [eventsAfter] = await connectionPool.query('SELECT COUNT(*) AS total FROM material_inventory_events WHERE material_inventory_id = ?', [otherTenantMat]);
            assert.strictEqual(eventsAfter[0].total, eventsBefore[0].total);

            const [reservationsAfter] = await connectionPool.query('SELECT COUNT(*) AS total FROM manufacturing_material_reservations');
            assert.strictEqual(reservationsAfter[0].total, reservationsBefore[0].total);
        });

        it('rejects reservation with own node + material of another center of the SAME tenant, leaving state intact', async () => {
            const token = generateToken({
                id: 'user-admin-a',
                role: 'PRINTHOUSE_ADMIN',
                tenantId: 'tenant-print-a',
                printhouseId: ownNode
            });

            const [stockBefore] = await connectionPool.query('SELECT current_stock_units, reserved_stock_units FROM predictive_material_inventory WHERE id = ?', [otherCenterMat]);
            const [eventsBefore] = await connectionPool.query('SELECT COUNT(*) AS total FROM material_inventory_events WHERE material_inventory_id = ?', [otherCenterMat]);

            const req = {
                method: 'POST',
                url: '/reserve',
                originalUrl: '/api/admin/materials/reserve',
                headers: { authorization: `Bearer ${token}` },
                body: {
                    dispatch_id: 'disp-bypass-attempt-2',
                    node_id: ownNode,
                    specs: { material_id: otherCenterMat, units: 50 }
                }
            };

            const res = await dispatch(materialsAdminRouter, req);
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.code, 'FORBIDDEN_CROSS_CENTER_MATERIAL_ACCESS');

            // Verify invariance
            const [stockAfter] = await connectionPool.query('SELECT current_stock_units, reserved_stock_units FROM predictive_material_inventory WHERE id = ?', [otherCenterMat]);
            assert.deepStrictEqual(stockAfter, stockBefore);

            const [eventsAfter] = await connectionPool.query('SELECT COUNT(*) AS total FROM material_inventory_events WHERE material_inventory_id = ?', [otherCenterMat]);
            assert.strictEqual(eventsAfter[0].total, eventsBefore[0].total);
        });

        it('rejects release with own node + material of another tenant or center, leaving state intact', async () => {
            const token = generateToken({
                id: 'user-admin-a',
                role: 'PRINTHOUSE_ADMIN',
                tenantId: 'tenant-print-a',
                printhouseId: ownNode
            });

            // 1. Cross-tenant release attempt
            const reqCrossTenant = {
                method: 'POST',
                url: '/release',
                originalUrl: '/api/admin/materials/release',
                headers: { authorization: `Bearer ${token}` },
                body: {
                    dispatch_id: 'disp-rel-cross-1',
                    node_id: ownNode,
                    specs: { material_id: otherTenantMat, units: 10 }
                }
            };
            const resCrossTenant = await dispatch(materialsAdminRouter, reqCrossTenant);
            assert.strictEqual(resCrossTenant.statusCode, 403);
            assert.strictEqual(resCrossTenant.body.code, 'FORBIDDEN_CROSS_TENANT_MATERIAL_ACCESS');

            // 2. Cross-center release attempt
            const reqCrossCenter = {
                method: 'POST',
                url: '/release',
                originalUrl: '/api/admin/materials/release',
                headers: { authorization: `Bearer ${token}` },
                body: {
                    dispatch_id: 'disp-rel-cross-2',
                    node_id: ownNode,
                    specs: { material_id: otherCenterMat, units: 10 }
                }
            };
            const resCrossCenter = await dispatch(materialsAdminRouter, reqCrossCenter);
            assert.strictEqual(resCrossCenter.statusCode, 403);
            assert.strictEqual(resCrossCenter.body.code, 'FORBIDDEN_CROSS_CENTER_MATERIAL_ACCESS');
        });
    });

    describe('11. Point 3 — Real Supplier Memberships & Dynamic Role Resolution', () => {
        it('resolves supplier role from database membership and immediately reflects membership deactivation on active JWT', async () => {
            const dynamicUserId = 'user-dyn-supp-1';
            const dynamicSuppId = 'supp-org-1';
            const membershipId = 'mem-dyn-001';

            // Insert active membership with OPERATOR role
            await connectionPool.query(`
                INSERT INTO supplier_memberships (id, user_id, tenant_id, supplier_id, supplier_role, is_active)
                VALUES (?, ?, 'tenant-supp-1', ?, 'SUPPLIER_OPERATOR', 1);
            `, [membershipId, dynamicUserId, dynamicSuppId]);

            // Issue JWT token for this user
            const token = generateToken({
                id: dynamicUserId,
                role: 'SUPPLIER_VIEWER', // Token role is VIEWER, but server resolves OPERATOR from DB!
                tenantId: 'tenant-supp-1',
                supplierId: dynamicSuppId,
                hasSupplierCapability: true
            });

            const { requireSupplierScope } = require('../src/api/middleware/auth');
            const operatorGuard = requireSupplierScope('OPERATOR');

            const req = {
                headers: { authorization: `Bearer ${token}` },
                user: {
                    id: dynamicUserId,
                    role: 'SUPPLIER_VIEWER',
                    tenantId: 'tenant-supp-1',
                    supplierId: dynamicSuppId,
                    hasSupplierCapability: true
                }
            };

            // Test 1: While membership is active in DB, operator check succeeds
            let nextCalled = false;
            let status = 200;
            let body = null;
            const res = {
                status(code) { status = code; return this; },
                json(data) { body = data; return this; }
            };

            await operatorGuard(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, true);

            // Test 2: Deactivate membership directly in database
            await connectionPool.query('UPDATE supplier_memberships SET is_active = 0 WHERE id = ?', [membershipId]);

            // Attempt same operation with the same already-issued JWT token
            nextCalled = false;
            status = 200;
            body = null;

            await operatorGuard(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, false);
            assert.strictEqual(status, 403);
            assert.strictEqual(body.error.code, 'FORBIDDEN_MEMBERSHIP_DEACTIVATED');
        });

        it('immediately reflects role degradation in database on active JWT token', async () => {
            const dynamicUserId = 'user-dyn-admin-1';
            const dynamicSuppId = 'supp-org-1';
            const membershipId = 'mem-dyn-002';

            // Insert membership with SUPPLIER_ADMIN role
            await connectionPool.query(`
                INSERT INTO supplier_memberships (id, user_id, tenant_id, supplier_id, supplier_role, is_active)
                VALUES (?, ?, 'tenant-supp-1', ?, 'SUPPLIER_ADMIN', 1);
            `, [membershipId, dynamicUserId, dynamicSuppId]);

            const token = generateToken({
                id: dynamicUserId,
                role: 'SUPPLIER_ADMIN',
                tenantId: 'tenant-supp-1',
                supplierId: dynamicSuppId,
                hasSupplierCapability: true
            });

            const { requireSupplierScope } = require('../src/api/middleware/auth');
            const adminGuard = requireSupplierScope('ADMIN');

            const req = {
                headers: { authorization: `Bearer ${token}` },
                user: {
                    id: dynamicUserId,
                    role: 'SUPPLIER_ADMIN',
                    tenantId: 'tenant-supp-1',
                    supplierId: dynamicSuppId,
                    hasSupplierCapability: true
                }
            };

            // Degrading membership from ADMIN to VIEWER in DB
            await connectionPool.query('UPDATE supplier_memberships SET supplier_role = "SUPPLIER_VIEWER" WHERE id = ?', [membershipId]);

            let nextCalled = false;
            let status = 200;
            let body = null;
            const res = {
                status(code) { status = code; return this; },
                json(data) { body = data; return this; }
            };

            await adminGuard(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, false);
            assert.strictEqual(status, 403);
            assert.match(body.error.message, /requires SUPPLIER_ADMIN role/);
        });
    });

    describe('12. Point 4 — Multi-Center Isolation Fail-Closed Across Operations', () => {
        let centerA = 'node-center-alpha';
        let centerG = 'node-center-gamma';
        let matCenterA = 'mat-center-a-1';
        let matCenterG = 'mat-center-b-1';

        it('restricts GET / catalog listing strictly to authorized center when printhouseId is specified', async () => {
            const tokenCenterA = generateToken({
                id: 'operator-center-a',
                role: 'OPERATOR',
                tenantId: 'tenant-print-a',
                printhouseId: centerA
            });

            const req = {
                method: 'GET',
                url: '/',
                originalUrl: '/api/admin/materials',
                headers: { authorization: `Bearer ${tokenCenterA}` }
            };

            const res = await dispatch(materialsAdminRouter, req);
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.ok, true);

            // Must include materials belonging to centerA and ZERO materials belonging to centerG
            const returnedIds = res.body.materials.map(m => m.id);
            assert.ok(returnedIds.includes(matCenterA));
            assert.strictEqual(returnedIds.includes(matCenterG), false);
        });

        it('denies GET /:id detail when material belongs to another center of same tenant (HTTP 403)', async () => {
            const tokenCenterA = generateToken({
                id: 'operator-center-a',
                role: 'OPERATOR',
                tenantId: 'tenant-print-a',
                printhouseId: centerA
            });

            const req = {
                method: 'GET',
                url: `/${matCenterG}`,
                originalUrl: `/api/admin/materials/${matCenterG}`,
                params: { id: matCenterG },
                headers: { authorization: `Bearer ${tokenCenterA}` }
            };

            const res = await dispatch(materialsAdminRouter, req);
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.code, 'FORBIDDEN_CROSS_CENTER_MATERIAL_ACCESS');
        });

        it('denies intake, adjust, and consume when material belongs to another center of same tenant (HTTP 403)', async () => {
            const tokenCenterA = generateToken({
                id: 'operator-center-a',
                role: 'OPERATOR',
                tenantId: 'tenant-print-a',
                printhouseId: centerA
            });

            // 1. Intake
            const reqIntake = {
                method: 'POST',
                url: `/${matCenterG}/intake`,
                originalUrl: `/api/admin/materials/${matCenterG}/intake`,
                params: { id: matCenterG },
                headers: { authorization: `Bearer ${tokenCenterA}` },
                body: { quantity: 100, reason: 'unauthorized intake' }
            };
            const resIntake = await dispatch(materialsAdminRouter, reqIntake);
            assert.strictEqual(resIntake.statusCode, 403);
            assert.strictEqual(resIntake.body.code, 'FORBIDDEN_CROSS_CENTER_MATERIAL_ACCESS');

            // 2. Adjust
            const reqAdjust = {
                method: 'POST',
                url: `/${matCenterG}/adjust`,
                originalUrl: `/api/admin/materials/${matCenterG}/adjust`,
                params: { id: matCenterG },
                headers: { authorization: `Bearer ${tokenCenterA}` },
                body: { quantity_delta: -50, reason: 'unauthorized adjust' }
            };
            const resAdjust = await dispatch(materialsAdminRouter, reqAdjust);
            assert.strictEqual(resAdjust.statusCode, 403);
            assert.strictEqual(resAdjust.body.code, 'FORBIDDEN_CROSS_CENTER_MATERIAL_ACCESS');

            // 3. Consume
            const reqConsume = {
                method: 'POST',
                url: `/${matCenterG}/consume`,
                originalUrl: `/api/admin/materials/${matCenterG}/consume`,
                params: { id: matCenterG },
                headers: { authorization: `Bearer ${tokenCenterA}` },
                body: { quantity_consumed: 20, reason: 'unauthorized consume' }
            };
            const resConsume = await dispatch(materialsAdminRouter, reqConsume);
            assert.strictEqual(resConsume.statusCode, 403);
            assert.strictEqual(resConsume.body.code, 'FORBIDDEN_CROSS_CENTER_MATERIAL_ACCESS');
        });
    });

    describe('13. Point 5 — Idempotency Hardening: Key Binding & Deep Canonical Hashing', () => {
        let matId = 'mat-idem-hard-1';
        let procOrder1 = 'proc-order-001';
        let procOrder2 = 'proc-order-002';

        beforeAll(async () => {
            if (!isConfiguredRun) return;
            await materialService.createMaterial({
                id: matId,
                material_name: 'Idempotency Paper 120g',
                material_type: 'PAPER',
                initial_stock: 500,
                node_id: 'node-alpha'
            }, 'tenant-print-a', 'node-alpha');

            await connectionPool.query(`
                INSERT INTO material_procurements (id, material_inventory_id, supplier_name, ordered_units, procurement_status)
                VALUES 
                    (?, ?, 'Fedrigoni Iberia', 1000, 'ORDERED'),
                    (?, ?, 'Fedrigoni Iberia', 1000, 'ORDERED');
            `, [procOrder1, matId, procOrder2, matId]);
        });

        it('rejects reusing the same idempotency key for a DIFFERENT procurement order (HTTP 409)', async () => {
            const sharedKey = 'ik-order-binding-key-999';

            // 1. First order completes successfully
            const res1 = await materialService.receiveProcurementAtomic(
                procOrder1,
                'operator-alice',
                'tenant-print-a',
                'node-alpha',
                false,
                { idempotencyKey: sharedKey, acceptedQuantity: 1000, requestBody: { batch: 'A' } }
            );
            assert.strictEqual(res1.received, true);

            // 2. Second order attempts to use the SAME idempotency key
            await assert.rejects(async () => {
                await materialService.receiveProcurementAtomic(
                    procOrder2,
                    'operator-alice',
                    'tenant-print-a',
                    'node-alpha',
                    false,
                    { idempotencyKey: sharedKey, acceptedQuantity: 1000, requestBody: { batch: 'A' } }
                );
            }, (err) => {
                assert.strictEqual(err.statusCode, 409);
                assert.strictEqual(err.code, 'IDEMPOTENCY_KEY_REUSED_FOR_DIFFERENT_PROCUREMENT');
                return true;
            });
        });

        it('correctly hashes deeply nested payloads canonically regardless of key insertion order', async () => {
            const nestedProcId = 'proc-nested-order-01';
            await connectionPool.query(`
                INSERT INTO material_procurements (id, material_inventory_id, supplier_name, ordered_units, procurement_status)
                VALUES (?, ?, 'Fedrigoni Iberia', 500, 'ORDERED');
            `, [nestedProcId, matId]);

            const nestedKey = 'ik-nested-canonical-01';
            // Payload 1: keys in one order
            const payload1 = {
                metadata: { zebra: 1, alpha: { b: 2, a: 1 } },
                tags: ['a', 'b'],
                accepted_quantity: 500
            };
            // Payload 2: same logical values, reversed key definitions
            const payload2 = {
                accepted_quantity: 500,
                tags: ['a', 'b'],
                metadata: { alpha: { a: 1, b: 2 }, zebra: 1 }
            };

            // First receipt
            const res1 = await materialService.receiveProcurementAtomic(
                nestedProcId,
                'operator-alice',
                'tenant-print-a',
                'node-alpha',
                false,
                { idempotencyKey: nestedKey, acceptedQuantity: 500, requestBody: payload1 }
            );
            assert.strictEqual(res1.received, true);

            // Replay with reordered keys must be recognized as EXACT SAME payload fingerprint (idempotent replay)
            const replayRes = await materialService.receiveProcurementAtomic(
                nestedProcId,
                'operator-alice',
                'tenant-print-a',
                'node-alpha',
                false,
                { idempotencyKey: nestedKey, acceptedQuantity: 500, requestBody: payload2 }
            );
            assert.strictEqual(replayRes.received, true);
            assert.strictEqual(replayRes.idempotentReplay, true);
        });
    });

    describe('14. Fastify Real Server & Express Bridge HTTP Injection Verification', () => {
        let fastifyServerUrl = null;

        beforeAll(async () => {
            if (!isConfiguredRun) return;
            const Fastify = require('fastify');
            testFastifyApp = Fastify({ logger: false });

            // Register @fastify/express bridge
            await testFastifyApp.register(require('@fastify/express'));
            testFastifyApp.use(require('express').json());

            // Reuse production authentication middleware for protected routes
            const { requireAdmin } = require('../src/api/middleware/auth');
            testFastifyApp.use('/api', requireAdmin);

            // Mount paper supplier and admin routers
            testFastifyApp.use('/api/v1/paper-suppliers', paperSuppliersRouter);
            testFastifyApp.use('/api/admin', require('../src/api/routes/admin'));

            // Register catch-all fallback for route groups
            const apiNotFoundFallback = (request, reply) => {
                if (!reply.sent) {
                    reply.status(404).send({ error: 'Endpoint not found', path: request.url });
                }
            };
            testFastifyApp.all('/api/v1/paper-suppliers', apiNotFoundFallback);
            testFastifyApp.all('/api/v1/paper-suppliers/*', apiNotFoundFallback);
            testFastifyApp.all('/api/admin', apiNotFoundFallback);
            testFastifyApp.all('/api/admin/*', apiNotFoundFallback);

            fastifyServerUrl = await testFastifyApp.listen({ port: 0, host: '127.0.0.1' });
        });

        afterAll(async () => {
            if (testFastifyApp) {
                await testFastifyApp.close();
            }
        });

        it('successfully executes HTTP request via Fastify app + Express bridge on /api/v1/paper-suppliers/me', async () => {
            const token = generateToken({
                id: 'user-supp-1',
                role: 'SUPPLIER_ADMIN',
                tenantId: 'tenant-supp-1',
                supplierId: 'supp-org-1'
            });

            const resp = await fetch(`${fastifyServerUrl}/api/v1/paper-suppliers/me`, {
                method: 'GET',
                headers: { authorization: `Bearer ${token}` }
            });

            assert.strictEqual(resp.status, 200);
            const body = await resp.json();
            assert.strictEqual(body.ok, true);
            assert.strictEqual(body.data.supplierId, 'supp-org-1');
            assert.strictEqual(body.data.name, 'Fedrigoni Iberia');
        });

        it('denies printhouse user accessing /api/v1/paper-suppliers/me via Fastify app (HTTP 403)', async () => {
            const tokenPrint = generateToken({
                id: 'user-print-a',
                role: 'PRINTHOUSE_ADMIN',
                tenantId: 'tenant-print-a',
                printhouseId: 'node-alpha'
            });

            const resp = await fetch(`${fastifyServerUrl}/api/v1/paper-suppliers/me`, {
                method: 'GET',
                headers: { authorization: `Bearer ${tokenPrint}` }
            });

            assert.strictEqual(resp.status, 403);
            const body = await resp.json();
            assert.match(body.error.message, /requires a Paper Supplier role/);
        });

        it('denies supplier user accessing printhouse materials via Fastify app into admin router (HTTP 403)', async () => {
            const tokenSupp = generateToken({
                id: 'user-supp-1',
                role: 'SUPPLIER_ADMIN',
                tenantId: 'tenant-supp-1',
                supplierId: 'supp-org-1'
            });

            const resp = await fetch(`${fastifyServerUrl}/api/admin/materials/node/node-alpha`, {
                method: 'GET',
                headers: { authorization: `Bearer ${tokenSupp}` }
            });

            assert.strictEqual(resp.status, 403);
            const body = await resp.json();
            assert.strictEqual(body.error, 'FORBIDDEN_SUPPLIER_ACCESS_TO_PRINTHOUSE_MATERIALS');
        });
    });

    describe('15. Dedicated I1-R2 Hardening & Regressions Verification', () => {
        it('denies access when supplier membership is deleted/absent from DB even if JWT claims ADMIN (HTTP 403)', async () => {
            const ghostUserId = 'user-ghost-supp';
            const tokenGhost = generateToken({
                id: ghostUserId,
                role: 'SUPPLIER_ADMIN',
                tenantId: 'tenant-supp-1',
                supplierId: 'supp-org-1',
                hasSupplierCapability: true
            });

            const req = {
                method: 'GET',
                url: '/me',
                originalUrl: '/api/v1/paper-suppliers/me',
                headers: { authorization: `Bearer ${tokenGhost}` }
            };

            const res = await dispatch(paperSuppliersRouter, req);
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.error.code, 'FORBIDDEN_MEMBERSHIP_REQUIRED');
        });

        it('denies access when tenant capability is deactivated despite having an active membership (HTTP 403)', async () => {
            // Tenant with active membership but deactivated PAPER_SUPPLIER capability
            const testTenantId = 'tenant-cap-deact';
            const testSuppId = 'supp-cap-deact';
            const testUserId = 'user-cap-deact';

            await connectionPool.query(`
                INSERT INTO tenants (id, name) VALUES ('${testTenantId}', 'Deactivated Cap Tenant');
                INSERT INTO paper_suppliers (id, tenant_id, name, status) VALUES ('${testSuppId}', '${testTenantId}', 'Deactivated Cap Supplier', 'ACTIVE');
                INSERT INTO tenant_capabilities (id, tenant_id, capability, is_active) VALUES ('cap-deact-1', '${testTenantId}', 'PAPER_SUPPLIER', 0);
                INSERT INTO supplier_memberships (id, user_id, tenant_id, supplier_id, supplier_role, is_active) VALUES ('mem-deact-1', '${testUserId}', '${testTenantId}', '${testSuppId}', 'SUPPLIER_ADMIN', 1);
            `);

            const token = generateToken({
                id: testUserId,
                role: 'SUPPLIER_ADMIN',
                tenantId: testTenantId,
                supplierId: testSuppId,
                hasSupplierCapability: true
            });

            const req = {
                method: 'GET',
                url: '/me',
                originalUrl: '/api/v1/paper-suppliers/me',
                headers: { authorization: `Bearer ${token}` }
            };

            const res = await dispatch(paperSuppliersRouter, req);
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.error.code, 'FORBIDDEN_CAPABILITY_DEACTIVATED');
        });

        it('fails controlled with HTTP 500 DATABASE_ERROR on DB query failure without granting access', async () => {
            const token = generateToken({
                id: 'user-supp-1',
                role: 'SUPPLIER_ADMIN',
                tenantId: 'tenant-supp-1',
                supplierId: 'supp-org-1',
                hasSupplierCapability: true
            });

            const req = {
                method: 'GET',
                url: '/me',
                originalUrl: '/api/v1/paper-suppliers/me',
                headers: { authorization: `Bearer ${token}` },
                user: {
                    id: 'user-supp-1',
                    role: 'SUPPLIER_ADMIN',
                    tenantId: 'tenant-supp-1',
                    supplierId: 'supp-org-1',
                    hasSupplierCapability: true
                }
            };

            const { requireSupplierScope } = require('../src/api/middleware/auth');
            const originalQuery = mysqlClient.query;
            let statusCode = 200;
            let responseBody = null;
            let nextCalled = false;

            try {
                // Simulate controlled database outage
                mysqlClient.query = async () => { throw new Error('SIMULATED_DB_CONN_LOST'); };

                const guard = requireSupplierScope('VIEWER');
                await guard(req, {
                    status(c) { statusCode = c; return this; },
                    json(d) { responseBody = d; return this; }
                }, () => { nextCalled = true; });

                assert.strictEqual(nextCalled, false);
                assert.strictEqual(statusCode, 500);
                assert.strictEqual(responseBody.error.code, 'DATABASE_ERROR');
            } finally {
                mysqlClient.query = originalQuery;
            }
        });

        it('dynamically reflects DB role degradation immediately in /status and /me responses', async () => {
            const degradeUserId = 'user-degrade-status';
            const degradeSuppId = 'supp-org-1';
            const memId = 'mem-degrade-status-1';

            await connectionPool.query(`
                INSERT INTO supplier_memberships (id, user_id, tenant_id, supplier_id, supplier_role, is_active)
                VALUES (?, ?, 'tenant-supp-1', ?, 'SUPPLIER_ADMIN', 1);
            `, [memId, degradeUserId, degradeSuppId]);

            const token = generateToken({
                id: degradeUserId,
                role: 'SUPPLIER_ADMIN',
                tenantId: 'tenant-supp-1',
                supplierId: degradeSuppId,
                hasSupplierCapability: true
            });

            // 1. Initial check: /status shows ADMIN
            const reqStatus1 = {
                method: 'GET',
                url: '/status',
                originalUrl: '/api/v1/paper-suppliers/status',
                headers: { authorization: `Bearer ${token}` }
            };
            const resStatus1 = await dispatch(paperSuppliersRouter, reqStatus1);
            assert.strictEqual(resStatus1.statusCode, 200);
            assert.strictEqual(resStatus1.body.actor.role, 'SUPPLIER_ADMIN');
            assert.strictEqual(resStatus1.body.actor.isSupplierAdmin, true);

            // 2. Degrade in database from ADMIN to VIEWER
            await connectionPool.query(`UPDATE supplier_memberships SET supplier_role = 'SUPPLIER_VIEWER' WHERE id = ?`, [memId]);

            // 3. Next request with SAME JWT token immediately reflects VIEWER in /status and /me
            const reqStatus2 = {
                method: 'GET',
                url: '/status',
                originalUrl: '/api/v1/paper-suppliers/status',
                headers: { authorization: `Bearer ${token}` }
            };
            const resStatus2 = await dispatch(paperSuppliersRouter, reqStatus2);
            assert.strictEqual(resStatus2.statusCode, 200);
            assert.strictEqual(resStatus2.body.actor.role, 'SUPPLIER_VIEWER');
            assert.strictEqual(resStatus2.body.actor.isSupplierAdmin, false);

            const reqMe2 = {
                method: 'GET',
                url: '/me',
                originalUrl: '/api/v1/paper-suppliers/me',
                headers: { authorization: `Bearer ${token}` }
            };
            const resMe2 = await dispatch(paperSuppliersRouter, reqMe2);
            assert.strictEqual(resMe2.statusCode, 200);
            assert.strictEqual(resMe2.body.data.role, 'SUPPLIER_VIEWER');
        });

        it('denies absent center access on material creation, detail, and operations fail-closed', async () => {
            // Material creation without center for non-superadmin
            const tokenOp = generateToken({
                id: 'operator-no-center',
                role: 'PRINTHOUSE_OPERATOR',
                tenantId: 'tenant-print-a'
                // NO printhouseId
            });

            const reqCreate = {
                method: 'POST',
                url: '/',
                originalUrl: '/api/admin/materials',
                headers: { authorization: `Bearer ${tokenOp}` },
                body: { material_name: 'Unassigned Center Material', initial_stock: 100 }
            };
            const resCreate = await dispatch(materialsAdminRouter, reqCreate);
            assert.strictEqual(resCreate.statusCode, 403);
            assert.strictEqual(resCreate.body.code, 'FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS');

            // Detail on material with unassigned center
            const unassignedMatId = 'mat-unassigned-center-1';
            await connectionPool.query(`
                INSERT INTO predictive_material_inventory (id, node_id, material_name, material_type, current_stock_units, tenant_id, printhouse_id)
                VALUES ('${unassignedMatId}', '', 'Unassigned Mat', 'PAPER', 1000, 'tenant-print-a', NULL);
            `);

            const reqDetail = {
                method: 'GET',
                url: `/${unassignedMatId}`,
                originalUrl: `/api/admin/materials/${unassignedMatId}`,
                params: { id: unassignedMatId },
                headers: { authorization: `Bearer ${tokenOp}` }
            };
            const resDetail = await dispatch(materialsAdminRouter, reqDetail);
            assert.strictEqual(resDetail.statusCode, 403);
            assert.strictEqual(resDetail.body.code, 'FORBIDDEN_UNASSIGNED_CENTER_MATERIAL_ACCESS');
        });

        it('restricts tenant ppos-production strictly to own resources without global privileges', async () => {
            const tokenPposProd = generateToken({
                id: 'user-ppos-prod',
                role: 'PRINTHOUSE_ADMIN',
                tenantId: 'ppos-production',
                printhouseId: 'node-ppos-1'
            });

            await connectionPool.query(`
                INSERT INTO printer_nodes (id, tenant_id, name, status, email) VALUES ('node-ppos-1', 'ppos-production', 'PPOS Prod Press', 'active', 'node-ppos-1@ppos.local');
            `);

            // Try to access Printhouse A material as ppos-production tenant
            const req = {
                method: 'GET',
                url: '/mat-atomic-1',
                originalUrl: '/api/admin/materials/mat-atomic-1',
                params: { id: 'mat-atomic-1' },
                headers: { authorization: `Bearer ${tokenPposProd}` }
            };

            const res = await dispatch(materialsAdminRouter, req);
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.code, 'FORBIDDEN_CROSS_TENANT_MATERIAL_ACCESS');
        });

        it('detects idempotency mismatch when effective quantity changes with identical requestBody', async () => {
            const procId = 'proc-diff-qty-1';
            const matId = 'mat-diff-qty-1';
            const idemKey = 'ik-diff-qty-test-1';

            await materialService.createMaterial({
                id: matId,
                material_name: 'Diff Qty Sheet',
                material_type: 'PAPER',
                initial_stock: 500,
                node_id: 'node-alpha'
            }, 'tenant-print-a', 'node-alpha');

            await connectionPool.query(`
                INSERT INTO material_procurements (id, material_inventory_id, supplier_name, ordered_units, procurement_status)
                VALUES ('${procId}', '${matId}', 'Fedrigoni', 1000, 'ORDERED');
            `);

            const sharedBody = { note: 'Delivery at dock 2' };

            // 1. Initial receipt with effective quantity 1000
            const res1 = await materialService.receiveProcurementAtomic(
                procId,
                'operator-alice',
                'tenant-print-a',
                'node-alpha',
                false,
                { idempotencyKey: idemKey, acceptedQuantity: 1000, requestBody: sharedBody }
            );
            assert.strictEqual(res1.received, true);
            assert.strictEqual(res1.unitsReceived, 1000);

            // 2. Replay with identical requestBody but different effective quantity (e.g. 500)
            await assert.rejects(async () => {
                await materialService.receiveProcurementAtomic(
                    procId,
                    'operator-alice',
                    'tenant-print-a',
                    'node-alpha',
                    false,
                    { idempotencyKey: idemKey, acceptedQuantity: 500, requestBody: sharedBody }
                );
            }, (err) => {
                assert.strictEqual(err.statusCode, 409);
                assert.strictEqual(err.code, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
                return true;
            });
        });

        it('rolls back completely when ledger read fails and when ledger insert fails separately', async () => {
            const matFailTest = 'mat-fail-rollback-test';
            const procFailTest1 = 'proc-fail-read-1';
            const procFailTest2 = 'proc-fail-write-1';

            await materialService.createMaterial({
                id: matFailTest,
                material_name: 'Rollback Safety Substrate',
                material_type: 'PAPER',
                initial_stock: 1000,
                node_id: 'node-alpha'
            }, 'tenant-print-a', 'node-alpha');

            await connectionPool.query(`
                INSERT INTO material_procurements (id, material_inventory_id, supplier_name, ordered_units, procurement_status)
                VALUES 
                    ('${procFailTest1}', '${matFailTest}', 'Fedrigoni', 500, 'ORDERED'),
                    ('${procFailTest2}', '${matFailTest}', 'Fedrigoni', 500, 'ORDERED');
            `);

            // Case A: Ledger read failure
            const originalQuery = mysqlClient.query;
            try {
                // We simulate query failure specifically for procurement_receipt_records read
                const connection = await connectionPool.getConnection();
                const realQuery = connection.query.bind(connection);
                connection.query = async (sql, params) => {
                    if (typeof sql === 'string' && sql.includes('procurement_receipt_records') && sql.includes('FOR UPDATE')) {
                        throw new Error('INJECTED_LEDGER_READ_FAILURE');
                    }
                    return realQuery(sql, params);
                };

                const originalGetConnection = connectionPool.getConnection.bind(connectionPool);
                connectionPool.getConnection = async () => connection;

                await assert.rejects(async () => {
                    await materialService.receiveProcurementAtomic(
                        procFailTest1,
                        'operator-alice',
                        'tenant-print-a',
                        'node-alpha',
                        false,
                        { idempotencyKey: 'ik-fail-read', acceptedQuantity: 500, requestBody: {} }
                    );
                }, (err) => {
                    assert.match(err.message, /INJECTED_LEDGER_READ_FAILURE/);
                    return true;
                });

                connectionPool.getConnection = originalGetConnection;
                connection.release();

                // Verify stock remains intact at 1000 and procurement status remains ORDERED
                const [matCheck] = await connectionPool.query('SELECT current_stock_units FROM predictive_material_inventory WHERE id = ?', [matFailTest]);
                assert.strictEqual(matCheck[0].current_stock_units, 1000);
                const [procCheck] = await connectionPool.query('SELECT procurement_status FROM material_procurements WHERE id = ?', [procFailTest1]);
                assert.strictEqual(procCheck[0].procurement_status, 'ORDERED');
            } finally {
                mysqlClient.query = originalQuery;
            }

            // Case B: Ledger insert failure
            try {
                const connection = await connectionPool.getConnection();
                const realQuery = connection.query.bind(connection);
                connection.query = async (sql, params) => {
                    if (typeof sql === 'string' && sql.includes('INSERT INTO procurement_receipt_records')) {
                        throw new Error('INJECTED_LEDGER_INSERT_FAILURE');
                    }
                    return realQuery(sql, params);
                };

                const originalGetConnection = connectionPool.getConnection.bind(connectionPool);
                connectionPool.getConnection = async () => connection;

                await assert.rejects(async () => {
                    await materialService.receiveProcurementAtomic(
                        procFailTest2,
                        'operator-alice',
                        'tenant-print-a',
                        'node-alpha',
                        false,
                        { idempotencyKey: 'ik-fail-write', acceptedQuantity: 500, requestBody: {} }
                    );
                }, (err) => {
                    assert.match(err.message, /INJECTED_LEDGER_INSERT_FAILURE/);
                    return true;
                });

                connectionPool.getConnection = originalGetConnection;
                connection.release();

                // Verify stock remains intact at 1000 and procurement status remains ORDERED
                const [matCheck2] = await connectionPool.query('SELECT current_stock_units FROM predictive_material_inventory WHERE id = ?', [matFailTest]);
                assert.strictEqual(matCheck2[0].current_stock_units, 1000);
                const [procCheck2] = await connectionPool.query('SELECT procurement_status FROM material_procurements WHERE id = ?', [procFailTest2]);
                assert.strictEqual(procCheck2[0].procurement_status, 'ORDERED');
            } finally {
                mysqlClient.query = originalQuery;
            }
        });
    });

    describe('16. Functional Blocker Regressions: Actor Without Center Authorization (printhouseId = null)', () => {
        let matCenter1 = 'mat-actor-nc-1';
        let matCenter2 = 'mat-actor-nc-2';
        let nodeCenter1 = 'node-alpha';
        let nodeCenter2 = 'node-alpha-2';
        let procOrderCenter = 'proc-actor-nc-1';
        let operatorTokenNoCenter = null;

        beforeAll(async () => {
            if (!isConfiguredRun) return;

            // Ensure a second node for tenant-print-a exists
            await connectionPool.query(`
                INSERT INTO printer_nodes (id, tenant_id, name, status, email)
                VALUES ('${nodeCenter2}', 'tenant-print-a', 'Second Printhouse Center Node', 'active', 'node-center-2@print-a.local')
                ON DUPLICATE KEY UPDATE status='active';
            `);

            // Create materials in two different centers of the same tenant (tenant-print-a)
            await connectionPool.query(`
                INSERT INTO predictive_material_inventory
                    (id, node_id, material_name, material_type, current_stock_units, reserved_stock_units, available_units, tenant_id, printhouse_id, reorder_point)
                VALUES
                    ('${matCenter1}', '${nodeCenter1}', 'Glossy 150g Center 1', 'PAPER', 1000, 0, 1000, 'tenant-print-a', '${nodeCenter1}', 200),
                    ('${matCenter2}', '${nodeCenter2}', 'Silk 200g Center 2', 'PAPER', 2000, 0, 2000, 'tenant-print-a', '${nodeCenter2}', 300)
                ON DUPLICATE KEY UPDATE current_stock_units=VALUES(current_stock_units);
            `);

            // Create procurement order on matCenter1
            await connectionPool.query(`
                INSERT INTO material_procurements
                    (id, material_inventory_id, supplier_name, ordered_units, procurement_status)
                VALUES
                    ('${procOrderCenter}', '${matCenter1}', 'Fedrigoni Iberia', 500, 'ORDERED')
                ON DUPLICATE KEY UPDATE ordered_units=500;
            `);

            // Actor: PRINTHOUSE_OPERATOR of tenant-print-a with NO center assigned (printhouseId = null)
            operatorTokenNoCenter = generateToken({
                id: 'user-print-operator-no-center',
                email: 'operator-nocenter@printhouse.local',
                role: 'PRINTHOUSE_OPERATOR',
                tenantId: 'tenant-print-a',
                printhouseId: null,
                hasPrinthouseCapability: true
            });
        });

        it('1. GET / rejects actor without center (HTTP 403) and does NOT list materials across centers', async () => {
            const req = {
                method: 'GET',
                url: '/',
                originalUrl: '/api/admin/materials',
                headers: { authorization: `Bearer ${operatorTokenNoCenter}` }
            };

            const res = await dispatch(materialsAdminRouter, req);
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.code, 'FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS');
        });

        it('2. GET /:id rejects detail query of material with center when actor lacks center (HTTP 403)', async () => {
            const req = {
                method: 'GET',
                url: `/${matCenter1}`,
                originalUrl: `/api/admin/materials/${matCenter1}`,
                params: { id: matCenter1 },
                headers: { authorization: `Bearer ${operatorTokenNoCenter}` }
            };

            const res = await dispatch(materialsAdminRouter, req);
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.code, 'FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS');
        });

        it('3. POST /:id/intake, /adjust, /consume reject actor without center without altering stock or events (HTTP 403)', async () => {
            // A. Intake attempt
            const reqIntake = {
                method: 'POST',
                url: `/${matCenter1}/intake`,
                originalUrl: `/api/admin/materials/${matCenter1}/intake`,
                params: { id: matCenter1 },
                headers: { authorization: `Bearer ${operatorTokenNoCenter}` },
                body: { quantity: 500, reason: 'unauthorized intake attempt' }
            };
            const resIntake = await dispatch(materialsAdminRouter, reqIntake);
            assert.strictEqual(resIntake.statusCode, 403);
            assert.strictEqual(resIntake.body.code, 'FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS');

            // B. Adjust attempt
            const reqAdjust = {
                method: 'POST',
                url: `/${matCenter1}/adjust`,
                originalUrl: `/api/admin/materials/${matCenter1}/adjust`,
                params: { id: matCenter1 },
                headers: { authorization: `Bearer ${operatorTokenNoCenter}` },
                body: { quantity_delta: 200, reason: 'unauthorized adjust attempt' }
            };
            const resAdjust = await dispatch(materialsAdminRouter, reqAdjust);
            assert.strictEqual(resAdjust.statusCode, 403);
            assert.strictEqual(resAdjust.body.code, 'FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS');

            // C. Consume attempt
            const reqConsume = {
                method: 'POST',
                url: `/${matCenter1}/consume`,
                originalUrl: `/api/admin/materials/${matCenter1}/consume`,
                params: { id: matCenter1 },
                headers: { authorization: `Bearer ${operatorTokenNoCenter}` },
                body: { quantity_consumed: 100, reason: 'unauthorized consume attempt' }
            };
            const resConsume = await dispatch(materialsAdminRouter, reqConsume);
            assert.strictEqual(resConsume.statusCode, 403);
            assert.strictEqual(resConsume.body.code, 'FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS');

            // Verify stock and events are 100% UNTOUCHED
            const [matCheck] = await connectionPool.query('SELECT current_stock_units, reserved_stock_units FROM predictive_material_inventory WHERE id = ?', [matCenter1]);
            assert.strictEqual(matCheck[0].current_stock_units, 1000);
            assert.strictEqual(matCheck[0].reserved_stock_units, 0);

            const [events] = await connectionPool.query('SELECT * FROM material_inventory_events WHERE material_inventory_id = ?', [matCenter1]);
            assert.strictEqual(events.length, 0);
        });

        it('4. POST / rejects material creation when actor has no center even if sending valid node_id in body (HTTP 403)', async () => {
            const req = {
                method: 'POST',
                url: '/',
                originalUrl: '/api/admin/materials',
                headers: { authorization: `Bearer ${operatorTokenNoCenter}` },
                body: {
                    id: 'mat-unauth-create-try-1',
                    node_id: nodeCenter1,
                    material_name: 'Illicit Material Creation',
                    material_type: 'PAPER',
                    initial_stock: 500
                }
            };

            const res = await dispatch(materialsAdminRouter, req);
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.code, 'FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS');

            // Verify material was NOT created
            const [checkCreated] = await connectionPool.query('SELECT * FROM predictive_material_inventory WHERE id = ?', ['mat-unauth-create-try-1']);
            assert.strictEqual(checkCreated.length, 0);
        });

        it('5. POST /reserve and /release legacy reject actor without center even if node_id belongs to tenant (HTTP 403)', async () => {
            // Reserve attempt
            const reqReserve = {
                method: 'POST',
                url: '/reserve',
                originalUrl: '/api/admin/materials/reserve',
                headers: { authorization: `Bearer ${operatorTokenNoCenter}` },
                body: {
                    dispatch_id: 'dispatch-nocenter-1',
                    node_id: nodeCenter1,
                    specs: { material_id: matCenter1, units: 100 }
                }
            };
            const resReserve = await dispatch(materialsAdminRouter, reqReserve);
            assert.strictEqual(resReserve.statusCode, 403);
            assert.strictEqual(resReserve.body.code, 'FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS');

            // Release attempt
            const reqRelease = {
                method: 'POST',
                url: '/release',
                originalUrl: '/api/admin/materials/release',
                headers: { authorization: `Bearer ${operatorTokenNoCenter}` },
                body: {
                    dispatch_id: 'dispatch-nocenter-1',
                    node_id: nodeCenter1,
                    specs: { material_id: matCenter1, units: 100 }
                }
            };
            const resRelease = await dispatch(materialsAdminRouter, reqRelease);
            assert.strictEqual(resRelease.statusCode, 403);
            assert.strictEqual(resRelease.body.code, 'FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS');

            // Verify stock and reservations remain untouched
            const [matCheck] = await connectionPool.query('SELECT current_stock_units, reserved_stock_units FROM predictive_material_inventory WHERE id = ?', [matCenter1]);
            assert.strictEqual(matCheck[0].current_stock_units, 1000);
            assert.strictEqual(matCheck[0].reserved_stock_units, 0);

            const [resRows] = await connectionPool.query('SELECT * FROM manufacturing_material_reservations WHERE material_inventory_id = ?', [matCenter1]);
            assert.strictEqual(resRows.length, 0);
        });

        it('6. POST /procurements/:id/receive rejects actor without center on resources with center (HTTP 403)', async () => {
            const req = {
                method: 'POST',
                url: `/procurements/${procOrderCenter}/receive`,
                originalUrl: `/api/admin/materials/procurements/${procOrderCenter}/receive`,
                params: { id: procOrderCenter },
                headers: {
                    authorization: `Bearer ${operatorTokenNoCenter}`,
                    'idempotency-key': 'ik-nocenter-receive-try'
                },
                body: { accepted_quantity: 500 }
            };

            const res = await dispatch(materialsAdminRouter, req);
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.code, 'FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS');

            // Verify procurement status remains ORDERED, stock intact, zero receipt records
            const [procCheck] = await connectionPool.query('SELECT procurement_status FROM material_procurements WHERE id = ?', [procOrderCenter]);
            assert.strictEqual(procCheck[0].procurement_status, 'ORDERED');

            const [matCheck] = await connectionPool.query('SELECT current_stock_units FROM predictive_material_inventory WHERE id = ?', [matCenter1]);
            assert.strictEqual(matCheck[0].current_stock_units, 1000);

            const [receiptRows] = await connectionPool.query('SELECT * FROM procurement_receipt_records WHERE procurement_id = ?', [procOrderCenter]);
            assert.strictEqual(receiptRows.length, 0);
        });
    });

});
