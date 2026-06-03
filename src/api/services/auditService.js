const db = require('./db');
const crypto = require('crypto');

const auditLogger = require('./auditLoggerService');

class AuditService {
    async logAction(tenantId, action, params = {}) {
        const { jobId, policySlug, ipAddress, details } = params;
        try {
            await auditLogger.log({
                type: action,
                tenantId: tenantId || 'default',
                userId: 'system',
                status: 'SUCCESS',
                metadata: {
                    job_id: jobId || null,
                    policy_slug: policySlug || null,
                    ip_address: ipAddress || '0.0.0.0',
                    details: details || null
                }
            });
        } catch (err) {
            console.error('[AUDIT-LOG-ERROR]', err.message);
        }
    }

    async logGuardrail(tenantId, action, rationale, details = {}) {
        return this.logAction(tenantId, `GUARDRAIL_${action}`, {
            details: { rationale, ...details }
        });
    }

    async logCircuitBreaker(state, reason) {
        return this.logAction('system', `CIRCUIT_BREAKER_${state}`, {
            details: { reason }
        });
    }

    generateSignedUrl(assetId, expiresInSeconds = 3600) {
        const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
        const secret = process.env.APP_SECRET || 'dev-secret-key-123';
        const signature = crypto.createHmac('sha256', secret)
            .update(`${assetId}:${expires}`)
            .digest('hex');

        return `/api/v2/preflight/assets/${assetId}?expires=${expires}&sig=${signature}`;
    }

    verifySignedUrl(assetId, expires, signature) {
        if (!expires || !signature) return false;

        const now = Math.floor(Date.now() / 1000);
        const expiresInt = parseInt(expires);

        // 1. Check if expired
        if (now > expiresInt) return false;

        // 2. Check maximum window (Security recommendation: max 1 hour)
        const MAX_WINDOW = 3600;
        if (expiresInt - now > MAX_WINDOW) {
            console.warn(`[SECURITY][SIGNED-URL] Expiry window too large for asset ${assetId}: ${expiresInt - now}s`);
            return false;
        }

        const secret = process.env.APP_SECRET || 'dev-secret-key-123';
        const expected = crypto.createHmac('sha256', secret)
            .update(`${assetId}:${expires}`)
            .digest('hex');

        return signature === expected;
    }
}

module.exports = new AuditService();
