/**
 * src/api/routes/governedOrderRoutingRoutes.js
 * 
 * Phase 192D Governed Order Routing Endpoints.
 * Mounted at /api/orders
 * 
 * Endpoints:
 *   POST /:orderId/routing/eligibility - Evaluate routing eligibility for candidate Printhouse
 *   POST /:orderId/route               - Commit governed routing decision
 *   GET  /:orderId/routing             - Get active committed routing decision for order
 */
const express = require('express');
const router = express.Router();
const eligibilityService = require('../services/routingEligibilityService');
const routingService = require('../services/governedOrderRoutingService');

// POST /api/orders/:orderId/routing/eligibility
router.post('/:orderId/routing/eligibility', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { candidatePrinthouseId, siteId, tenantId } = req.body || {};

        const result = await eligibilityService.evaluateEligibility({
            orderId,
            tenantId,
            candidatePrinthouseId,
            siteId
        });

        res.json({
            success: true,
            eligibility: result
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({
            success: false,
            error: err.message
        });
    }
});

// POST /api/orders/:orderId/route
router.post('/:orderId/route', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { candidatePrinthouseId, siteId, tenantId, actorId } = req.body || {};

        const result = await routingService.createRoutingDecision({
            orderId,
            tenantId,
            candidatePrinthouseId,
            siteId,
            actorId
        });

        res.json({
            success: true,
            idempotent: result.idempotent,
            routingDecision: result.routingDecision
        });
    } catch (err) {
        res.status(err.statusCode || 403).json({
            success: false,
            error: err.message,
            code: err.code || 'ROUTING_DECISION_FAILED',
            reasons: err.reasons || []
        });
    }
});

// GET /api/orders/:orderId/routing
router.get('/:orderId/routing', async (req, res) => {
    try {
        const { orderId } = req.params;
        const decision = await routingService.getRoutingDecision(orderId);

        if (!decision) {
            return res.status(404).json({
                success: false,
                code: 'ROUTING_DECISION_NOT_FOUND',
                error: `No active routing decision found for order '${orderId}'`
            });
        }

        res.json({
            success: true,
            routingDecision: decision
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({
            success: false,
            error: err.message
        });
    }
});

module.exports = router;
