/**
 * src/api/routes/industrialRoutingAdmin.js
 * 
 * Protected admin routes for industrial routing and autonomous dispatch.
 */
const express = require('express');
const router = express.Router();
const recommendationService = require('../services/dispatchRecommendationService');
const provisioningService = require('../services/industrialProvisioningService');
const { requireAdmin } = require('../middleware/auth');

/**
 * POST /api/admin/routing/recommend
 * Generates ranked dispatch recommendations.
 */
router.post('/recommend', requireAdmin, async (req, res) => {
    try {
        const { specs } = req.body;
        if (!specs) {
            return res.status(400).json({ ok: false, error: 'MISSING_SPECS' });
        }

        const result = await recommendationService.getRecommendations(specs);
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/routing/health
 * Returns routing readiness and missing telemetry indicators.
 */
router.get('/health', requireAdmin, async (req, res) => {
    try {
        const provStatus = await provisioningService.getProvisioningStatus();
        
        const readiness = {
            state: 'LIVE',
            details: {
                nodes: provStatus.printNodes,
                machines: provStatus.machineProfiles,
                pricing: provStatus.pricingProfiles,
                capacity: provStatus.capacityProfiles,
                reliability: provStatus.reliabilityProfiles
            },
            missing: []
        };

        if (provStatus.capacityProfiles === 0) {
            readiness.missing.push('CAPACITY_TELEMETRY');
            readiness.state = 'DEGRADED';
        }
        if (provStatus.reliabilityProfiles === 0) {
            readiness.missing.push('RELIABILITY_METRICS');
            readiness.state = 'DEGRADED';
        }
        if (provStatus.pricingProfiles === 0) {
            readiness.missing.push('PRICING_CONFIG');
            readiness.state = 'CRITICAL';
        }

        res.json({ ok: true, readiness });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
