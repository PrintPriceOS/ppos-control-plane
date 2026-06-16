const express = require('express');
const router = express.Router();
const onboardingObservabilityService = require('../services/onboardingObservabilityService');

// Middleware for auth
const { ensureAuthenticated, ensureSuperAdmin } = require('../middleware/auth');

// Protect all routes
router.use(ensureAuthenticated);
router.use(ensureSuperAdmin);

/**
 * GET /api/admin/observability/radar
 * Fetches captured vs rebounded order metrics.
 */
router.get('/radar', async (req, res) => {
    try {
        const metrics = await onboardingObservabilityService.getRadarMetrics();
        res.json({ success: true, metrics });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Failed to fetch radar metrics' });
    }
});

/**
 * GET /api/admin/observability/funnel
 * Fetches the activation funnel counts (Registered, Webhooks, Verified).
 */
router.get('/funnel', async (req, res) => {
    try {
        const funnel = await onboardingObservabilityService.getActivationFunnel();
        res.json({ success: true, funnel });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Failed to fetch activation funnel' });
    }
});

/**
 * GET /api/admin/observability/stalled
 * Fetches tenants stuck in onboarding for more than 24 hours.
 */
router.get('/stalled', async (req, res) => {
    try {
        const stalled = await onboardingObservabilityService.getStalledTenants();
        res.json({ success: true, stalled });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Failed to fetch stalled tenants' });
    }
});

/**
 * POST /api/admin/observability/stalled/:tenantId/remind
 * Triggers a reminder and logs the action in the audit logs.
 */
router.post('/stalled/:tenantId/remind', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const result = await onboardingObservabilityService.sendStalledReminder(tenantId, req.user);
        res.json(result);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message || 'Failed to send reminder' });
    }
});

module.exports = router;
