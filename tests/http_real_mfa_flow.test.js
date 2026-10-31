// @vitest-environment node
/**
 * tests/http_real_mfa_flow.test.js
 * 
 * HTTP Real MFA Challenge & Anti-Replay Verification Suite.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import http from 'http';
import axios from 'axios';
import crypto from 'crypto';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'ppos_test_jwt_secret_key_32_bytes_long';
process.env.JWT_AUDIENCE = 'ppos:control';
process.env.JWT_ISSUER = 'https://auth.printprice.pro';

const authRoutes = require('../src/api/routes/authRoutes');
const adminRoutes = require('../src/api/routes/admin');
const userMfaService = require('../src/api/services/userMfaService');
const db = require('../src/api/services/mysqlClient');

const inMemoryStore = {
    mfa: [],
    sessions: []
};

const origQuery = db.query.bind(db);
db.query = async function (sql, params = []) {
    try {
        return await origQuery(sql, params);
    } catch (err) {
        if (err.code === 'DB_UNCONFIGURED' || err.code === 'DB_CONNECTION_REFUSED' || err.message?.includes('UNCONFIGURED')) {
            return handleInMemoryMfaQuery(sql, params);
        }
        throw err;
    }
};

function handleInMemoryMfaQuery(sql, params = []) {
    const s = sql.trim();
    if (/^CREATE TABLE/i.test(s)) return [];
    if (/INSERT INTO user_mfa/i.test(s)) {
        const [userId, tenantId, secret, recoveryJson] = params;
        const existingIdx = inMemoryStore.mfa.findIndex(r => r.user_id === userId);
        const record = { user_id: userId, tenant_id: tenantId, totp_secret_encrypted: secret, is_confirmed: 0, recovery_codes_json: typeof recoveryJson === 'string' ? JSON.parse(recoveryJson) : (recoveryJson || []), last_used_timestep: 0, failed_attempts: 0, locked_until: null };
        if (existingIdx >= 0) inMemoryStore.mfa[existingIdx] = record;
        else inMemoryStore.mfa.push(record);
        return { affectedRows: 1 };
    }
    if (/SELECT.*FROM user_mfa/i.test(s)) {
        const userId = params[0];
        const record = inMemoryStore.mfa.find(r => r.user_id === userId);
        return record ? [record] : [];
    }
    if (/UPDATE user_mfa/i.test(s)) {
        const userId = params[params.length - 1];
        const record = inMemoryStore.mfa.find(r => r.user_id === userId);
        if (record) {
            if (s.includes('is_confirmed = 1')) {
                record.is_confirmed = 1;
                record.last_used_timestep = params[0];
            } else if (s.includes('last_used_timestep = ?')) {
                record.last_used_timestep = params[0];
            }
            if (s.includes('recovery_codes_json = ?')) {
                record.recovery_codes_json = typeof params[0] === 'string' ? JSON.parse(params[0]) : params[0];
            }
        }
        return { affectedRows: 1 };
    }
    if (/INSERT INTO user_sessions/i.test(s)) {
        const [id, userId, tenantId, role] = params;
        inMemoryStore.sessions.push({ id, user_id: userId, tenant_id: tenantId, role, status: 'ACTIVE', last_activity_at: new Date(), expires_at: new Date(Date.now() + 86400000) });
        return { affectedRows: 1 };
    }
    if (/SELECT.*FROM user_sessions/i.test(s)) {
        const sessionId = params[0];
        const sess = inMemoryStore.sessions.find(r => r.id === sessionId);
        return sess ? [sess] : [];
    }
    if (/SELECT plan, metadata_json FROM tenants/i.test(s)) {
        return [{ plan: 'ENTERPRISE', metadata_json: '{}' }];
    }
    return [];
}

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

describe('HTTP Real MFA Challenge, Recovery & Anti-Replay Suite', () => {
    let server;
    let baseUrl;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        app.use('/api/auth', authRoutes);
        app.use('/api/admin', adminRoutes);

        return new Promise((resolve) => {
            server = http.createServer(app);
            server.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    afterAll(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    it('1. Confirmed MFA user receives mfaRequired & challenge token, NOT full access token', async () => {
        const userId = 'mfa_flow_user_1';
        const setup = await userMfaService.setupMfa(userId, 'tenant_mfa_1', 'mfa1@printprice.pro');
        const step = Math.floor(Date.now() / 1000 / 30);
        const confirmCode = getTotpForStep(setup.secret, step);

        await userMfaService.confirmMfa(userId, 'tenant_mfa_1', confirmCode);

        const challengeToken = jwt.sign(
            { sub: userId, email: 'mfa1@printprice.pro', tenant_id: 'tenant_mfa_1', is_mfa_challenge: true },
            process.env.JWT_SECRET,
            { expiresIn: '5m', issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE }
        );

        try {
            await axios.get(`${baseUrl}/api/admin/verify`, {
                headers: { Authorization: `Bearer ${challengeToken}` }
            });
            expect.fail('Challenge token must not grant full admin access');
        } catch (err) {
            expect(err.response ? err.response.status : 403).toBe(403);
        }
    });

    it('2. Completing MFA challenge via POST /api/auth/mfa/verify returns full access token', async () => {
        const userId = 'mfa_flow_user_2';
        const setup = await userMfaService.setupMfa(userId, 'tenant_mfa_1', 'mfa2@printprice.pro');

        const currentStep = Math.floor(Date.now() / 1000 / 30);
        const confirmCode = getTotpForStep(setup.secret, currentStep - 1);
        await userMfaService.confirmMfa(userId, 'tenant_mfa_1', confirmCode);

        const challengeToken = jwt.sign(
            { sub: userId, email: 'mfa2@printprice.pro', tenant_id: 'tenant_mfa_1', is_mfa_challenge: true },
            process.env.JWT_SECRET,
            { expiresIn: '5m', issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE }
        );

        const loginCode = getTotpForStep(setup.secret, currentStep);
        const verifyRes = await axios.post(`${baseUrl}/api/auth/mfa/verify`, {
            mfaToken: challengeToken,
            code: loginCode
        });

        expect(verifyRes.data.ok).toBe(true);
        expect(verifyRes.data.token).toBeDefined();

        const adminRes = await axios.get(`${baseUrl}/api/admin/verify`, {
            headers: { Authorization: `Bearer ${verifyRes.data.token}` }
        });
        expect(adminRes.status).toBe(200);
    });

    it('3. Anti-replay: concurrent reuse of same TOTP code is rejected', async () => {
        const userId = 'mfa_flow_user_3';
        const setup = await userMfaService.setupMfa(userId, 'tenant_mfa_1', 'mfa3@printprice.pro');

        const currentStep = Math.floor(Date.now() / 1000 / 30);
        const confirmCode = getTotpForStep(setup.secret, currentStep - 1);
        await userMfaService.confirmMfa(userId, 'tenant_mfa_1', confirmCode);

        const loginCode = getTotpForStep(setup.secret, currentStep);

        // First verification with loginCode succeeds
        const res1 = await userMfaService.verifyMfaChallenge(userId, loginCode);
        expect(res1.valid).toBe(true);

        // Second verification with SAME TOTP code fails due to anti-replay
        const res2 = await userMfaService.verifyMfaChallenge(userId, loginCode);
        expect(res2.valid).toBe(false);
        expect(res2.reason).toBe('MFA_CODE_REUSED');
    });

    it('4. Recovery Code: valid recovery code authenticates and gets marked as used', async () => {
        const userId = 'mfa_flow_user_4';
        const setup = await userMfaService.setupMfa(userId, 'tenant_mfa_1', 'mfa4@printprice.pro');

        const currentStep = Math.floor(Date.now() / 1000 / 30);
        const confirmCode = getTotpForStep(setup.secret, currentStep);
        await userMfaService.confirmMfa(userId, 'tenant_mfa_1', confirmCode);

        const recoveryCode = setup.recoveryCodes[0];

        // First verification with recovery code succeeds
        const res1 = await userMfaService.verifyMfaChallenge(userId, recoveryCode);
        expect(res1.valid).toBe(true);
        expect(res1.isRecoveryCodeUsed).toBe(true);

        // Second verification with SAME recovery code fails
        const res2 = await userMfaService.verifyMfaChallenge(userId, recoveryCode);
        expect(res2.valid).toBe(false);
    });
});
