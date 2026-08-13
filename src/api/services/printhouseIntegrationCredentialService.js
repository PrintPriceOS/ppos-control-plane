/**
 * src/api/services/printhouseIntegrationCredentialService.js
 * 
 * Phase 191G: Integration Credentials & API Keys Governance Service.
 * Handles server-side credential generation, single-reveal secrets, bcrypt/SHA256 hashes,
 * AES-256-GCM encryption at rest, rotation, revocation, and strict secret redaction in audits.
 */
const crypto = require('crypto');
const db = require('./mysqlClient');

const SECRET_KEY_32 = crypto.createHash('sha256').update(process.env.ENCRYPTION_SECRET || 'ppos-phase191g-default-secret-key-32').digest();

class PrinthouseIntegrationCredentialService {

    static encryptSecret(plainText) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', SECRET_KEY_32, iv);
        let encrypted = cipher.update(plainText, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    }

    static decryptSecret(cipherText) {
        if (!cipherText || typeof cipherText !== 'string' || !cipherText.includes(':')) return null;
        const parts = cipherText.split(':');
        if (parts.length !== 3) return null;
        const [ivHex, authTagHex, encryptedHex] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', SECRET_KEY_32, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    static hashSecret(plainText) {
        return crypto.createHash('sha256').update(plainText).digest('hex');
    }

    async createCredential(tenantId, profileId, scopes = ['read', 'write'], actor = null) {
        const credId = `icred_${crypto.randomUUID()}`;
        const keyId = `phkey_${crypto.randomBytes(8).toString('hex')}`;
        const rawSecret = `phsec_${crypto.randomBytes(24).toString('hex')}`;

        const keyHash = PrinthouseIntegrationCredentialService.hashSecret(rawSecret);
        const ciphertext = PrinthouseIntegrationCredentialService.encryptSecret(rawSecret);
        const secretPrefix = rawSecret.slice(0, 10) + '...';
        const scopesJson = JSON.stringify(Array.isArray(scopes) ? scopes : ['read', 'write']);

        const query = `
            INSERT INTO printhouse_integration_credentials
            (id, integration_profile_id, tenant_id, key_id, key_hash, secret_ciphertext, secret_prefix, scopes_json, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
        `;

        await db.query(query, [credId, profileId, tenantId, keyId, keyHash, ciphertext, secretPrefix, scopesJson]);

        // Audit event with REDACTED secret
        await this._recordAudit(tenantId, 'INTEGRATION_CREDENTIAL', credId, 'CREATED', actor, {
            keyId,
            secretPrefix,
            scopes,
            rawSecretExposed: 'ONCE_UPON_CREATION_REDACTED_FROM_LOGS'
        });

        return {
            id: credId,
            integrationProfileId: profileId,
            tenantId,
            keyId,
            secretPrefix,
            scopes,
            status: 'ACTIVE',
            // ONE-TIME SINGLE REVEAL
            oneTimeSecret: rawSecret,
            warning: 'Store this secret securely. It will NEVER be displayed again.'
        };
    }

    async listCredentials(tenantId, profileId) {
        const rows = await db.query(
            'SELECT id, integration_profile_id, tenant_id, key_id, secret_prefix, scopes_json, last_used_at, expires_at, status, created_at FROM printhouse_integration_credentials WHERE tenant_id = ? AND integration_profile_id = ? ORDER BY created_at DESC',
            [tenantId, profileId]
        );

        return rows.map(r => ({
            id: r.id,
            integrationProfileId: r.integration_profile_id,
            tenantId: r.tenant_id,
            keyId: r.key_id,
            secretPrefix: r.secret_prefix,
            scopes: typeof r.scopes_json === 'string' ? JSON.parse(r.scopes_json) : (r.scopes_json || []),
            lastUsedAt: r.last_used_at,
            expiresAt: r.expires_at,
            status: r.status,
            createdAt: r.created_at,
            maskedSecret: '••••••••••••••••'
        }));
    }

    async rotateCredential(tenantId, profileId, credentialId, actor = null) {
        // Mark old credential as ROTATED
        await db.query(
            'UPDATE printhouse_integration_credentials SET status = "ROTATED" WHERE id = ? AND tenant_id = ? AND integration_profile_id = ?',
            [credentialId, tenantId, profileId]
        );

        await this._recordAudit(tenantId, 'INTEGRATION_CREDENTIAL', credentialId, 'ROTATED', actor, {});

        // Issue new active credential
        return this.createCredential(tenantId, profileId, ['read', 'write'], actor);
    }

    async revokeCredential(tenantId, profileId, credentialId, actor = null) {
        await db.query(
            'UPDATE printhouse_integration_credentials SET status = "REVOKED" WHERE id = ? AND tenant_id = ? AND integration_profile_id = ?',
            [credentialId, tenantId, profileId]
        );

        await this._recordAudit(tenantId, 'INTEGRATION_CREDENTIAL', credentialId, 'REVOKED', actor, {});
        return { success: true, revokedId: credentialId };
    }

    async _recordAudit(tenantId, entityType, entityId, action, actor, changes) {
        const auditId = `shaud_${crypto.randomUUID()}`;
        const query = `
            INSERT INTO printhouse_shipping_integration_audits
            (id, tenant_id, entity_type, entity_id, action, actor_json, changes_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        await db.query(query, [
            auditId, tenantId, entityType, entityId, action,
            JSON.stringify(actor || { role: 'SYSTEM' }),
            JSON.stringify(changes || {})
        ]);
    }
}

module.exports = new PrinthouseIntegrationCredentialService();
