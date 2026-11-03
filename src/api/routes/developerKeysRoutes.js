/**
 * src/api/routes/developerKeysRoutes.js
 *
 * Phase 199A: Self-Service Developer Hub & Metered API Gateway Routes.
 * Mounted at /api/developer/keys (and /api/developer)
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const developerApiKeyService = require('../services/developerApiKeyService');
const { authenticateApiKey } = require('../middleware/authenticateApiKey');

function resolveTenantAndUser(req) {
    const tenantId =
        req.user?.tenantId ||
        req.headers?.['x-tenant-id'] ||
        req.body?.tenantId ||
        req.query?.tenantId ||
        'tenant-dev-sandbox';
    const userId =
        req.user?.id ||
        req.headers?.['x-user-id'] ||
        req.body?.userId ||
        'dev-user-1';
    const role =
        req.user?.role ||
        req.headers?.['x-user-role'] ||
        'DEVELOPER_SANDBOX';

    return {
        tenantId: String(tenantId),
        userId: String(userId),
        actor: { id: String(userId), role: String(role).toUpperCase(), tenantId: String(tenantId) }
    };
}

// GET /api/developer/keys — List all API keys + telemetry summary for tenant
router.get('/', async (req, res) => {
    try {
        const { tenantId, actor } = resolveTenantAndUser(req);
        const [keys, telemetry, eligibility] = await Promise.all([
            developerApiKeyService.listApiKeys(tenantId),
            developerApiKeyService.getUsageTelemetry(tenantId),
            developerApiKeyService.checkLiveKeyEligibility(tenantId, actor)
        ]);
        res.json({
            ok: true,
            success: true,
            tenantId,
            keys,
            telemetry,
            liveEligibility: eligibility,
            data: {
                tenantId,
                keys,
                telemetry,
                liveEligibility: eligibility
            }
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({ ok: false, error: err.message });
    }
});

// GET /api/developer/keys/telemetry — Real-time usage, quotas, latency & metered billing summary
router.get('/telemetry', async (req, res) => {
    try {
        const { tenantId } = resolveTenantAndUser(req);
        const telemetry = await developerApiKeyService.getUsageTelemetry(tenantId);
        res.json({ ok: true, success: true, telemetry });
    } catch (err) {
        res.status(err.statusCode || 500).json({ ok: false, error: err.message });
    }
});

// POST /api/developer/keys — Provision a new Sandbox (`pp_test_...`) or Production (`pp_live_...`) API key
router.post('/', async (req, res) => {
    try {
        const { tenantId, userId, actor } = resolveTenantAndUser(req);
        const created = await developerApiKeyService.createApiKey(tenantId, userId, req.body || {}, actor);
        res.status(201).json({
            ok: true,
            success: true,
            apiKey: created,
            data: created
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({
            ok: false,
            error: err.message,
            code: err.code || 'PROVISION_ERROR'
        });
    }
});

// POST /api/developer/keys/upgrade-billing — Activate Production Scale Metered Billing (Stripe Customer link)
router.post('/upgrade-billing', async (req, res) => {
    try {
        const { tenantId, actor } = resolveTenantAndUser(req);
        const { planTier, stripeCustomerId } = req.body || {};
        const upgraded = await developerApiKeyService.upgradeBillingTier(
            tenantId,
            planTier || 'PRODUCTION_SCALE',
            stripeCustomerId || null,
            actor
        );
        res.json({
            ok: true,
            success: true,
            billing: upgraded,
            data: upgraded
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({ ok: false, error: err.message });
    }
});

// POST /api/developer/keys/verify-ping — Sandbox/Live self-test endpoint protected by authenticateApiKey
router.post('/verify-ping', authenticateApiKey('pricing:read'), async (req, res) => {
    try {
        await developerApiKeyService.incrementKeyUsage(
            req.apiKey.id,
            req.apiKey.tenantId,
            '/api/developer/keys/verify-ping',
            'POST',
            200,
            11
        );
        res.json({
            ok: true,
            success: true,
            message: 'API Key authenticated and verified.',
            keyPrefix: req.apiKey.keyPrefix,
            keyType: req.apiKey.keyType,
            tenantId: req.apiKey.tenantId,
            scopes: req.apiKey.scopes,
            billingTier: req.apiKey.billingTier
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// POST /api/developer/keys/:keyId/rotate — Atomically rotate an API key
router.post('/:keyId/rotate', async (req, res) => {
    try {
        const { tenantId, actor } = resolveTenantAndUser(req);
        const rotated = await developerApiKeyService.rotateApiKey(tenantId, req.params.keyId, actor);
        res.json({
            ok: true,
            success: true,
            apiKey: rotated,
            data: rotated
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({ ok: false, error: err.message });
    }
});

// DELETE /api/developer/keys/:keyId — Immediately revoke an API key
router.delete('/:keyId', async (req, res) => {
    try {
        const { tenantId, actor } = resolveTenantAndUser(req);
        const revoked = await developerApiKeyService.revokeApiKey(tenantId, req.params.keyId, actor);
        res.json({
            ok: true,
            success: true,
            revoked
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({ ok: false, error: err.message });
    }
});

module.exports = router;

