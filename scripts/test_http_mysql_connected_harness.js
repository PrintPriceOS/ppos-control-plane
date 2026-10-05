/**
 * scripts/test_http_mysql_connected_harness.js
 * 
 * Mandatory Connected HTTP/MySQL 8 Integration Harness.
 * Strictly NO mocks, NO in-memory fallbacks.
 * Connects exclusively to isolated MySQL test instance: pposrcmdw0qdtest on 127.0.0.1:3306.
 */

// Set NODE_ENV to test before importing any routers or services
process.env.NODE_ENV = 'test';

const mysql = require('mysql2/promise');
const express = require('express');
const http = require('http');
const axios = require('axios');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

// 1. Clear URL environment variables to enforce discrete variables
delete process.env.DATABASE_URL;
delete process.env.MYSQL_URL;

const TEST_HOST = process.env.TEST_MYSQL_HOST || '127.0.0.1';
const TEST_PORT = parseInt(process.env.TEST_MYSQL_PORT || '3306', 10);
const TEST_DB = process.env.TEST_MYSQL_DATABASE || 'pposrcmdw0qdtest';
const TEST_USER = process.env.TEST_MYSQL_USER || 'ppos_rc_mdw0qd';
const TEST_PASSWORD = process.env.TEST_MYSQL_PASSWORD || '';

process.env.MYSQL_HOST = TEST_HOST;
process.env.MYSQL_PORT = String(TEST_PORT);
process.env.MYSQL_DATABASE = TEST_DB;
process.env.MYSQL_USER = TEST_USER;
process.env.MYSQL_PASSWORD = TEST_PASSWORD;

process.env.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
process.env.JWT_AUDIENCE = 'ppos:control';
process.env.JWT_ISSUER = 'https://auth.printprice.pro';
process.env.STRICT_SESSION_JTI_REQUIRED = 'true';
process.env.ALLOW_LOCAL_WEBHOOKS = 'true';

const logger = {
    info: (msg, meta = {}) => console.log(`[HARNESS-INFO] ${msg}`, Object.keys(meta).length ? JSON.stringify(meta) : ''),
    warn: (msg, meta = {}) => console.warn(`[HARNESS-WARN] ${msg}`, Object.keys(meta).length ? JSON.stringify(meta) : ''),
    error: (msg, meta = {}) => console.error(`[HARNESS-ERROR] ${msg}`, Object.keys(meta).length ? JSON.stringify(meta) : '')
};

function getTotpForStep(secretBase32, timeStep) {
    const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    function base32Decode(s) {
        let bits = 0, val = 0, out = [];
        for (let c of s) { val = (val << 5) | BASE32_CHARS.indexOf(c); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
        return Buffer.from(out);
    }
    const key = base32Decode(secretBase32);
    const buf = Buffer.alloc(8);
    buf.writeBigInt64BE(BigInt(timeStep), 0);
    const hmac = crypto.createHmac('sha1', key).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const codeNum = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
    return (codeNum % 1000000).toString().padStart(6, '0');
}

async function runConnectedHarness() {
    console.log('================================================================');
    console.log(' PrintPrice OS Control Plane — Connected HTTP/MySQL Harness');
    console.log('================================================================');

    // 2. Strict Isolation Check (Fail Fast)
    if (TEST_HOST !== '127.0.0.1') {
        logger.error('CRITICAL ISOLATION FAILURE: TEST_HOST must be strictly 127.0.0.1', { TEST_HOST });
        process.exit(1);
    }

    if (TEST_PORT !== 3306) {
        logger.error('CRITICAL ISOLATION FAILURE: TEST_PORT must be strictly 3306', { TEST_PORT });
        process.exit(1);
    }

    if (TEST_DB !== 'pposrcmdw0qdtest') {
        logger.error('CRITICAL ISOLATION FAILURE: TEST_DB must be strictly pposrcmdw0qdtest', { TEST_DB });
        process.exit(1);
    }

    if (TEST_USER !== 'ppos_rc_mdw0qd') {
        logger.error('CRITICAL ISOLATION FAILURE: TEST_USER must be strictly ppos_rc_mdw0qd', { TEST_USER });
        process.exit(1);
    }

    // Direct raw connection check
    let conn;
    try {
        conn = await mysql.createConnection({
            host: TEST_HOST,
            port: TEST_PORT,
            user: TEST_USER,
            password: TEST_PASSWORD,
            database: TEST_DB,
            connectTimeout: 5000
        });

        const [identityRows] = await conn.query('SELECT CURRENT_USER() AS currentUser, DATABASE() AS currentDb');
        const currentUser = identityRows[0].currentUser;
        const currentDb = identityRows[0].currentDb;

        logger.info('Direct MySQL connection established', { currentUser, currentDb });

        if (currentDb !== 'pposrcmdw0qdtest') {
            logger.error('CRITICAL: DATABASE() does not match pposrcmdw0qdtest', { currentDb });
            process.exit(1);
        }

        if (currentUser !== 'ppos_rc_mdw0qd@127.0.0.1') {
            logger.error('CRITICAL: CURRENT_USER() does not match ppos_rc_mdw0qd@127.0.0.1', { currentUser });
            process.exit(1);
        }
    } catch (err) {
        logger.error('CRITICAL: Direct MySQL connection or identity validation failed', { error: err.message });
        process.exit(1);
    } finally {
        if (conn) await conn.end();
    }

    // Initialize mysqlClient service and verify identity through mysqlClient.query
    const db = require('../src/api/services/mysqlClient');

    try {
        const clientRows = await db.query('SELECT CURRENT_USER() AS currentUser, DATABASE() AS currentDb');
        const clientUser = clientRows[0].currentUser;
        const clientDb = clientRows[0].currentDb;

        logger.info('mysqlClient pool verification established', { clientUser, clientDb });

        if (clientDb !== 'pposrcmdw0qdtest' || clientUser !== 'ppos_rc_mdw0qd@127.0.0.1') {
            logger.error('CRITICAL: mysqlClient identity mismatch', { clientUser, clientDb });
            process.exit(1);
        }
    } catch (err) {
        logger.error('CRITICAL: mysqlClient bootstrap query failed', { error: err.message });
        process.exit(1);
    }

    // Import routes & services after isolation validation
    const authRoutes = require('../src/api/routes/authRoutes');
    const adminRoutes = require('../src/api/routes/admin');
    const userMfaService = require('../src/api/services/userMfaService');

    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/admin', adminRoutes);

    let server;
    let baseUrl;

    const createdTenantIds = new Set();
    const createdUserIds = new Set();
    const createdSignupEmails = new Set();

    try {
        await new Promise((resolve) => {
            server = http.createServer(app);
            server.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                logger.info('HTTP test server listening on isolated localhost', { baseUrl });
                resolve();
            });
        });

        const tenantId = 'tenant_harness_connected';
        const pwUserId = 'user_pw_harness_' + Date.now();
        const pwEmail = `harness_pw_${Date.now()}@printprice.pro`;
        const rawPassword = 'TestPassword123!';

        createdTenantIds.add(tenantId);
        createdUserIds.add(pwUserId);
        createdSignupEmails.add(pwEmail);

        // Seed test tenant and test user in MySQL
        await db.query(
            `INSERT INTO tenants (id, name, status, plan, created_at)
             VALUES (?, 'Harness Test Tenant', 'ACTIVE', 'ENTERPRISE', NOW())
             ON DUPLICATE KEY UPDATE updated_at = NOW()`,
            [tenantId]
        );

        const passwordHash = await bcrypt.hash(rawPassword, 10);
        await db.query(
            `INSERT INTO control_users (id, tenant_id, email, password_hash, role, status, created_at)
             VALUES (?, ?, ?, ?, 'PRINTHOUSE_ADMIN', 'ACTIVE', NOW())`,
            [pwUserId, tenantId, pwEmail, passwordHash]
        );

        // ── CASE 1: Password Login & Persisted Session ───────────────────────
        logger.info('Executing Case 1: Password Login & Persisted Session');

        const loginRes = await axios.post(`${baseUrl}/api/auth/login`, {
            email: pwEmail,
            password: rawPassword
        });

        if (loginRes.status !== 200 || !loginRes.data.ok || !loginRes.data.token) {
            throw new Error(`Login failed with HTTP ${loginRes.status}: ${JSON.stringify(loginRes.data)}`);
        }

        const loginToken = loginRes.data.token;
        const sessionId = loginRes.data.user.sessionId;

        if (!sessionId) {
            throw new Error('Login response did not include sessionId in user object');
        }

        // Verify session persistence in MySQL user_sessions table using mysqlClient contract (returns rows array)
        const sessionRows = await db.query(
            `SELECT id, user_id, tenant_id, status FROM user_sessions WHERE id = ?`,
            [sessionId]
        );

        if (!sessionRows || sessionRows.length === 0) {
            throw new Error(`Session ${sessionId} was NOT persisted in MySQL user_sessions table`);
        }

        if (sessionRows[0].status !== 'ACTIVE' || sessionRows[0].user_id !== pwUserId || sessionRows[0].tenant_id !== tenantId) {
            throw new Error(`Persisted session mismatch: ${JSON.stringify(sessionRows[0])}`);
        }
        logger.info('Case 1 Check 1 PASSED: Session record verified in MySQL user_sessions table', { sessionId, status: sessionRows[0].status });

        // Access protected route with Bearer token
        const verifyRes1 = await axios.get(`${baseUrl}/api/admin/verify`, {
            headers: { Authorization: `Bearer ${loginToken}` }
        });
        if (verifyRes1.status !== 200 || !verifyRes1.data.ok) {
            throw new Error('Protected route verification failed');
        }
        logger.info('Case 1 Check 2 PASSED: Protected route access granted with session JWT');

        // Logout
        const logoutRes = await axios.post(`${baseUrl}/api/auth/logout`, {}, {
            headers: { Authorization: `Bearer ${loginToken}` }
        });
        if (logoutRes.status !== 200 || !logoutRes.data.ok) {
            throw new Error('Logout failed');
        }

        // Verify session status updated to REVOKED in MySQL
        const revokedRows = await db.query(
            `SELECT status FROM user_sessions WHERE id = ?`,
            [sessionId]
        );
        if (!revokedRows || revokedRows.length === 0 || revokedRows[0].status !== 'REVOKED') {
            throw new Error(`Session status in MySQL was NOT updated to REVOKED after logout`);
        }
        logger.info('Case 1 Check 3 PASSED: Session status updated to REVOKED in MySQL');

        // Re-attempt protected access with same token -> HTTP 401
        try {
            await axios.get(`${baseUrl}/api/admin/verify`, {
                headers: { Authorization: `Bearer ${loginToken}` }
            });
            throw new Error('Revoked token was unexpectedly accepted');
        } catch (err) {
            if (!err.response || err.response.status !== 401) {
                throw new Error(`Expected HTTP 401 for revoked token, got: ${err.message}`);
            }
            logger.info('Case 1 Check 4 PASSED: Revoked token rejected with HTTP 401 Unauthorized');
        }

        // ── CASE 2: Self-Registration Auto-Login & Persisted Session ─────────
        logger.info('Executing Case 2: Self-Registration Auto-Login & Persisted Session');

        const regEmail = `harness_reg_${Date.now()}@printprice.pro`;
        createdSignupEmails.add(regEmail);

        const regRes = await axios.post(`${baseUrl}/api/auth/printhouse/register`, {
            companyName: 'Harness Print Shop',
            email: regEmail,
            password: 'RegPassword123!'
        });

        if (regRes.status !== 201 || !regRes.data.ok || !regRes.data.token) {
            throw new Error(`Self-registration failed with HTTP ${regRes.status}: ${JSON.stringify(regRes.data)}`);
        }

        const regToken = regRes.data.token;
        const regTenantId = regRes.data.user.tenantId;
        if (regTenantId) createdTenantIds.add(regTenantId);

        // Access protected route to retrieve user ID and session ID
        const regVerifyRes = await axios.get(`${baseUrl}/api/admin/verify`, {
            headers: { Authorization: `Bearer ${regToken}` }
        });

        if (regVerifyRes.status !== 200 || !regVerifyRes.data.ok) {
            throw new Error('Protected route access failed for self-registered user');
        }

        const regUserId = regVerifyRes.data.user.id;
        const regSessionId = regVerifyRes.data.user.sessionId;

        if (regUserId) createdUserIds.add(regUserId);

        const regSessionRows = await db.query(
            `SELECT id, user_id, tenant_id, status FROM user_sessions WHERE id = ?`,
            [regSessionId]
        );

        if (!regSessionRows || regSessionRows.length === 0 || regSessionRows[0].status !== 'ACTIVE') {
            throw new Error('Registration session was NOT active in MySQL user_sessions');
        }

        if (regSessionRows[0].user_id !== regUserId || regSessionRows[0].tenant_id !== regTenantId) {
            throw new Error('Registration session user_id or tenant_id mismatch');
        }
        logger.info('Case 2 PASSED: Self-registration auto-login issued persisted session JWT', { regUserId, regSessionId, regTenantId });

        // ── CASE 3: MFA Challenge, Recovery & Anti-Replay in MySQL ──────────
        logger.info('Executing Case 3: Real MFA Challenge, Recovery & Anti-Replay');

        const mfaUserId = 'user_mfa_harness_' + Date.now();
        const mfaEmail = `harness_mfa_${Date.now()}@printprice.pro`;
        createdUserIds.add(mfaUserId);
        createdSignupEmails.add(mfaEmail);

        await db.query(
            `INSERT INTO control_users (id, tenant_id, email, password_hash, role, status, created_at)
             VALUES (?, ?, ?, ?, 'PRINTHOUSE_ADMIN', 'ACTIVE', NOW())`,
            [mfaUserId, tenantId, mfaEmail, passwordHash]
        );

        const mfaSetup = await userMfaService.setupMfa(mfaUserId, tenantId, mfaEmail);
        const currentStep = Math.floor(Date.now() / 1000 / 30);
        const setupConfirmCode = getTotpForStep(mfaSetup.secret, currentStep);
        await userMfaService.confirmMfa(mfaUserId, tenantId, setupConfirmCode);

        // Login with MFA-enabled account
        const mfaLoginRes = await axios.post(`${baseUrl}/api/auth/login`, {
            email: mfaEmail,
            password: rawPassword
        });

        if (!mfaLoginRes.data.mfaRequired || !mfaLoginRes.data.mfaToken) {
            throw new Error('Login for MFA user did not return mfaRequired & mfaToken');
        }

        const challengeToken = mfaLoginRes.data.mfaToken;

        // Try accessing protected route with challenge token -> HTTP 403
        try {
            await axios.get(`${baseUrl}/api/admin/verify`, {
                headers: { Authorization: `Bearer ${challengeToken}` }
            });
            throw new Error('MFA challenge token granted protected access!');
        } catch (err) {
            if (!err.response || err.response.status !== 403) {
                throw new Error(`Expected HTTP 403 for challenge token, got: ${err.message}`);
            }
            logger.info('Case 3 Check 1 PASSED: MFA Challenge token rejected on protected route with HTTP 403');
        }

        // Verify MFA challenge with TOTP code
        const nextStep = Math.floor(Date.now() / 1000 / 30) + 1;
        const validLoginCode = getTotpForStep(mfaSetup.secret, nextStep);

        const mfaVerifyRes = await axios.post(`${baseUrl}/api/auth/mfa/verify`, {
            mfaToken: challengeToken,
            code: validLoginCode
        });

        if (mfaVerifyRes.status !== 200 || !mfaVerifyRes.data.ok || !mfaVerifyRes.data.token) {
            throw new Error(`MFA verification failed: ${JSON.stringify(mfaVerifyRes.data)}`);
        }

        const mfaSessionId = mfaVerifyRes.data.user.sessionId;

        // Verify session persistence in MySQL
        const mfaSessionRows = await db.query(
            `SELECT id, status FROM user_sessions WHERE id = ?`,
            [mfaSessionId]
        );
        if (!mfaSessionRows || mfaSessionRows.length === 0 || mfaSessionRows[0].status !== 'ACTIVE') {
            throw new Error('MFA verified session was NOT persisted in MySQL user_sessions');
        }
        logger.info('Case 3 Check 2 PASSED: MFA verification issued full persisted session', { mfaSessionId });

        // Anti-Replay: Attempt to re-use same TOTP code -> HTTP 401
        try {
            await axios.post(`${baseUrl}/api/auth/mfa/verify`, {
                mfaToken: challengeToken,
                code: validLoginCode
            });
            throw new Error('Reused TOTP code was unexpectedly accepted!');
        } catch (err) {
            if (!err.response || err.response.status !== 401) {
                throw new Error(`Expected HTTP 401 for reused TOTP code, got: ${err.message}`);
            }
            logger.info('Case 3 Check 3 PASSED: Reused TOTP code rejected due to anti-replay');
        }

        console.log('================================================================');
        console.log(' SUCCESS: All connected HTTP/MySQL 8 harness tests PASSED!');
        console.log('================================================================');

    } catch (err) {
        logger.error('Harness test failure', { error: err.message, stack: err.stack });
        process.exitCode = 1;
    } finally {
        logger.info('Executing teardown and fixture cleanup in finally block...');

        const tenantArray = Array.from(createdTenantIds);
        const userArray = Array.from(createdUserIds);
        const emailArray = Array.from(createdSignupEmails);

        // Reverse FK order cleanup with error tracing (no swallowed errors)
        try {
            if (userArray.length || tenantArray.length) {
                const uPlaceholders = userArray.map(() => '?').join(',') || 'NULL';
                const tPlaceholders = tenantArray.map(() => '?').join(',') || 'NULL';

                await db.query(
                    `DELETE FROM user_sessions WHERE user_id IN (${uPlaceholders}) OR tenant_id IN (${tPlaceholders})`,
                    [...userArray, ...tenantArray]
                );

                await db.query(
                    `DELETE FROM user_mfa WHERE user_id IN (${uPlaceholders}) OR tenant_id IN (${tPlaceholders})`,
                    [...userArray, ...tenantArray]
                );

                await db.query(
                    `DELETE FROM tenant_licenses WHERE tenant_id IN (${tPlaceholders})`,
                    tenantArray
                );

                await db.query(
                    `DELETE FROM printhouse_capabilities WHERE tenant_id IN (${tPlaceholders})`,
                    tenantArray
                );

                await db.query(
                    `DELETE FROM printer_nodes WHERE tenant_id IN (${tPlaceholders})`,
                    tenantArray
                );

                if (emailArray.length) {
                    const ePlaceholders = emailArray.map(() => '?').join(',');
                    await db.query(
                        `DELETE FROM control_users WHERE id IN (${uPlaceholders}) OR tenant_id IN (${tPlaceholders}) OR email IN (${ePlaceholders})`,
                        [...userArray, ...tenantArray, ...emailArray]
                    );

                    await db.query(
                        `DELETE FROM printhouse_signup_requests WHERE email IN (${ePlaceholders})`,
                        emailArray
                    );
                }

                await db.query(
                    `DELETE FROM tenants WHERE id IN (${tPlaceholders})`,
                    tenantArray
                );
            }
            logger.info('Fixture cleanup completed successfully');
        } catch (cleanupErr) {
            logger.error('CRITICAL: Fixture cleanup encountered an error', { error: cleanupErr.message, stack: cleanupErr.stack });
            process.exitCode = 1;
        }

        // Close server and database connection pools cleanly
        if (server) {
            await new Promise((resolve) => server.close(resolve)).catch(err => {
                logger.error('HTTP server close error', { error: err.message });
                process.exitCode = 1;
            });
        }

        try {
            await db.closePool();
        } catch (err) {
            logger.error('mysqlClient closePool error', { error: err.message });
            process.exitCode = 1;
        }

        try {
            const upstreamDbPath = require.resolve('../src/api/upstream/src/services/db');
            const cachedUpstream = require.cache[upstreamDbPath];
            if (cachedUpstream && cachedUpstream.exports && typeof cachedUpstream.exports.shutdown === 'function') {
                await cachedUpstream.exports.shutdown();
            }
        } catch (err) {}

        try {
            const redisPath = require.resolve('../src/api/adapters/redisConnection');
            const cachedRedis = require.cache[redisPath];
            if (cachedRedis && cachedRedis.exports && typeof cachedRedis.exports.quit === 'function') {
                await cachedRedis.exports.quit();
            }
        } catch (err) {}
    }
}

if (require.main === module) {
    runConnectedHarness();
}

module.exports = { runConnectedHarness };
