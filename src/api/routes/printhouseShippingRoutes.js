/**
 * src/api/routes/printhouseShippingRoutes.js
 * 
 * Phase 191G: Printhouse Shipping Regions & Delivery Configuration REST Endpoints.
 * Mounted under /api/printhouse/onboarding/shipping
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const shippingRegionService = require('../services/printhouseShippingRegionService');
const deliveryEstimateService = require('../services/printhouseDeliveryEstimateService');

function requirePrinthouseRole(req, res, next) {
    const role = req.user?.role || req.headers['x-user-role'];
    const allowedRoles = ['PRINTHOUSE_OPERATOR', 'PRINTHOUSE_ADMIN', 'ADMIN', 'SUPER_ADMIN'];
    if (!role || !allowedRoles.includes(role)) {
        return res.status(403).json({ error: 'FORBIDDEN: Invalid role for shipping onboarding' });
    }
    next();
}

router.use(requirePrinthouseRole);

// GET /regions — List shipping regions
router.get('/regions', async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || req.query.tenantId || 'tenant-1';
        const siteId = req.query.siteId || null;
        const regions = await shippingRegionService.listShippingRegions(tenantId, siteId);
        res.json({ success: true, count: regions.length, regions });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// POST /regions — Create a new shipping region
router.post('/regions', async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || req.body.tenantId || 'tenant-1';
        const siteId = req.body.siteId || 'site-1';
        const region = await shippingRegionService.createShippingRegion(tenantId, siteId, req.body, req.user);
        res.status(201).json({ success: true, region });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// GET /regions/:regionId — Get region details
router.get('/regions/:regionId', async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || req.query.tenantId || 'tenant-1';
        const region = await shippingRegionService.getShippingRegionById(tenantId, req.params.regionId);
        res.json({ success: true, region });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// PUT /regions/:regionId — Update region
router.put('/regions/:regionId', async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || req.body.tenantId || 'tenant-1';
        const region = await shippingRegionService.updateShippingRegion(tenantId, req.params.regionId, req.body, req.user);
        res.json({ success: true, region });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// DELETE /regions/:regionId — Archive region
router.delete('/regions/:regionId', async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || req.query.tenantId || 'tenant-1';
        const result = await shippingRegionService.archiveShippingRegion(tenantId, req.params.regionId, req.user);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// GET /sites/:siteId/methods — List delivery methods for site
router.get('/sites/:siteId/methods', async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || req.query.tenantId || 'tenant-1';
        const methods = await shippingRegionService.listDeliveryMethods(tenantId, req.params.siteId, req.query.regionId);
        res.json({ success: true, count: methods.length, methods });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// POST /sites/:siteId/methods — Add delivery method
router.post('/sites/:siteId/methods', async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || req.body.tenantId || 'tenant-1';
        const regionId = req.body.shippingRegionId || req.query.regionId;
        const methods = await shippingRegionService.addDeliveryMethod(tenantId, req.params.siteId, regionId, req.body, req.user);
        res.status(201).json({ success: true, methods });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// POST /estimate — Non-binding delivery window calculation
router.post('/estimate', async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || req.body.tenantId || 'tenant-1';
        const estimate = await deliveryEstimateService.computeDeliveryEstimate(tenantId, req.body);
        res.json({ success: true, estimate });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// GET /readiness — Shipping completeness audit
router.get('/readiness', async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || req.query.tenantId || 'tenant-1';
        const readiness = await shippingRegionService.getShippingCompleteness(tenantId, req.query.siteId);
        res.json({ success: true, readiness });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

module.exports = router;
