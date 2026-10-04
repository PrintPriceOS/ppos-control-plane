/**
 * src/api/services/userMfaService.js
 * 
 * Phase 195E — Real RFC 6238 TOTP MFA Engine.
 */
const crypto = require('crypto');
const db = require('./mysqlClient');
const logger = require('./logger').child('user-mfa');

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
    let bits = 0;
    let value = 0;
    let output = '';

    for (let i = 0; i < buffer.length; i++) {
        value = (value << 8) | buffer[i];
        bits += 8;
        while (bits >= 5) {
            output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }

    if (bits > 0) {
        output += BASE32_CHARS[(value << (5 - bits)) & 31];
    }

    return output;
}

function base32Decode(base32Str) {
    const cleanStr = String(base32Str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = 0;
    let value = 0;
    const output = [];

    for (let i = 0; i < cleanStr.length; i++) {
        const val = BASE32_CHARS.indexOf(cleanStr[i]);
        if (val === -1) continue;
        value = (value << 5) | val;
        bits += 5;
        if (bits >= 8) {
            output.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }

    return Buffer.from(output);
}

function generateTotpCode(secretBase32, timeStep) {
    const key = base32Decode(secretBase32);
    const buf = Buffer.alloc(8);
    buf.writeBigInt64BE(BigInt(timeStep), 0);

    const hmac = crypto.createHmac('sha1', key).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const codeNum = ((hmac[offset] & 0x7f) << 24) |
                    ((hmac[offset + 1] & 0xff) << 16) |
                    ((hmac[offset + 2] & 0xff) << 8) |
                    (hmac[offset + 3] & 0xff);

    const code = (codeNum % 1000000).toString().padStart(6, '0');
    return code;
}

function encryptSecret(plainSecret) {
    const masterKey = crypto.createHash('sha256').update(process.env.JWT_SECRET || 'ppos-mfa-default-secret').digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(plainSecret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSecret(encryptedPayload) {
    const masterKey = crypto.createHash('sha256').update(process.env.JWT_SECRET || 'ppos-mfa-default-secret').digest();
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) throw new Error('Invalid encrypted MFA secret format');
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encrypted = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
}

class UserMfaService {

    /**
     * Initializes MFA setup for a user, returning secret and QR URI.
     */
    async setupMfa(userId, tenantId, userEmail) {

        // Check if confirmed MFA already exists
        const [existing] = await db.query(`SELECT is_confirmed FROM user_mfa WHERE user_id = ?`, [userId]).catch(() => []);
        if (existing && existing.is_confirmed) {
            const err = new Error('MFA is already enabled and confirmed for this account');
            err.code = 'MFA_ALREADY_ENABLED';
            err.statusCode = 400;
            throw err;
        }

        // Generate 20-byte random secret
        const rawBytes = crypto.randomBytes(20);
        const secretBase32 = base32Encode(rawBytes);
        const encryptedSecret = encryptSecret(secretBase32);

        // Generate 8 single-use recovery codes
        const rawRecoveryCodes = [];
        const recoveryHashes = [];

        for (let i = 0; i < 8; i++) {
            const code = crypto.randomBytes(5).toString('hex').toUpperCase(); // 10 chars
            const hash = crypto.createHash('sha256').update(code).digest('hex');
            rawRecoveryCodes.push(code);
            recoveryHashes.push({ code_hash: hash, used: false, used_at: null });
        }

        await db.query(
            `INSERT INTO user_mfa (user_id, tenant_id, totp_secret_encrypted, is_confirmed, recovery_codes_json, last_used_timestep, failed_attempts, created_at)
             VALUES (?, ?, ?, 0, ?, 0, 0, NOW())
             ON DUPLICATE KEY UPDATE totp_secret_encrypted = VALUES(totp_secret_encrypted), is_confirmed = 0, recovery_codes_json = VALUES(recovery_codes_json), failed_attempts = 0, locked_until = NULL`,
            [userId, tenantId, encryptedSecret, JSON.stringify(recoveryHashes)]
        );

        const issuer = 'PrintPriceOS';
        const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(userEmail)}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}`;

        return {
            ok: true,
            secret: secretBase32, // Returned ONCE during setup for manual app entry
            otpauthUrl,
            recoveryCodes: rawRecoveryCodes // Returned ONCE for user to download/save
        };
    }

    /**
     * Confirms MFA setup by verifying the first TOTP code.
     */
    async confirmMfa(userId, tenantId, totpCode) {

        const [record] = await db.query(`SELECT user_id, tenant_id, totp_secret_encrypted, recovery_codes_json, is_confirmed FROM user_mfa WHERE user_id = ? AND tenant_id = ?`, [userId, tenantId]);
        if (!record) {
            const err = new Error('No pending MFA setup found. Please initiate setup first.');
            err.code = 'MFA_NOT_SETUP';
            err.statusCode = 400;
            throw err;
        }

        const plainSecret = decryptSecret(record.totp_secret_encrypted);
        const currentStep = Math.floor(Date.now() / 1000 / 30);

        let validStep = null;
        for (const stepOffset of [0, -1, 1]) {
            const expected = generateTotpCode(plainSecret, currentStep + stepOffset);
            if (expected === String(totpCode).trim()) {
                validStep = currentStep + stepOffset;
                break;
            }
        }

        if (validStep === null) {
            const err = new Error('Invalid TOTP verification code');
            err.code = 'INVALID_MFA_CODE';
            err.statusCode = 400;
            throw err;
        }

        await db.query(`UPDATE user_mfa SET is_confirmed = 1, last_used_timestep = ?, failed_attempts = 0, locked_until = NULL WHERE user_id = ?`, [validStep, userId]);

        return { ok: true, message: 'MFA confirmed and activated successfully' };
    }

    /**
     * Validates MFA code or recovery code during login challenge.
     */
    async verifyMfaChallenge(userId, codeOrRecoveryCode) {

        const [record] = await db.query(`SELECT user_id, tenant_id, totp_secret_encrypted, is_confirmed, recovery_codes_json, last_used_timestep, failed_attempts, locked_until FROM user_mfa WHERE user_id = ?`, [userId]);
        if (!record || !record.is_confirmed) {
            return { valid: false, reason: 'MFA_NOT_ACTIVE' };
        }

        const now = new Date();
        if (record.locked_until && new Date(record.locked_until) > now) {
            return { valid: false, reason: 'MFA_LOCKED_TEMPORARILY' };
        }

        const inputCode = String(codeOrRecoveryCode || '').trim().toUpperCase();

        // 1. Check TOTP 6-digit code
        if (/^\d{6}$/.test(inputCode)) {
            const plainSecret = decryptSecret(record.totp_secret_encrypted);
            const currentStep = Math.floor(Date.now() / 1000 / 30);

            let validStep = null;
            for (const stepOffset of [0, -1, 1]) {
                const step = currentStep + stepOffset;
                const expected = generateTotpCode(plainSecret, step);
                if (expected === inputCode) {
                    if (step <= Number(record.last_used_timestep)) {
                        return { valid: false, reason: 'MFA_CODE_REUSED' };
                    }
                    validStep = step;
                    break;
                }
            }

            if (validStep !== null) {
                await db.query(`UPDATE user_mfa SET last_used_timestep = ?, failed_attempts = 0, locked_until = NULL WHERE user_id = ?`, [validStep, userId]);
                return { valid: true, tenantId: record.tenant_id };
            }
        }

        // 2. Check Single-Use Recovery Codes
        const recoveryCodes = typeof record.recovery_codes_json === 'string' ? JSON.parse(record.recovery_codes_json) : (record.recovery_codes_json || []);
        const inputHash = crypto.createHash('sha256').update(inputCode).digest('hex');

        let recoveryMatched = false;
        for (const item of recoveryCodes) {
            if (item.code_hash === inputHash && !item.used) {
                item.used = true;
                item.used_at = new Date().toISOString();
                recoveryMatched = true;
                break;
            }
        }

        if (recoveryMatched) {
            await db.query(`UPDATE user_mfa SET recovery_codes_json = ?, failed_attempts = 0, locked_until = NULL WHERE user_id = ?`, [JSON.stringify(recoveryCodes), userId]);
            return { valid: true, tenantId: record.tenant_id, isRecoveryCodeUsed: true };
        }

        // Handle Failure & Lockout
        const newFailed = (record.failed_attempts || 0) + 1;
        let lockTime = null;
        if (newFailed >= 5) {
            lockTime = new Date(Date.now() + (15 * 60 * 1000)); // 15 min lockout
        }

        await db.query(`UPDATE user_mfa SET failed_attempts = ?, locked_until = ? WHERE user_id = ?`, [newFailed, lockTime, userId]);
        return { valid: false, reason: newFailed >= 5 ? 'MFA_LOCKED_TEMPORARILY' : 'INVALID_MFA_CODE' };
    }

    /**
     * Checks whether a user has active confirmed MFA.
     */
    async getUserMfaStatus(userId) {

        const [record] = await db.query(`SELECT is_confirmed, created_at FROM user_mfa WHERE user_id = ?`, [userId]).catch(() => []);
        return {
            mfaEnabled: Boolean(record && record.is_confirmed),
            confirmedAt: record && record.is_confirmed ? record.created_at : null
        };
    }

    /**
     * Disables MFA for a user with re-authentication verification.
     */
    async disableMfa(userId, tenantId) {

        await db.query(`DELETE FROM user_mfa WHERE user_id = ? AND tenant_id = ?`, [userId, tenantId]);
        return { ok: true, message: 'MFA disabled successfully' };
    }
}

module.exports = new UserMfaService();
