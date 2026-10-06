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
 *    - `printer_nodes` seeded with initial valid rates matrix fixture (rates_json ONLY; no nonexistent rates_checksum column).
 *    - Creates real users in `control_users` and trackable authenticated sessions in `user_sessions` via `userSessionService.createSession`.
 *    - Issues standard JWTs (sub, jti, tenant_id, role, issuer, audience) validating `userSessionService.validateSession` contract.
 *    - `printhouse_pricing_revisions` queries by printer_node_id and rates_checksum (not printhouse_id/version/checksum).
 *    - Tracks and cleans `printhouse_pricing_calibration_acceptances`.
 * 5. Unique IDs per execution. Tracks all created IDs and performs automatic orphan discovery by execution tenant.
 *    Deterministic teardown in strict foreign-key order across all 8 tables:
 *    `acceptances` -> `revisions` -> `runs` -> `sessions` -> `user_sessions` -> `control_users` -> `printer_nodes` -> `tenants`.
 *    Cleanup verification checks zero residuals in all 8 affected tables; cleanup failure exits with code 1.
 * 6. Effective scope:
 *    - Official routes: POST for /ready, POST for /reject (cancellation), POST for /calculate, POST for /accept.
 *    - Strict cross-tenant isolation testing using a REAL session and REAL run ID belonging to Tenant A.
 *    - Real cancellation flow: tests POST /reject, verifying status 'REJECTED' and rates matching initial baseline.
 *    - Commercial isolation: asserts zero publications in `bpe_pricing_publications` and zero activation grants in `printhouse_activation_grants`
 *      (including production_dispatch_allowed, marketplace_visible, job_routing_allowed, live_quoting_allowed) without silent error catchers.
 *    - Verifies cryptographic integrity of rates_checksum by computing canonical SHA-256 exclusively from stored rates_json.
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
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'ppos:control';
process.env.JWT_ISSUER = process.env.JWT_ISSUER || 'https://auth.printprice.pro';

const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

// Import Control Plane services with verified clean environment
const mysqlClient = require('../src/api/services/mysqlClient');
const userSessionService = require('../src/api/services/userSessionService');
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

// ── 3. CANONICAL INDUSTRIAL RATES FIXTURE & CONSUMED KEYS DOCUMENTATION ──
// Strictly compatible with @ppos/pricing-engine and src/api/services/buildPriceCalibrationAdapter.js.
// Documented keys consumed by canonical forward pricing engine and inverse pricing solver:
// - Interior print setup & variable runs: interior_full_colour_fixed, interior_full_colour_var (by signature size '16p', '32p', etc.)
// - Cover print setup & variable runs: cover_fixed_by_colours, cover_var_per_1000_by_colours (by color count '1'..'5')
// - Lamination setup & variable runs: lam_fixed, lam_var_per_1000 ('matt', 'gloss', 'varnish')
// - Binding setup & variable runs: binding_pb_fixed_by_sections, binding_pb_var_per_1000_by_sections (by section count '1'..'30')
// - Paper setup waste sheets: paper_interior_fixed_by_colours, paper_cover_fixed_by_colours
// - Paper run waste sheets per 1000: paper_interior_var_per_1000_by_colours, paper_cover_var_per_1000_by_colours
// - Paper binding waste percentage: paper_waste_for_binding ('pb', 'ss', 'hc', etc.)
// - Paper prices per kg: paper_price_interior_by_kilo ('offset', 'mc', 'lux', etc.), paper_price_cover_by_kilo ('mc', 'artboard', etc.)
// - Zero ignored / dummy parameters (eliminates former synthetic hourly/machine placeholders).
const INITIAL_VALID_RATES = {
    interior_one_colour_fixed: { '32p': 30, '16p': 18, '8p': 10, '4p': 6 },
    interior_one_colour_var: { '32p': 12, '16p': 7, '8p': 4, '4p': 2 },
    interior_two_colour_fixed: { '32p': 50, '16p': 30, '8p': 18, '4p': 10 },
    interior_two_colour_var: { '32p': 20, '16p': 12, '8p': 7, '4p': 4 },
    interior_full_colour_fixed: { '32p': 80, '16p': 48, '8p': 28, '4p': 16 },
    interior_full_colour_var: { '32p': 35, '16p': 20, '8p': 12, '4p': 6 },
    cover_fixed_by_colours: { '1': 25, '2': 35, '3': 50, '4': 65, '5': 80 },
    cover_var_per_1000_by_colours: { '1': 10, '2': 14, '3': 20, '4': 26, '5': 32 },
    lam_fixed: { 'matt': 40, 'gloss': 40, 'varnish': 30 },
    lam_var_per_1000: { 'matt': 15, 'gloss': 15, 'varnish': 10 },
    uv_varnish: { fixed: 50, var: 20 },
    pms_cover: { fixed: 30, var: 12 },
    pms_interior_fixed: 25,
    binding_pb_fixed_by_sections: {
        '1': 80, '2': 85, '3': 90, '4': 95, '5': 100, '6': 105, '7': 110, '8': 115,
        '9': 120, '10': 125, '11': 130, '12': 135, '13': 140, '14': 145, '15': 150,
        '16': 155, '17': 160, '18': 165, '19': 170, '20': 175, '21': 180, '22': 185,
        '23': 190, '24': 195, '25': 200, '26': 205, '27': 210, '28': 215, '29': 220, '30': 225
    },
    binding_pb_var_per_1000_by_sections: {
        '1': 30, '2': 32, '3': 34, '4': 36, '5': 38, '6': 40, '7': 42, '8': 44,
        '9': 46, '10': 48, '11': 50, '12': 52, '13': 54, '14': 56, '15': 58,
        '16': 60, '17': 62, '18': 64, '19': 66, '20': 68, '21': 70, '22': 72,
        '23': 74, '24': 76, '25': 78, '26': 80, '27': 82, '28': 84, '29': 86, '30': 88
    },
    binding_ss_fixed_by_sections: { '1': 40, '2': 43, '3': 46, '4': 49, '5': 52 },
    binding_ss_var_per_1000_by_sections: { '1': 15, '2': 16, '3': 17, '4': 18, '5': 19 },
    binding_ts_fixed_by_sections: { '1': 100, '2': 106, '3': 112, '4': 118, '5': 124 },
    binding_ts_var_per_1000_by_sections: { '1': 40, '2': 43, '3': 46, '4': 49, '5': 52 },
    binding_hc_fixed_by_sections: { '1': 140, '2': 148, '3': 156, '4': 164, '5': 172 },
    binding_hc_var_per_1000_by_sections: { '1': 55, '2': 59, '3': 63, '4': 67, '5': 71 },
    paper_interior_fixed_by_colours: { 'one': 5, 'two': 6, 'full': 8 },
    paper_interior_var_per_1000_by_colours: { 'one': 80, 'two': 95, 'full': 120 },
    paper_cover_fixed_by_colours: { 'one': 4, 'two': 5, 'full': 6 },
    paper_cover_var_per_1000_by_colours: { 'one': 60, 'two': 75, 'full': 95 },
    paper_waste_for_binding: { 'pb': 5, 'ss': 3, 'sc': 5, 'hc': 6, 'wo': 4, 'sp': 4 },
    paper_price_interior_by_kilo: { 'offset': 1.2, 'mc': 1.45, 'lux': 1.8, 'munken': 2.1, 'other': 1.2 },
    paper_price_cover_by_kilo: { 'mc': 1.5, 'artboard': 1.65, 'offset': 1.2, 'wfmc': 1.55, 'other': 1.5 }
};
const INITIAL_RATES_JSON_STR = canonicalStringify(INITIAL_VALID_RATES);
const INITIAL_RATES_CHECKSUM = computeCanonicalRatesChecksum(INITIAL_VALID_RATES);

const EXECUTION_TAG = 'test_onb_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
const tracker = {
    tenants: new Set(),
    printerNodes: new Set(),
    controlUserIds: new Set(),
    userSessionIds: new Set(),
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

/**
 * Creates a real authenticated user in control_users, a trackable server session
 * in user_sessions via userSessionService.createSession, and issues a signed Bearer JWT
 * that strictly satisfies src/api/middleware/auth.js (sub, tenant_id, role, jti, audience, issuer).
 *
 * PRECONDITION & AUTHENTICITY CONTRACT:
 * - Table `control_users` MUST exist in MySQL target; if absent, execution aborts immediately.
 * - Insertion into `control_users` MUST return a valid numeric `insertId`.
 * - Zero fallback to synthetic or invented user IDs.
 */
async function createRealUserAndSession(directConn, tenantId, role = 'PRINTHOUSE_OPERATOR', userTag = 'op') {
    const email = `${userTag}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}@test-connected.local`;
    const passwordHash = await bcrypt.hash('HarnessSecurePass2026!', 10);

    // 1. Verify existence of control_users. Strictly abort if table is missing.
    const [userTableCheck] = await directConn.query("SHOW TABLES LIKE 'control_users'");
    if (!userTableCheck || userTableCheck.length === 0) {
        throw new Error('ABORT_PRECONDITION_FAILED: Required table "control_users" does not exist in target database. Harness strictly requires authentic user registration; fallback synthetic identities are prohibited.');
    }

    const [insertRes] = await directConn.query(
        `INSERT INTO control_users (tenant_id, email, password_hash, role, status, created_at)
         VALUES (?, ?, ?, ?, 'ACTIVE', NOW())`,
        [tenantId, email, passwordHash, role]
    );

    const insertId = insertRes.insertId || (Array.isArray(insertRes) && insertRes[0]?.insertId);
    if (!insertId) {
        throw new Error('ABORT_INSERT_FAILED: Failed to obtain valid auto-increment insertId from control_users insertion');
    }
    const userId = String(insertId);
    tracker.controlUserIds.add(insertId);

    // 2. Real session creation via official userSessionService.createSession
    const session = await userSessionService.createSession({
        userId,
        tenantId,
        role,
        ipAddress: '127.0.0.1',
        userAgent: 'PPOS-Connected-Harness/1.0',
        inactivityMinutes: 60,
        absoluteHours: 24
    });
    tracker.userSessionIds.add(session.sessionId);

    // 3. Issue authentic JWT with standard claims matching auth.js / requireAdmin
    const token = jwt.sign(
        {
            sub: userId,
            tenant_id: tenantId,
            role,
            jti: session.sessionId,
            email
        },
        JWT_SECRET,
        {
            issuer: process.env.JWT_ISSUER,
            audience: process.env.JWT_AUDIENCE,
            expiresIn: '1h'
        }
    );

    return { token, sessionId: session.sessionId, userId, tenantId, email };
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

// ── 5. DETERMINISTIC CLEANUP IN STRICT FK ORDER ACROSS ALL 8 TABLES ──
// Documented MySQL Foreign Keys & Dependency Order (Migrations 143, 146, 147, 148, 158, 160):
// 1. printhouse_pricing_calibration_acceptances:
//    - FK (pricing_revision_id) REFERENCES printhouse_pricing_revisions(id) ON DELETE CASCADE
//    - FK (calibration_run_id) REFERENCES printhouse_pricing_calibration_runs(id) ON DELETE CASCADE
//    - FK (calibration_session_id) REFERENCES printhouse_pricing_calibration_sessions(id) ON DELETE CASCADE
//    - FK (printer_node_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
//    - FK (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
// 2. printhouse_pricing_revisions:
//    - FK (printer_node_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
//    - FK (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
//    - Logical references to source_calibration_run_id and source_calibration_session_id
//      (MUST be purged BEFORE runs and sessions to prevent referential inconsistencies)
// 3. printhouse_pricing_calibration_runs:
//    - FK (calibration_session_id) REFERENCES printhouse_pricing_calibration_sessions(id) ON DELETE CASCADE
//    - FK (printer_node_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
//    - FK (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
// 4. printhouse_pricing_calibration_sessions:
//    - FK (printer_node_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
//    - FK (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
// 5. user_sessions:
//    - Scoped to tenant_id; must be purged before tenants
// 6. control_users:
//    - Real user accounts created for test tenants; must be purged before tenants
// 7. printer_nodes:
//    - FK (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
// 8. tenants:
//    - Root tenant entity
async function performDeterministicCleanup(directConn) {
    console.log('\n[CLEANUP] Discovering and purging tracked test fixtures across all 8 affected tables...');
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
                    `SELECT id FROM printhouse_pricing_calibration_runs WHERE calibration_session_id IN (?)`,
                    [sessionList]
                );
                foundRuns.forEach(r => tracker.runIds.add(r.id));
            }

            const [foundUserSessions] = await directConn.query(
                `SELECT id FROM user_sessions WHERE tenant_id IN (?)`,
                [tenantList]
            );
            foundUserSessions.forEach(r => tracker.userSessionIds.add(r.id));

            const [foundUsers] = await directConn.query(
                `SELECT id FROM control_users WHERE tenant_id IN (?)`,
                [tenantList]
            );
            foundUsers.forEach(r => tracker.controlUserIds.add(r.id));

            const [foundNodes] = await directConn.query(
                `SELECT id FROM printer_nodes WHERE tenant_id IN (?)`,
                [tenantList]
            );
            foundNodes.forEach(r => tracker.printerNodes.add(r.id));
        }

        // Teardown step: delete in strict foreign key dependency order
        // 1. Calibration acceptances (references revisions, runs, sessions, nodes, tenants)
        if (tracker.acceptanceIds.size > 0) {
            const accIds = Array.from(tracker.acceptanceIds);
            await directConn.query(
                `DELETE FROM printhouse_pricing_calibration_acceptances WHERE id IN (?)`,
                [accIds]
            );
            console.log(`  ✓ Cleaned ${accIds.length} calibration acceptances`);
        }

        // 2. Pricing revisions (BEFORE runs and sessions)
        if (tracker.revisionIds.size > 0) {
            const revIds = Array.from(tracker.revisionIds);
            await directConn.query(
                `DELETE FROM printhouse_pricing_revisions WHERE id IN (?)`,
                [revIds]
            );
            console.log(`  ✓ Cleaned ${revIds.length} pricing revisions`);
        }

        // 3. Calibration runs (references sessions, nodes, tenants)
        if (tracker.runIds.size > 0) {
            const runIds = Array.from(tracker.runIds);
            await directConn.query(
                `DELETE FROM printhouse_pricing_calibration_runs WHERE id IN (?)`,
                [runIds]
            );
            console.log(`  ✓ Cleaned ${runIds.length} calibration runs`);
        }

        // 4. Calibration sessions (references nodes, tenants)
        if (tracker.sessionIds.size > 0) {
            const sessIds = Array.from(tracker.sessionIds);
            await directConn.query(
                `DELETE FROM printhouse_pricing_calibration_sessions WHERE id IN (?)`,
                [sessIds]
            );
            console.log(`  ✓ Cleaned ${sessIds.length} calibration sessions`);
        }

        // 5. User sessions (references tenant boundary)
        if (tracker.userSessionIds.size > 0) {
            const uSessIds = Array.from(tracker.userSessionIds);
            await directConn.query(
                `DELETE FROM user_sessions WHERE id IN (?)`,
                [uSessIds]
            );
            console.log(`  ✓ Cleaned ${uSessIds.length} user sessions`);
        }

        // 6. Control users (real user records created for test tenants)
        if (tracker.controlUserIds.size > 0) {
            const uIds = Array.from(tracker.controlUserIds);
            await directConn.query(
                `DELETE FROM control_users WHERE id IN (?)`,
                [uIds]
            );
            console.log(`  ✓ Cleaned ${uIds.length} control users`);
        }

        // 7. Printer nodes (references tenants)
        if (tracker.printerNodes.size > 0) {
            const nodeIds = Array.from(tracker.printerNodes);
            await directConn.query(
                `DELETE FROM printer_nodes WHERE id IN (?)`,
                [nodeIds]
            );
            console.log(`  ✓ Cleaned ${nodeIds.length} printer nodes`);
        }

        // 8. Tenants (root entity)
        if (tracker.tenants.size > 0) {
            const tIds = Array.from(tracker.tenants);
            await directConn.query(
                `DELETE FROM tenants WHERE id IN (?)`,
                [tIds]
            );
            console.log(`  ✓ Cleaned ${tIds.length} tenants`);
        }

        // Post-cleanup verification: assert zero remaining records in ALL 8 TABLES
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

        if (tracker.userSessionIds.size > 0) {
            const [remUserSess] = await directConn.query(
                `SELECT COUNT(*) as count FROM user_sessions WHERE id IN (?)`,
                [Array.from(tracker.userSessionIds)]
            );
            if (remUserSess[0]?.count > 0) {
                cleanupFailed = true;
                residualErrors.push(`${remUserSess[0].count} user sessions remained uncleaned`);
            }
        }

        if (tracker.controlUserIds.size > 0) {
            const [remUsers] = await directConn.query(
                `SELECT COUNT(*) as count FROM control_users WHERE id IN (?)`,
                [Array.from(tracker.controlUserIds)]
            );
            if (remUsers[0]?.count > 0) {
                cleanupFailed = true;
                residualErrors.push(`${remUsers[0].count} control users remained uncleaned`);
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
            console.log('  ✓ Verified 0 residuals across all 8 affected tables.');
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

        // ── STEP 1: OFFICIAL SCHEMA SEEDING (TENANTS, PRINTER_NODES, USERS & AUTH SESSIONS) ──
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

        // Check columns in printer_nodes table (NO updated_at, include email, status & initial valid rates_json ONLY)
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
        if (nodeColSet.has('rates_json')) {
            nodeFields.push('rates_json');
            nodeVals.push(INITIAL_RATES_JSON_STR);
        }

        await directConn.query(
            `INSERT INTO printer_nodes (${nodeFields.join(',')}) VALUES (${nodeVals.map(() => '?').join(',')})`,
            nodeVals
        );
        tracker.printerNodes.add(FIXTURE_NODE_A);
        assert(true, `Created printer node ${FIXTURE_NODE_A} for ${FIXTURE_TENANT_A} with initial valid rates fixture`);

        // Generate authentic server sessions and valid JWTs with real user accounts
        const authA = await createRealUserAndSession(directConn, FIXTURE_TENANT_A, 'PRINTHOUSE_OPERATOR', 'user_op_a');
        const authB = await createRealUserAndSession(directConn, FIXTURE_TENANT_B, 'PRINTHOUSE_OPERATOR', 'user_op_b');
        const tokenA = authA.token;
        const tokenB = authB.token;

        // Accredited contract validation: userSessionService.validateSession() positive checks
        const sessionCheckA = await userSessionService.validateSession(authA.sessionId, FIXTURE_TENANT_A, authA.userId);
        assert(sessionCheckA.valid === true, `Session A tracked in user_sessions and validated with middleware contract`);
        const sessionCheckB = await userSessionService.validateSession(authB.sessionId, FIXTURE_TENANT_B, authB.userId);
        assert(sessionCheckB.valid === true, `Session B tracked in user_sessions and validated with middleware contract`);

        // Accredited contract validation: userSessionService.validateSession() negative & boundary checks
        const crossTenantCheck = await userSessionService.validateSession(authA.sessionId, FIXTURE_TENANT_B, authA.userId);
        assert(crossTenantCheck.valid === false && crossTenantCheck.reason === 'SESSION_TENANT_MISMATCH',
            `validateSession strictly rejects tenant mismatch (SESSION_TENANT_MISMATCH)`);

        const crossUserCheck = await userSessionService.validateSession(authA.sessionId, FIXTURE_TENANT_A, 'non-existent-user-id');
        assert(crossUserCheck.valid === false && crossUserCheck.reason === 'SESSION_USER_MISMATCH',
            `validateSession strictly rejects user mismatch (SESSION_USER_MISMATCH)`);

        const missingSessionCheck = await userSessionService.validateSession('non-existent-session-id', FIXTURE_TENANT_A, authA.userId);
        assert(missingSessionCheck.valid === false && missingSessionCheck.reason === 'SESSION_NOT_FOUND',
            `validateSession strictly rejects non-existent session (SESSION_NOT_FOUND)`);

        // ── STEP 2: INTAKE BASELINE CHECK ──
        console.log(`\n[STEP 2] Verifying Baseline Rates on Isolated Fixture`);
        const [baselineRevs] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_pricing_revisions WHERE printer_node_id = ?`,
            [FIXTURE_NODE_A]
        );
        assert(baselineRevs[0].count === 0, `Isolated node has exactly 0 baseline pricing revisions`);

        // Query rates_json exclusively (NO nonexistent printer_nodes.rates_checksum column)
        const [baselineNode] = await directConn.query(
            `SELECT rates_json FROM printer_nodes WHERE id = ?`,
            [FIXTURE_NODE_A]
        );
        assert(baselineNode.length === 1, `Printer node ${FIXTURE_NODE_A} found in database`);
        const baselineChecksum = computeCanonicalRatesChecksum(baselineNode[0].rates_json);
        assert(
            baselineChecksum === INITIAL_RATES_CHECKSUM,
            `Baseline rates strictly match initial valid rates fixture (${INITIAL_RATES_CHECKSUM})`
        );

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
            `SELECT id, absolute_residual, percent_residual FROM printhouse_pricing_calibration_runs WHERE calibration_session_id = ?`,
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

        // Verify node rates remain strictly untouched and match INITIAL_VALID_RATES
        // Query rates_json exclusively (NO nonexistent printer_nodes.rates_checksum column)
        const [postCrossNode] = await directConn.query(
            `SELECT rates_json FROM printer_nodes WHERE id = ?`,
            [FIXTURE_NODE_A]
        );
        const postCrossChecksum = computeCanonicalRatesChecksum(postCrossNode[0].rates_json);
        assert(
            postCrossChecksum === INITIAL_RATES_CHECKSUM,
            `Printer node rates strictly unchanged and identical to initial baseline after cross-tenant attempt`
        );

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

        // Query rates_json exclusively (NO nonexistent printer_nodes.rates_checksum column)
        const [cancelledNode] = await directConn.query(
            `SELECT rates_json FROM printer_nodes WHERE id = ?`,
            [FIXTURE_NODE_A]
        );
        const cancelledChecksum = computeCanonicalRatesChecksum(cancelledNode[0].rates_json);
        assert(
            cancelledChecksum === INITIAL_RATES_CHECKSUM,
            `Node rates_json remains strictly identical to baseline fixture after cancellation (${INITIAL_RATES_CHECKSUM})`
        );

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

        // Verify commercial isolation with strict fail-closed assertion (ZERO .catch error swallowing):
        // A. Zero records in bpe_pricing_publications
        const [bpePubs] = await directConn.query(
            `SELECT COUNT(*) as count FROM bpe_pricing_publications WHERE tenant_id = ? OR printer_node_id = ?`,
            [FIXTURE_TENANT_A, FIXTURE_NODE_A]
        );
        assert(bpePubs[0].count === 0, `Zero records in bpe_pricing_publications (no commercial leakage)`);

        // B. Zero activation grants in printhouse_activation_grants (checking all commercial dispatch and visibility flags)
        const [grants] = await directConn.query(
            `SELECT COUNT(*) as count 
             FROM printhouse_activation_grants 
             WHERE tenant_id = ? AND (
                 marketplace_visible = 1 OR 
                 live_quoting_allowed = 1 OR 
                 job_routing_allowed = 1 OR 
                 production_dispatch_allowed = 1
             )`,
            [FIXTURE_TENANT_A]
        );
        assert(grants[0].count === 0, `Zero active marketplace, routing, or production dispatch grants in printhouse_activation_grants`);

        // Also assert total activation grants for the tenant is strictly 0
        const [totalGrants] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_activation_grants WHERE tenant_id = ?`,
            [FIXTURE_TENANT_A]
        );
        assert(totalGrants[0].count === 0, `Zero total records in printhouse_activation_grants for isolated tenant`);

        // C. Node status is ACTIVE and rates_json is updated with accepted calibrated rates
        const [nodeState] = await directConn.query(
            `SELECT status, rates_json FROM printer_nodes WHERE id = ?`,
            [FIXTURE_NODE_A]
        );
        assert(nodeState[0].status === 'ACTIVE', `Node status preserved as ACTIVE`);
        const finalNodeChecksum = computeCanonicalRatesChecksum(nodeState[0].rates_json);
        assert(finalNodeChecksum === expectedChecksum, `Node rates_json updated with calibrated document checksum: ${expectedChecksum}`);
        assert(finalNodeChecksum !== INITIAL_RATES_CHECKSUM, `Node rates_json successfully transitioned from baseline to calibrated`);

    } catch (err) {
        mainError = err;
        console.error(`\n[TEST-ERROR] Suite encountered fatal error:`, err.message);
    } finally {
        // Shutdown test HTTP server
        if (testServer) {
            await new Promise((resolve) => testServer.close(resolve));
            console.log('\n[TEARDOWN] Closed test Express HTTP server');
        }

        // Execute verified cleanup across all 8 affected tables
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
