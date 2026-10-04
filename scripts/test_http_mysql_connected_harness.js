/**
 * scripts/test_http_mysql_connected_harness.js
 * 
 * Mandatory Connected HTTP/MySQL 8 Integration Harness.
 * Strictly NO mocks, NO in-memory fallbacks.
 * Connects exclusively to isolated MySQL test instance: pposrcmdw0qdtest on 127.0.0.1:3306.
 */
const mysql = require('mysql2/promise');
const express = require('express');
const http = require('http');
const axios = require('axios');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

// 1. Enforce strict isolated test database configuration
delete process.env.DATABASE_URL;
delete process.env.MYSQL_URL;

const TEST_HOST = process.env.TEST_MYSQL_HOST || '127.0.0.1';
const TEST_PORT = parseInt(process.env.TEST_MYSQL_PORT || '3306');
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

    // 2. Validate DB connection & identity (FAIL FAST)
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

        logger.info('Connected to MySQL test instance successfully', { currentUser, currentDb });

        if (currentDb !== TEST_DB) {
            throw new Error(`Connected database "${currentDb}" does not match target test DB "${TEST_DB}"`);
        }

        if (TEST_HOST !== '127.0.0.1' && TEST_HOST !== 'localhost') {
            throw new Error(`Test host "${TEST_HOST}" must be local 127.0.0.1`);
        }
    } catch (err) {
        logger.error('CRITICAL: Failed MySQL connection or identity validation', { error: err.message });
        console.error('Abort harness: No real MySQL test database available or incorrect identity.');
        process.exit(1);
    } finally {
        if (conn) await conn.end();
    }

    // 3. Initialize server & modules with real MySQL pool
    const db = require('../src/api/services/mysqlClient');
    const authRoutes = require('../src/api/routes/authRoutes');
    const adminRoutes = require('../src/api/routes/admin');
    const userMfaService = require('../src/api/services/userMfaService');

    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/admin', adminRoutes);

    let server;
    let baseUrl;

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

    try {
        // Prepare test tenant and user in MySQL
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

        // Verify session persistence in MySQL user_sessions table
        const [sessionRows] = await db.query(
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
        const [revokedRows] = await db.query(
            `SELECT status FROM user_sessions WHERE id = ?`,
            [sessionId]
        );
        if (!revokedRows || revokedRows[0].status !== 'REVOKED') {
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

        // Verify session persistence for newly registered user
        const regVerifyRes = await axios.get(`${baseUrl}/api/admin/verify`, {
            headers: { Authorization: `Bearer ${regToken}` }
        });

        if (regVerifyRes.status !== 200 || !regVerifyRes.data.ok) {
            throw new Error('Protected route access failed for self-registered user');
        }

        const regSessionId = regVerifyRes.data.user.sessionId;
        const [regSessionRows] = await db.query(
            `SELECT id, status FROM user_sessions WHERE id = ?`,
            [regSessionId]
        );

        if (!regSessionRows || regSessionRows[0].status !== 'ACTIVE') {
            throw new Error('Registration session was NOT active in MySQL');
        }
        logger.info('Case 2 PASSED: Self-registration auto-login issued persisted session JWT', { regSessionId, regTenantId });

        // ── CASE 3: MFA Challenge, Recovery & Anti-Replay in MySQL ──────────
        logger.info('Executing Case 3: Real MFA Challenge, Recovery & Anti-Replay');

        const mfaUserId = 'user_mfa_harness_' + Date.now();
        const mfaEmail = `harness_mfa_${Date.now()}@printprice.pro`;

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

        const fullAccessToken = mfaVerifyRes.data.token;
        const mfaSessionId = mfaVerifyRes.data.user.sessionId;

        // Verify session persistence in MySQL
        const [mfaSessionRows] = await db.query(
            `SELECT id, status FROM user_sessions WHERE id = ?`,
            [mfaSessionId]
        );
        if (!mfaSessionRows || mfaSessionRows[0].status !== 'ACTIVE') {
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

        // ── Clean up harness test fixtures ONLY ───────────────────────────────
        logger.info('Cleaning up test fixtures...');
        await db.query(`DELETE FROM user_sessions WHERE user_id IN (?, ?, ?) OR tenant_id = ?`, [pwUserId, mfaUserId, regTenantId, tenantId]).catch(() => {});
        await db.query(`DELETE FROM user_mfa WHERE user_id = ?`, [mfaUserId]).catch(() => {});
        await db.query(`DELETE FROM control_users WHERE id IN (?, ?) OR email = ?`, [pwUserId, mfaUserId, regEmail]).catch(() => {});
        await db.query(`DELETE FROM tenants WHERE id IN (?, ?)`, [tenantId, regTenantId]).catch(() => {});
        await db.query(`DELETE FROM printhouse_signup_requests WHERE email = ?`, [regEmail]).catch(() => {});

        console.log('================================================================');
        console.log(' SUCCESS: All connected HTTP/MySQL 8 harness tests PASSED!');
        console.log('================================================================');

    } catch (err) {
        logger.error('Harness test failure', { error: err.message, stack: err.stack });
        process.exitCode = 1;
    } finally {
        if (server) {
            await new Promise(r => server.close(r));
        }
        try {
            const redisPath = require.resolve('../src/api/adapters/redisConnection');
            const cached = require.cache[redisPath];
            if (cached && cached.exports && typeof cached.exports.quit === 'function') {
                await cached.exports.quit();
            }
        } catch (e) {}

        const pool = db.getPool();
        if (pool && typeof pool.end === 'function') {
            await pool.end();
        }
    }
}

if (require.main === module) {
    runConnectedHarness();
}

module.exports = { runConnectedHarness };
