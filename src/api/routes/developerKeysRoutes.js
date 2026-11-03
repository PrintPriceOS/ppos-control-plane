/**
 * src/api/routes/developerKeysRoutes.js
 *
 * Phase 199A: Self-Service Developer Hub & Metered API Gateway Routes.
 * Mounted at /api/developer/keys (and /api/developer)
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const developerApiKeyService = require('../services/developerApiKeyService');
const stripeBillingService = require('../services/stripeBillingService');
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
    const email =
        req.user?.email ||
        req.headers?.['x-user-email'] ||
        req.body?.userEmail ||
        null;

    return {
        tenantId: String(tenantId),
        userId: String(userId),
        userEmail: email ? String(email) : null,
        actor: { id: String(userId), role: String(role).toUpperCase(), tenantId: String(tenantId), email }
    };
}

// POST /api/developer/billing/create-checkout-session (and /api/developer/keys/billing/create-checkout-session)
async function handleCreateCheckoutSession(req, res) {
    try {
        const { tenantId, userId, userEmail } = resolveTenantAndUser(req);
        const { returnUrl, monthlySpendCapEur, idempotencyKey } = req.body || {};
        const session = await stripeBillingService.createCheckoutSession({
            tenantId,
            userId,
            userEmail: req.body?.userEmail || userEmail,
            returnUrl: returnUrl || 'https://control.printprice.pro/developers',
            monthlySpendCapEur: monthlySpendCapEur ?? 150.00,
            idempotencyKey: idempotencyKey || req.headers?.['idempotency-key'] || null
        });
        res.status(200).json({
            ok: true,
            success: true,
            session,
            sessionId: session.sessionId,
            url: session.url,
            data: session
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({ ok: false, error: err.message });
    }
}

// POST /api/developer/billing/verify-session
async function handleVerifyCheckoutSession(req, res) {
    try {
        const { tenantId } = resolveTenantAndUser(req);
        const sessionId = req.body?.sessionId || req.query?.session_id;
        const subscription = await stripeBillingService.verifyCheckoutSessionOnReturn({
            tenantId,
            sessionId
        });
        res.status(200).json({
            ok: true,
            success: true,
            subscription,
            data: subscription
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({ ok: false, error: err.message });
    }
}

// POST /api/developer/billing/customer-portal
async function handleCustomerPortalSession(req, res) {
    try {
        const { tenantId } = resolveTenantAndUser(req);
        const { customerId, returnUrl } = req.body || {};
        const portal = await stripeBillingService.createCustomerPortalSession({
            tenantId,
            customerId: customerId || null,
            returnUrl: returnUrl || 'https://control.printprice.pro/developers'
        });
        res.status(200).json({
            ok: true,
            success: true,
            portal,
            url: portal.url,
            data: portal
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({ ok: false, error: err.message });
    }
}

// POST /api/developer/billing/spend-cap
async function handleUpdateSpendCap(req, res) {
    try {
        const { tenantId, userEmail } = resolveTenantAndUser(req);
        const { monthlySpendCapEur, alertEmail } = req.body || {};
        const subscription = await stripeBillingService.updateSpendCap({
            tenantId,
            monthlySpendCapEur,
            alertEmail: alertEmail !== undefined ? alertEmail : userEmail
        });
        res.status(200).json({
            ok: true,
            success: true,
            subscription,
            data: subscription
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({ ok: false, error: err.message });
    }
}

router.post('/billing/create-checkout-session', handleCreateCheckoutSession);
router.post('/create-checkout-session', handleCreateCheckoutSession);
router.post('/billing/verify-session', handleVerifyCheckoutSession);
router.post('/verify-session', handleVerifyCheckoutSession);
router.post('/billing/customer-portal', handleCustomerPortalSession);
router.post('/customer-portal', handleCustomerPortalSession);
router.post('/billing/spend-cap', handleUpdateSpendCap);
router.post('/spend-cap', handleUpdateSpendCap);

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

// POST or GET /api/developer/keys/verify-ping & /api/developer/keys/test-ping — Sandbox/Live self-test endpoint protected by authenticateApiKey
async function handleVerifyPing(req, res) {
    try {
        await developerApiKeyService.incrementKeyUsage(
            req.apiKey.id,
            req.apiKey.tenantId,
            req.originalUrl || '/api/developer/keys/test-ping',
            req.method || 'GET',
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
            billingTier: req.apiKey.billingTier,
            rateLimitPerMinute: req.apiKey.rateLimitPerMinute,
            monthlyQuota: req.apiKey.monthlyQuota,
            usageCurrentMonth: req.apiKey.usageCurrentMonth,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
}

router.post('/verify-ping', authenticateApiKey('pricing:read'), handleVerifyPing);
router.get('/verify-ping', authenticateApiKey('pricing:read'), handleVerifyPing);
router.get('/test-ping', authenticateApiKey('pricing:read'), handleVerifyPing);
router.post('/test-ping', authenticateApiKey('pricing:read'), handleVerifyPing);
router.get('/keys/test-ping', authenticateApiKey('pricing:read'), handleVerifyPing);
router.post('/keys/test-ping', authenticateApiKey('pricing:read'), handleVerifyPing);

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

// =========================================================================
// Phase 199D: Developer Webhook Subscriptions, Signing Secret Rotation & Delivery Forensics
// =========================================================================

// GET /api/developer/webhooks (and /api/developer/keys/webhooks) — List endpoints & recent deliveries
async function handleListWebhooks(req, res) {
    try {
        const { tenantId } = resolveTenantAndUser(req);
        const [endpoints, deliveries] = await Promise.all([
            developerApiKeyService.listWebhookEndpoints(tenantId),
            developerApiKeyService.listWebhookDeliveriesForTenant(tenantId)
        ]);
        res.json({
            ok: true,
            success: true,
            tenantId,
            endpoints,
            deliveries,
            data: { endpoints, deliveries }
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({ ok: false, error: err.message });
    }
}

// POST /api/developer/webhooks — Create or update a webhook endpoint subscription
async function handleSaveWebhook(req, res) {
    try {
        const { tenantId, actor } = resolveTenantAndUser(req);
        const endpoint = await developerApiKeyService.saveWebhookEndpoint(tenantId, req.body || {}, actor);
        res.status(200).json({
            ok: true,
            success: true,
            endpoint,
            data: endpoint
        });
    } catch (err) {
        const statusCode = err.message?.includes('SSRF_SECURITY_VIOLATION') ? 400 : (err.statusCode || 500);
        res.status(statusCode).json({ ok: false, error: err.message });
    }
}

// POST /api/developer/webhooks/:subscriptionId/rotate-secret — Atomically rotate whsec_* signing secret
async function handleRotateWebhookSecret(req, res) {
    try {
        const { tenantId, actor } = resolveTenantAndUser(req);
        const rotated = await developerApiKeyService.rotateWebhookEndpointSecret(
            tenantId,
            req.params.subscriptionId,
            actor
        );
        res.status(200).json({
            ok: true,
            success: true,
            webhook: rotated,
            data: rotated
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({ ok: false, error: err.message });
    }
}

// POST /api/developer/webhooks/test-event — Dispatch live HMAC-SHA256 signed test event
async function handleTestWebhookEvent(req, res) {
    try {
        const { tenantId, actor } = resolveTenantAndUser(req);
        const result = await developerApiKeyService.dispatchTestWebhookEvent(tenantId, req.body || {}, actor);
        res.status(200).json({
            ok: true,
            success: true,
            ...result,
            data: result
        });
    } catch (err) {
        const statusCode = err.message?.includes('SSRF_SECURITY_VIOLATION') ? 400 : (err.statusCode || 500);
        res.status(statusCode).json({ ok: false, error: err.message });
    }
}

// POST /api/developer/webhooks/deliveries/:deliveryId/replay — Manual forensic replay
async function handleReplayWebhookDelivery(req, res) {
    try {
        const { tenantId, actor } = resolveTenantAndUser(req);
        const replayed = await developerApiKeyService.replayWebhookDeliveryForTenant(
            tenantId,
            req.params.deliveryId,
            actor
        );
        res.status(200).json({
            ok: true,
            success: true,
            ...replayed,
            data: replayed
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({ ok: false, error: err.message });
    }
}

router.get('/webhooks', handleListWebhooks);
router.post('/webhooks', handleSaveWebhook);
router.post('/webhooks/test-event', handleTestWebhookEvent);
router.post('/webhooks/:subscriptionId/rotate-secret', handleRotateWebhookSecret);
router.post('/webhooks/deliveries/:deliveryId/replay', handleReplayWebhookDelivery);

module.exports = router;

