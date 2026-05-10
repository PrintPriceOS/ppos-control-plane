/**
 * src/api/routes/industrialProvisioningAdmin.js
 * 
 * Protected admin routes for industrial provisioning.
 */
const express = require('express');
const router = express.Router();
const provisioningService = require('../services/industrialProvisioningService');
const { requireAdmin } = require('../middleware/auth');

// Protected: Only SUPER_ADMIN can run write operations
const requireSuperAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'SUPER_ADMIN') {
        return next();
    }
    res.status(403).json({ ok: false, error: 'SUPER_ADMIN_REQUIRED' });
};

/**
 * GET /api/admin/provisioning/status
 */
router.get('/status', requireAdmin, async (req, res) => {
    try {
        const status = await provisioningService.getProvisioningStatus();
        res.json({ ok: true, status });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/provisioning/run
 * Full idempotent bootstrap
 */
router.post('/run', requireAdmin, requireSuperAdmin, async (req, res) => {
    try {
        const summary = await provisioningService.runFullProvisioning();
        res.json({ ok: true, summary });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/provisioning/machines/discover
 */
router.post('/machines/discover', requireAdmin, requireSuperAdmin, async (req, res) => {
    try {
        const count = await provisioningService.discoverMachineProfiles();
        res.json({ ok: true, discovered: count });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/provisioning/pricing/seed
 */
router.post('/pricing/seed', requireAdmin, requireSuperAdmin, async (req, res) => {
    try {
        const count = await provisioningService.seedPricingProfiles();
        res.json({ ok: true, seeded: count });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/provisioning/nodes/sync
 */
router.post('/nodes/sync', requireAdmin, requireSuperAdmin, async (req, res) => {
    try {
        const count = await provisioningService.syncPrinterNodesToPrintNodes();
        res.json({ ok: true, synced: count });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
