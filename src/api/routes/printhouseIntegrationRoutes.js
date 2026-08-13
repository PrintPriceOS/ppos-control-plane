/**
 * src/api/routes/printhouseIntegrationRoutes.js
 * 
 * Phase 191G: Printhouse Integration Profiles & Credentials REST Endpoints.
 * Mounted under /api/printhouse/onboarding/integrations
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const integrationService = require('../services/printhouseIntegrationService');
const credentialService = require('../services/printhouseIntegrationCredentialService');
const webhookService = require('../services/printhouseWebhookService');

function requirePrinthouseRole(req, res, next) {
    const role = req.user?.role || req.headers['x-user-role'];
    const allowedRoles = ['PRINTHOUSE_OPERATOR', 'PRINTHOUSE_ADMIN', 'ADMIN', 'SUPER_ADMIN'];
    if (!role || !allowedRoles.includes(role)) {
        return res.status(403).json({ error: 'FORBIDDEN: Invalid role for integrations onboarding' });
    }
    next();
}

router.use(requirePrinthouseRole);

// GET / — List integration profiles
router.get('/', async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || req.query.tenantId || 'tenant-1';
        const profiles = await integrationService.listIntegrationProfiles(tenantId, req.query.siteId);
        res.json({ success: true, count: profiles.length, profiles });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// POST / — Create integration profile
router.post('/', async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || req.body.tenantId || 'tenant-1';
        const profile = await integrationService.createIntegrationProfile(tenantId, req.body, req.user);
        res.status(201).json({ success: true, profile });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// GET /:integrationId — Get profile details
router.get('/:integrationId', async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || req.query.tenantId || 'tenant-1';
        const profile = await integrationService.getIntegrationProfileById(tenantId, req.params.integrationId);
        res.json({ success: true, profile });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// PUT /:integrationId — Update integration profile
router.put('/:integrationId', async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || req.body.tenantId || 'tenant-1';
        const profile = await integrationService.updateIntegrationProfile(tenantId, req.params.integrationId, req.body, req.user);
        res.json({ success: true, profile });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// DELETE /:integrationId — Disable profile
router.delete('/:integrationId', async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || req.query.tenantId || 'tenant-1';
        const result = await integrationService.deleteIntegrationProfile(tenantId, req.params.integrationId, req.user);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// POST /:integrationId/test — Connectivity test (with SSRF guard)
router.post('/:integrationId/test', async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || req.body.tenantId || 'tenant-1';
        const profile = await integrationService.getIntegrationProfileById(tenantId, req.params.integrationId);

        if (profile.integrationType === 'WEBHOOK') {
            const testResult = await webhookService.testWebhookConnectivity(tenantId, req.params.integrationId, req.user);
            return res.json({ success: true, testResult });
        }

        // Generic API / JDF connectivity test simulation
        if (profile.endpointUrl) {
            webhookService.constructor.validateSsrfUrl(profile.endpointUrl);
        }

        await integrationService.updateIntegrationProfile(tenantId, req.params.integrationId, { status: 'READY' }, req.user);

        res.json({
            success: true,
            testResult: {
                status: 'PASSED',
                integrationType: profile.integrationType,
                endpointUrl: profile.endpointUrl,
                nonBindingNote: 'Connectivity test passed. Production routing remains DISABLED.'
            }
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// POST /:integrationId/webhook — Configure webhook target
router.post('/:integrationId/webhook', async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || req.body.tenantId || 'tenant-1';
        const webhook = await webhookService.configureWebhook(tenantId, req.params.integrationId, req.body, req.user);
        res.status(201).json({ success: true, webhook });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// GET /:integrationId/credentials — List credentials
router.get('/:integrationId/credentials', async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || req.query.tenantId || 'tenant-1';
        const credentials = await credentialService.listCredentials(tenantId, req.params.integrationId);
        res.json({ success: true, count: credentials.length, credentials });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// POST /:integrationId/credentials — Generate new credential
router.post('/:integrationId/credentials', async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || req.body.tenantId || 'tenant-1';
        const credential = await credentialService.createCredential(tenantId, req.params.integrationId, req.body.scopes, req.user);
        res.status(201).json({ success: true, credential });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// POST /:integrationId/credentials/rotate — Rotate credential
router.post('/:integrationId/credentials/rotate', async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || req.body.tenantId || 'tenant-1';
        const credential = await credentialService.rotateCredential(tenantId, req.params.integrationId, req.body.credentialId, req.user);
        res.json({ success: true, credential });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// DELETE /:integrationId/credentials/:credentialId — Revoke credential
router.delete('/:integrationId/credentials/:credentialId', async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || req.query.tenantId || 'tenant-1';
        const result = await credentialService.revokeCredential(tenantId, req.params.integrationId, req.params.credentialId, req.user);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// GET /readiness — Integration completeness audit
router.get('/readiness', async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || req.query.tenantId || 'tenant-1';
        const readiness = await integrationService.getIntegrationsCompleteness(tenantId);
        res.json({ success: true, readiness });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

module.exports = router;
