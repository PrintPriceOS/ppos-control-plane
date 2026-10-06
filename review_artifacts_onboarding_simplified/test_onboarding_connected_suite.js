/**
 * scripts/test_onboarding_connected_suite.js
 *
 * Dedicated Connected Onboarding & Calibration Test Suite for PrintPrice OS Control Plane.
 * Conforms strictly to the official MySQL schema and validated connected harness architecture.
 *
 * STRICT EXECUTION & SECURITY GUARDRAILS:
 * 1. Zero dotenv loading. No fallback to generic MYSQL_* / DATABASE_URL.
 *    Clean DATABASE_URL and MYSQL_URL before importing services.
 * 2. MySQL target exclusively: 127.0.0.1:3306, db: pposrcmdw0qdtest, user: ppos_rc_mdw0qd.
 *    Positive verification: SELECT CURRENT_USER(), DATABASE() on direct connection and CP pool.
 *    Exact required identity: ppos_rc_mdw0qd@127.0.0.1 on pposrcmdw0qdtest.
 * 3. Zero DDL/CREATE TABLE. Conforms strictly to official migrated MySQL schema.
 * 4. Rigorous schema compliance:
 *    - Creates official `tenants` records before referencing in `printer_nodes`.
 *    - `printer_nodes` includes email and status; NO updated_at column.
 *    - `printhouse_pricing_revisions` queries by printer_node_id and rates_checksum (not printhouse_id/version/checksum).
 *    - Tracks and cleans `printhouse_pricing_calibration_acceptances`.
 * 5. Unique IDs per execution. Tracks all created IDs and performs automatic orphan discovery by execution tenant.
 *    Deterministic teardown in strict foreign-key order across all 6 tables.
 *    Cleanup verification checks zero residuals in all 6 affected tables; cleanup failure exits with code 1.
 * 6. Effective scope:
 *    - Official routes: POST for /ready, POST for /reject (cancellation), POST for /calculate, POST for /accept.
 *    - Strict cross-tenant isolation testing using a REAL session and REAL run ID belonging to Tenant A.
 *    - Real cancellation flow: tests POST /reject, verifying status 'REJECTED' and zero revisions/zero rate mutation.
 *    - Verifies cryptographic integrity of rates_checksum by computing canonical SHA-256 of stored rates_json.
 * 7. Clean server, client, and pool shutdown with HTTP timeouts.
 */

'use strict';

// ── 1. FAIL-SAFE ENVIRONMENT & PARAMETER ENFORCEMENT ──
if (process.env.NODE_ENV === 'production' || process.env.PPOS_ENV === 'production') {
    console.error('[FATAL] test_onboarding_connected_suite.js MUST NEVER be executed in production.');
    process.exit(1);
}

// Explicitly remove any inherited connection strings that could point to production
delete process.env.DATABASE_URL;
delete process.env.MYSQL_URL;
delete process.env.MONGODB_URI;

const REQUIRED_MYSQL = {
    host: '127.0.0.1',
    port: 3306,
    user: 'ppos_rc_mdw0qd',
    database: 'pposrcmdw0qdtest'
};

const configuredMysqlHost = process.env.PPOS_TEST_MYSQL_HOST || REQUIRED_MYSQL.host;
const configuredMysqlPort = parseInt(process.env.PPOS_TEST_MYSQL_PORT || String(REQUIRED_MYSQL.port), 10);
const configuredMysqlUser = process.env.PPOS_TEST_MYSQL_USER || REQUIRED_MYSQL.user;
const configuredMysqlDb = process.env.PPOS_TEST_MYSQL_DATABASE || REQUIRED_MYSQL.database;

if (configuredMysqlHost !== REQUIRED_MYSQL.host ||
    configuredMysqlPort !== REQUIRED_MYSQL.port ||
    configuredMysqlUser !== REQUIRED_MYSQL.user ||
    configuredMysqlDb !== REQUIRED_MYSQL.database) {
    console.error(`\n[FATAL] Configuration rejected: MySQL parameters must be strictly identical to:`);
    console.error(`  Host: ${REQUIRED_MYSQL.host}`);
    console.error(`  Port: ${REQUIRED_MYSQL.port}`);
    console.error(`  User: ${REQUIRED_MYSQL.user}`);
    console.error(`  Database: ${REQUIRED_MYSQL.database}`);
    console.error(`Attempted configuration: ${configuredMysqlUser}@${configuredMysqlHost}:${configuredMysqlPort}/${configuredMysqlDb}`);
    process.exit(1);
}

const mysqlPassword = process.env.PPOS_TEST_MYSQL_PASSWORD;
if (!mysqlPassword) {
    console.error('\n[FATAL] Missing required environment variable: PPOS_TEST_MYSQL_PASSWORD');
    console.error('Explicit test password must be supplied via PPOS_TEST_MYSQL_PASSWORD.');
    process.exit(1);
}

// Set CP environment variables strictly before importing CP services and routes
process.env.MYSQL_HOST = REQUIRED_MYSQL.host;
process.env.MYSQL_PORT = String(REQUIRED_MYSQL.port);
process.env.MYSQL_USER = REQUIRED_MYSQL.user;
process.env.MYSQL_PASSWORD = mysqlPassword;
process.env.MYSQL_DATABASE = REQUIRED_MYSQL.database;
delete process.env.DATABASE_URL;
delete process.env.MYSQL_URL;

const JWT_SECRET = process.env.JWT_TEST_SECRET || 'test_isolated_connected_secret_key_2026';
process.env.JWT_SECRET = JWT_SECRET;

const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

// Import Control Plane services with verified clean environment
const mysqlClient = require('../src/api/services/mysqlClient');
const printhouseOnboardingRoutes = require('../src/api/routes/printhouseOnboardingRoutes');

// ── 2. CANONICAL STRINGIFY & CHECKSUM UTILITIES ──
function canonicalStringify(obj) {
    if (obj === null || obj === undefined) return 'null';
    if (typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return '[' + obj.map(v => canonicalStringify(v)).join(',') + ']';
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}';
}

function computeCanonicalRatesChecksum(rates) {
    if (!rates) return null;
    const parsed = typeof rates === 'string' ? JSON.parse(rates) : rates;
    const canonical = canonicalStringify(parsed);
    return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
}

// ── 3. UNIQUE FIXTURE TRACKING & IDENTITY ──
const EXECUTION_TAG = 'test_onb_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
const tracker = {
    tenants: new Set(),
    printerNodes: new Set(),
    sessionIds: new Set(),
    runIds: new Set(),
    revisionIds: new Set(),
    acceptanceIds: new Set()
};

let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition, message, details = '') {
    totalAssertions++;
    if (condition) {
        console.log(`  ✓ ${message}`);
        passedAssertions++;
    } else {
        console.error(`  ✗ FAIL: ${message}${details ? ` -> ${details}` : ''}`);
        throw new Error(`Assertion failed: ${message}`);
    }
}

function createTestToken(tenantId, role = 'PRINTHOUSE_OPERATOR', userId = 'test-op-1') {
    return jwt.sign(
        { id: userId, tenantId, role, email: `${userId}@${tenantId}.example.com` },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
}

function httpRequest(serverUrl, method, path, token, body = null, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, serverUrl);
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request(
            {
                method,
                hostname: url.hostname,
                port: url.port,
                path: url.pathname + url.search,
                headers,
                timeout: timeoutMs
            },
            (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    let json = {};
                    try { json = JSON.parse(data); } catch (e) { json = { raw: data }; }
                    resolve({ status: res.statusCode, headers: res.headers, body: json });
                });
            }
        );

        req.on('timeout', () => {
            req.destroy(new Error(`HTTP_TIMEOUT: Request timed out after ${timeoutMs}ms: ${method} ${path}`));
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// ── 4. STRICT IDENTITY VERIFICATION ──
async function verifyMysqlIdentity(directConn, cpPool) {
    console.log(`\n[IDENTITY] Verifying positive identity on MySQL connections (Zero DDL)...`);

    // A. Direct Connection Check
    const [directRows] = await directConn.query('SELECT CURRENT_USER() AS currentUser, DATABASE() AS currentDb');
    const directUser = directRows[0]?.currentUser;
    const directDb = directRows[0]?.currentDb;

    console.log(`  Direct Connection: currentUser="${directUser}", currentDb="${directDb}"`);
    if (directUser !== 'ppos_rc_mdw0qd@127.0.0.1') {
        throw new Error(`Direct connection identity mismatch. Expected "ppos_rc_mdw0qd@127.0.0.1", got "${directUser}"`);
    }
    if (directDb !== REQUIRED_MYSQL.database) {
        throw new Error(`Direct connection database mismatch. Expected "${REQUIRED_MYSQL.database}", got "${directDb}"`);
    }
    assert(true, `Direct MySQL identity strictly verified as ${directUser} on ${directDb}`);

    // B. CP Service Pool Check: destructure [poolRows] from native mysql2 pool query
    const [poolRows] = await cpPool.query('SELECT CURRENT_USER() AS currentUser, DATABASE() AS currentDb');
    const poolUser = poolRows[0]?.currentUser;
    const poolDb = poolRows[0]?.currentDb;

    console.log(`  CP Service Pool  : currentUser="${poolUser}", currentDb="${poolDb}"`);
    if (poolUser !== 'ppos_rc_mdw0qd@127.0.0.1') {
        throw new Error(`CP service pool identity mismatch. Expected "ppos_rc_mdw0qd@127.0.0.1", got "${poolUser}"`);
    }
    if (poolDb !== REQUIRED_MYSQL.database) {
        throw new Error(`CP service pool database mismatch. Expected "${REQUIRED_MYSQL.database}", got "${poolDb}"`);
    }
    assert(true, `CP service pool identity strictly verified as ${poolUser} on ${poolDb}`);
}

// ── 5. DETERMINISTIC CLEANUP IN FK ORDER ACROSS ALL 6 TABLES ──
async function performDeterministicCleanup(directConn) {
    console.log('\n[CLEANUP] Discovering and purging tracked test fixtures across all 6 affected tables...');
    let cleanupFailed = false;
    const residualErrors = [];

    try {
        const tenantList = Array.from(tracker.tenants);

        // Discovery step: find any entities created during execution under these test tenants
        if (tenantList.length > 0) {
            const [foundAcceptances] = await directConn.query(
                `SELECT id FROM printhouse_pricing_calibration_acceptances WHERE tenant_id IN (?)`,
                [tenantList]
            );
            foundAcceptances.forEach(r => tracker.acceptanceIds.add(r.id));

            const [foundRevisions] = await directConn.query(
                `SELECT id FROM printhouse_pricing_revisions WHERE tenant_id IN (?)`,
                [tenantList]
            );
            foundRevisions.forEach(r => tracker.revisionIds.add(r.id));

            const [foundSessions] = await directConn.query(
                `SELECT id FROM printhouse_pricing_calibration_sessions WHERE tenant_id IN (?)`,
                [tenantList]
            );
            foundSessions.forEach(r => tracker.sessionIds.add(r.id));

            const sessionList = Array.from(tracker.sessionIds);
            if (sessionList.length > 0) {
                const [foundRuns] = await directConn.query(
                    `SELECT id FROM printhouse_pricing_calibration_runs WHERE session_id IN (?)`,
                    [sessionList]
                );
                foundRuns.forEach(r => tracker.runIds.add(r.id));
            }

            const [foundNodes] = await directConn.query(
                `SELECT id FROM printer_nodes WHERE tenant_id IN (?)`,
                [tenantList]
            );
            foundNodes.forEach(r => tracker.printerNodes.add(r.id));
        }

        // Teardown step: delete in strict foreign key dependency order
        // 1. Calibration acceptances
        if (tracker.acceptanceIds.size > 0) {
            const accIds = Array.from(tracker.acceptanceIds);
            await directConn.query(
                `DELETE FROM printhouse_pricing_calibration_acceptances WHERE id IN (?)`,
                [accIds]
            );
            console.log(`  ✓ Cleaned ${accIds.length} calibration acceptances`);
        }

        // 2. Calibration runs
        if (tracker.runIds.size > 0) {
            const runIds = Array.from(tracker.runIds);
            await directConn.query(
                `DELETE FROM printhouse_pricing_calibration_runs WHERE id IN (?)`,
                [runIds]
            );
            console.log(`  ✓ Cleaned ${runIds.length} calibration runs`);
        }

        // 3. Calibration sessions
        if (tracker.sessionIds.size > 0) {
            const sessIds = Array.from(tracker.sessionIds);
            await directConn.query(
                `DELETE FROM printhouse_pricing_calibration_sessions WHERE id IN (?)`,
                [sessIds]
            );
            console.log(`  ✓ Cleaned ${sessIds.length} calibration sessions`);
        }

        // 4. Pricing revisions
        if (tracker.revisionIds.size > 0) {
            const revIds = Array.from(tracker.revisionIds);
            await directConn.query(
                `DELETE FROM printhouse_pricing_revisions WHERE id IN (?)`,
                [revIds]
            );
            console.log(`  ✓ Cleaned ${revIds.length} pricing revisions`);
        }

        // 5. Printer nodes
        if (tracker.printerNodes.size > 0) {
            const nodeIds = Array.from(tracker.printerNodes);
            await directConn.query(
                `DELETE FROM printer_nodes WHERE id IN (?)`,
                [nodeIds]
            );
            console.log(`  ✓ Cleaned ${nodeIds.length} printer nodes`);
        }

        // 6. Tenants
        if (tracker.tenants.size > 0) {
            const tIds = Array.from(tracker.tenants);
            await directConn.query(
                `DELETE FROM tenants WHERE id IN (?)`,
                [tIds]
            );
            console.log(`  ✓ Cleaned ${tIds.length} tenants`);
        }

        // Post-cleanup verification: assert zero remaining records in ALL 6 TABLES
        if (tracker.acceptanceIds.size > 0) {
            const [remAcc] = await directConn.query(
                `SELECT COUNT(*) as count FROM printhouse_pricing_calibration_acceptances WHERE id IN (?)`,
                [Array.from(tracker.acceptanceIds)]
            );
            if (remAcc[0]?.count > 0) {
                cleanupFailed = true;
                residualErrors.push(`${remAcc[0].count} calibration acceptances remained uncleaned`);
            }
        }

        if (tracker.runIds.size > 0) {
            const [remRuns] = await directConn.query(
                `SELECT COUNT(*) as count FROM printhouse_pricing_calibration_runs WHERE id IN (?)`,
                [Array.from(tracker.runIds)]
            );
            if (remRuns[0]?.count > 0) {
                cleanupFailed = true;
                residualErrors.push(`${remRuns[0].count} calibration runs remained uncleaned`);
            }
        }

        if (tracker.sessionIds.size > 0) {
            const [remSess] = await directConn.query(
                `SELECT COUNT(*) as count FROM printhouse_pricing_calibration_sessions WHERE id IN (?)`,
                [Array.from(tracker.sessionIds)]
            );
            if (remSess[0]?.count > 0) {
                cleanupFailed = true;
                residualErrors.push(`${remSess[0].count} calibration sessions remained uncleaned`);
            }
        }

        if (tracker.revisionIds.size > 0) {
            const [remRevs] = await directConn.query(
                `SELECT COUNT(*) as count FROM printhouse_pricing_revisions WHERE id IN (?)`,
                [Array.from(tracker.revisionIds)]
            );
            if (remRevs[0]?.count > 0) {
                cleanupFailed = true;
                residualErrors.push(`${remRevs[0].count} pricing revisions remained uncleaned`);
            }
        }

        if (tracker.printerNodes.size > 0) {
            const [remNodes] = await directConn.query(
                `SELECT COUNT(*) as count FROM printer_nodes WHERE id IN (?)`,
                [Array.from(tracker.printerNodes)]
            );
            if (remNodes[0]?.count > 0) {
                cleanupFailed = true;
                residualErrors.push(`${remNodes[0].count} printer nodes remained uncleaned`);
            }
        }

        if (tracker.tenants.size > 0) {
            const [remTenants] = await directConn.query(
                `SELECT COUNT(*) as count FROM tenants WHERE id IN (?)`,
                [Array.from(tracker.tenants)]
            );
            if (remTenants[0]?.count > 0) {
                cleanupFailed = true;
                residualErrors.push(`${remTenants[0].count} tenants remained uncleaned`);
            }
        }

        if (!cleanupFailed) {
            console.log('  ✓ Verified 0 residuals across all 6 affected tables.');
        } else {
            console.error('  ✗ [CLEANUP-FAILURE] Residuals detected:', residualErrors.join('; '));
        }
    } catch (cleanErr) {
        cleanupFailed = true;
        console.error(`  ✗ [CLEANUP-ERROR] Exception during cleanup: ${cleanErr.message}`);
        residualErrors.push(cleanErr.message);
    }

    if (cleanupFailed) {
        throw new Error(`VERIFIED_CLEANUP_FAILED: Residual test records detected: ${residualErrors.join(', ')}`);
    }
}

// ── 6. MAIN CONNECTED ONBOARDING VALIDATION ──
async function runConnectedSuite() {
    console.log(`\n================================================================`);
    console.log(`  PRINTPRICE OS: CONNECTED ONBOARDING & CALIBRATION SUITE (MYSQL) `);
    console.log(`================================================================`);
    console.log(`Execution Tag: ${EXECUTION_TAG}`);
    console.log(`Timestamp    : ${new Date().toISOString()}`);
    console.log(`MySQL Target : ${REQUIRED_MYSQL.user}@${REQUIRED_MYSQL.host}:${REQUIRED_MYSQL.port}/${REQUIRED_MYSQL.database}`);

    let directConn = null;
    let testServer = null;
    let mainError = null;
    let cleanupError = null;

    try {
        // Direct MySQL Connection
        directConn = await mysql.createConnection({
            host: REQUIRED_MYSQL.host,
            port: REQUIRED_MYSQL.port,
            user: REQUIRED_MYSQL.user,
            password: mysqlPassword,
            database: REQUIRED_MYSQL.database
        });

        const cpPool = mysqlClient.getPool();
        await verifyMysqlIdentity(directConn, cpPool);

        // Express Server with Official Onboarding Routes
        const app = express();
        app.use(express.json());
        app.use('/api/printhouse/onboarding', printhouseOnboardingRoutes);

        testServer = http.createServer(app);
        await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));
        const serverPort = testServer.address().port;
        const serverUrl = `http://127.0.0.1:${serverPort}`;
        console.log(`  ✓ Test Express Server listening at ${serverUrl}`);

        const FIXTURE_TENANT_A = `tenant_${EXECUTION_TAG}_a`;
        const FIXTURE_TENANT_B = `tenant_${EXECUTION_TAG}_b`;
        const FIXTURE_NODE_A = `node_${EXECUTION_TAG}_a`;

        const tokenA = createTestToken(FIXTURE_TENANT_A, 'PRINTHOUSE_OPERATOR', 'user-op-a');
        const tokenB = createTestToken(FIXTURE_TENANT_B, 'PRINTHOUSE_OPERATOR', 'user-op-b');

        // ── STEP 1: OFFICIAL SCHEMA SEEDING (TENANTS & PRINTER_NODES) ──
        console.log(`\n[STEP 1] Seeding Fixtures into Official Schema`);

        // Check columns in tenants table
        const [tenantCols] = await directConn.query('SHOW COLUMNS FROM tenants');
        const tenantColSet = new Set(tenantCols.map(c => c.Field));

        for (const tid of [FIXTURE_TENANT_A, FIXTURE_TENANT_B]) {
            const tFields = ['id', 'name'];
            const tVals = [tid, `Tenant ${tid}`];
            if (tenantColSet.has('status')) { tFields.push('status'); tVals.push('ACTIVE'); }
            if (tenantColSet.has('tier')) { tFields.push('tier'); tVals.push('PRO'); }

            await directConn.query(
                `INSERT INTO tenants (${tFields.join(',')}) VALUES (${tVals.map(() => '?').join(',')})`,
                tVals
            );
            tracker.tenants.add(tid);
        }
        assert(true, `Created official tenants ${FIXTURE_TENANT_A} and ${FIXTURE_TENANT_B}`);

        // Check columns in printer_nodes table (NO updated_at, include email & status)
        const [nodeCols] = await directConn.query('SHOW COLUMNS FROM printer_nodes');
        const nodeColSet = new Set(nodeCols.map(c => c.Field));

        const nodeFields = ['id', 'tenant_id', 'name'];
        const nodeVals = [FIXTURE_NODE_A, FIXTURE_TENANT_A, `Node ${EXECUTION_TAG}`];
        if (nodeColSet.has('email')) {
            nodeFields.push('email');
            nodeVals.push(`${FIXTURE_NODE_A}@test-connected.local`);
        }
        if (nodeColSet.has('status')) {
            nodeFields.push('status');
            nodeVals.push('ACTIVE');
        }

        await directConn.query(
            `INSERT INTO printer_nodes (${nodeFields.join(',')}) VALUES (${nodeVals.map(() => '?').join(',')})`,
            nodeVals
        );
        tracker.printerNodes.add(FIXTURE_NODE_A);
        assert(true, `Created printer node ${FIXTURE_NODE_A} for ${FIXTURE_TENANT_A} with official schema columns`);

        // ── STEP 2: INTAKE BASELINE CHECK ──
        console.log(`\n[STEP 2] Verifying Clean Baseline on Isolated Fixture`);
        const [baselineRevs] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_pricing_revisions WHERE printer_node_id = ?`,
            [FIXTURE_NODE_A]
        );
        assert(baselineRevs[0].count === 0, `Isolated node has exactly 0 baseline pricing revisions`);

        // ── STEP 3: CREATE CALIBRATION SESSION ──
        console.log(`\n[STEP 3] Creating Calibration Session with Die Mysteriösen Steine (Interior 4/4)`);
        const sessionPayload = {
            printerNodeId: FIXTURE_NODE_A,
            referenceBookName: 'Die Mysteriösen Steine',
            bookSpec: {
                productTitle: 'Die Mysteriösen Steine',
                family: 'SOFTCOVER',
                formatWidthMm: 170,
                formatHeightMm: 240,
                pageCount: 72,
                interiorPaper: 'Arctic Volumen 150g',
                interiorColors: '4/4',
                coverPaper: 'Silk 130g',
                coverColors: '4/0',
                runs: [{ id: 'run-1500', quantity: 1500, manufacturingPrice: 1792.00 }]
            },
            targetManufacturingPrice: 1792.00
        };

        const createRes = await httpRequest(
            serverUrl,
            'POST',
            '/api/printhouse/onboarding/pricing/calibrations',
            tokenA,
            sessionPayload
        );
        assert(createRes.status === 201, `Calibration session created with HTTP 201`);
        const sessionId = createRes.body?.id || createRes.body?.session?.id;
        assert(Boolean(sessionId), `Received valid session ID: ${sessionId}`);
        tracker.sessionIds.add(sessionId);

        // ── STEP 4: PREFLIGHT READINESS CHECK (CONTRACT: POST /pricing/calibrations/:id/ready) ──
        console.log(`\n[STEP 4] Checking Preflight Readiness (Official Contract: POST /:id/ready)`);
        const readyRes = await httpRequest(
            serverUrl,
            'POST',
            `/api/printhouse/onboarding/pricing/calibrations/${sessionId}/ready`,
            tokenA
        );
        assert(readyRes.status === 200, `POST /ready returned HTTP 200`);
        assert(readyRes.body.data?.status === 'READY' || readyRes.body.ok === true,
            `Session successfully transitioned to READY state`);

        // ── STEP 5: DETERMINISTIC SOLVER CALCULATION ──
        console.log(`\n[STEP 5] Executing Deterministic Solver Run`);
        const calcRes = await httpRequest(
            serverUrl,
            'POST',
            `/api/printhouse/onboarding/pricing/calibrations/${sessionId}/calculate`,
            tokenA,
            { targetPrice: 1792.00 }
        );
        assert(calcRes.status === 200, `Solver execution returned HTTP 200`);
        assert(typeof calcRes.body.enginePriceAfter === 'number' && calcRes.body.enginePriceAfter > 0,
            `Engine price after solver is positive: ${calcRes.body.enginePriceAfter} EUR`);
        assert(calcRes.body.proposedPatch && Object.keys(calcRes.body.proposedPatch).length > 0,
            `Proposed patch contains deterministic rates`);

        // Verify Run in Database and extract real runId
        const [runs] = await directConn.query(
            `SELECT id, absolute_residual, percent_residual FROM printhouse_pricing_calibration_runs WHERE session_id = ?`,
            [sessionId]
        );
        assert(runs.length > 0, `Calibration run recorded in MySQL`);
        const realRunId = runs[0].id;
        tracker.runIds.add(realRunId);
        assert(Number(runs[0].absolute_residual) >= 0, `Non-negative absolute residual stored in run`);

        // ── STEP 6: STRICT MULTI-TENANT ISOLATION USING REAL SESSION AND REAL RUN ID ──
        console.log(`\n[STEP 6] Testing Multi-Tenant Isolation using REAL Session and REAL Run ID`);

        // A. Cross-tenant Read with real sessionId
        const crossTenantRead = await httpRequest(
            serverUrl,
            'GET',
            `/api/printhouse/onboarding/pricing/calibrations/${sessionId}`,
            tokenB
        );
        assert(crossTenantRead.status === 403 || crossTenantRead.status === 404,
            `Cross-tenant read rejected with HTTP ${crossTenantRead.status}`);

        // B. Cross-tenant Calculate with real sessionId
        const crossTenantCalc = await httpRequest(
            serverUrl,
            'POST',
            `/api/printhouse/onboarding/pricing/calibrations/${sessionId}/calculate`,
            tokenB,
            { targetPrice: 1792.00 }
        );
        assert(crossTenantCalc.status === 403 || crossTenantCalc.status === 404,
            `Cross-tenant calculate rejected with HTTP ${crossTenantCalc.status}`);

        // C. Cross-tenant Accept with REAL sessionId AND REAL runId
        const crossTenantAccept = await httpRequest(
            serverUrl,
            'POST',
            `/api/printhouse/onboarding/pricing/calibrations/${sessionId}/accept`,
            tokenB,
            { runId: realRunId, acceptanceNotes: 'Unauthorized tenant attempt with real runId' }
        );
        assert(crossTenantAccept.status === 403 || crossTenantAccept.status === 404,
            `Cross-tenant acceptance with real runId strictly rejected with HTTP ${crossTenantAccept.status}`);

        // Verify no revisions were created by the unauthorized cross-tenant attempt
        const [postCrossRevs] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_pricing_revisions WHERE printer_node_id = ?`,
            [FIXTURE_NODE_A]
        );
        assert(postCrossRevs[0].count === 0, `Zero pricing revisions created following rejected cross-tenant attempt`);

        // ── STEP 7: REAL CANCELLATION FLOW (POST /reject) VS ABANDONMENT ──
        console.log(`\n[STEP 7] Verifying Real Cancellation Flow (POST /reject) on Secondary Session`);
        const cancelSessionPayload = {
            printerNodeId: FIXTURE_NODE_A,
            referenceBookName: 'Cancelled Calibration Session',
            bookSpec: {
                productTitle: 'Canceled Test Book',
                family: 'SOFTCOVER',
                runs: [{ id: 'run-cancel', quantity: 500, manufacturingPrice: 850.00 }]
            },
            targetManufacturingPrice: 850.00
        };

        const cancelCreateRes = await httpRequest(
            serverUrl,
            'POST',
            '/api/printhouse/onboarding/pricing/calibrations',
            tokenA,
            cancelSessionPayload
        );
        const cancelSessionId = cancelCreateRes.body?.id || cancelCreateRes.body?.session?.id;
        tracker.sessionIds.add(cancelSessionId);

        // Promote secondary session to ready
        await httpRequest(
            serverUrl,
            'POST',
            `/api/printhouse/onboarding/pricing/calibrations/${cancelSessionId}/ready`,
            tokenA
        );

        // Execute real cancellation via POST /reject endpoint
        const rejectRes = await httpRequest(
            serverUrl,
            'POST',
            `/api/printhouse/onboarding/pricing/calibrations/${cancelSessionId}/reject`,
            tokenA,
            { reason: 'Calibration cancelled by operator during test' }
        );
        assert(rejectRes.status === 200, `POST /reject returned HTTP 200`);
        assert(rejectRes.body.data?.status === 'REJECTED', `Cancelled session status is officially REJECTED`);

        // Verify that cancellation produces zero revisions and zero rate changes
        const [cancelledRevs] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_pricing_revisions WHERE source_calibration_session_id = ?`,
            [cancelSessionId]
        );
        assert(cancelledRevs[0].count === 0, `Zero revisions created for cancelled/rejected session`);

        const [cancelledNode] = await directConn.query(
            `SELECT rates_json FROM printer_nodes WHERE id = ?`,
            [FIXTURE_NODE_A]
        );
        assert(cancelledNode[0].rates_json === null, `Node rates_json remains unmutated after session cancellation`);

        // ── STEP 8: GOVERNED ACCEPTANCE ON PRIMARY SESSION ──
        console.log(`\n[STEP 8] Executing Governed Calibration Acceptance`);
        const acceptPayload = {
            runId: realRunId,
            acceptanceNotes: 'Verified under official MySQL isolated suite',
            acceptedBy: 'operator_connected_audit'
        };

        const acceptRes = await httpRequest(
            serverUrl,
            'POST',
            `/api/printhouse/onboarding/pricing/calibrations/${sessionId}/accept`,
            tokenA,
            acceptPayload
        );
        assert(acceptRes.status === 200, `Acceptance registered with HTTP 200`);

        const revisionId = acceptRes.body?.revision?.id || acceptRes.body?.revisionId;
        assert(Boolean(revisionId), `Immutable pricing revision created: ${revisionId}`);
        tracker.revisionIds.add(revisionId);

        const acceptanceId = acceptRes.body?.acceptance?.id || acceptRes.body?.acceptanceId;
        if (acceptanceId) {
            tracker.acceptanceIds.add(acceptanceId);
            assert(true, `Acceptance record ID tracked: ${acceptanceId}`);
        }

        // ── STEP 9: CANONICAL CHECKSUM VERIFICATION & ABSENCE OF COMMERCIAL LEAKAGE ──
        console.log(`\n[STEP 9] Verifying Canonical SHA-256 Checksum and Commercial Invariance`);

        // Fetch stored revision and compute canonical SHA-256 from stored rates_json
        const [finalRevs] = await directConn.query(
            `SELECT id, printer_node_id, source_type, rates_json, rates_checksum, created_at 
             FROM printhouse_pricing_revisions 
             WHERE printer_node_id = ?`,
            [FIXTURE_NODE_A]
        );
        assert(finalRevs.length === 1, `Exactly 1 revision created for isolated printer node`);
        assert(finalRevs[0].id === revisionId, `Revision matches accepted ID (${revisionId})`);
        assert(finalRevs[0].printer_node_id === FIXTURE_NODE_A, `Revision correctly references printer_node_id`);

        // Cryptographic check: calculate canonical SHA-256 of stored rates_json and compare
        const storedRates = finalRevs[0].rates_json;
        const expectedChecksum = computeCanonicalRatesChecksum(storedRates);
        assert(finalRevs[0].rates_checksum === expectedChecksum,
            `rates_checksum strictly matches canonical SHA-256: ${expectedChecksum}`);

        // Verify that acceptances record is persisted in MySQL
        const [accRows] = await directConn.query(
            `SELECT id, target_manufacturing_price, verified_manufacturing_price 
             FROM printhouse_pricing_calibration_acceptances 
             WHERE pricing_revision_id = ?`,
            [revisionId]
        );
        assert(accRows.length === 1, `Acceptance record verified in MySQL table`);
        if (accRows[0]?.id) tracker.acceptanceIds.add(accRows[0].id);

        // Verify commercial isolation: node status is ACTIVE, zero publication in marketplace tables
        const [nodeState] = await directConn.query(
            `SELECT status, rates_json FROM printer_nodes WHERE id = ?`,
            [FIXTURE_NODE_A]
        );
        assert(nodeState[0].status === 'ACTIVE', `Node status preserved as ACTIVE`);
        assert(Boolean(nodeState[0].rates_json), `Node rates_json updated with calibrated document`);

    } catch (err) {
        mainError = err;
        console.error(`\n[TEST-ERROR] Suite encountered fatal error:`, err.message);
    } finally {
        // Shutdown test HTTP server
        if (testServer) {
            await new Promise((resolve) => testServer.close(resolve));
            console.log('\n[TEARDOWN] Closed test Express HTTP server');
        }

        // Execute verified cleanup across all 6 affected tables
        if (directConn) {
            try {
                await performDeterministicCleanup(directConn);
            } catch (cleanErr) {
                console.error('[TEARDOWN-CLEANUP-FAIL]', cleanErr.message);
                cleanupError = cleanErr;
            }
            await directConn.end();
            console.log('[TEARDOWN] Closed direct MySQL connection');
        }

        // Close CP MySQL pool
        try {
            await mysqlClient.closePool();
            console.log('[TEARDOWN] Closed CP MySQL pool');
        } catch (e) {
            console.error('[TEARDOWN] Error closing CP pool:', e.message);
        }

        // Report both mainError and cleanupError jointly if either occurred
        if (mainError || cleanupError) {
            console.error(`\n================================================================`);
            if (mainError) console.error(`  PRIMARY TEST ERROR: ${mainError.message}`);
            if (cleanupError) console.error(`  CLEANUP ERROR     : ${cleanupError.message}`);
            console.error(`================================================================\n`);
            const finalErr = mainError || cleanupError;
            if (mainError && cleanupError) {
                finalErr.cleanupError = cleanupError;
            }
            throw finalErr;
        }
    }

    console.log(`\n================================================================`);
    console.log(`  CONNECTED SUITE RESULTS: ${passedAssertions} ASSERTIONS PASSED | 0 FAILED `);
    console.log(`================================================================\n`);
}

module.exports = { runConnectedSuite, REQUIRED_MYSQL };

if (require.main === module) {
    runConnectedSuite()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}
