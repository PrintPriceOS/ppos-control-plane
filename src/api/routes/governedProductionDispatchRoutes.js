/**
 * src/api/routes/governedProductionDispatchRoutes.js
 * 
 * Phase 192E Governed Production Dispatch API Endpoints.
 * Mounted at /api/orders
 * 
 * Endpoints:
 *   POST /:orderId/dispatch/eligibility - Evaluate production dispatch eligibility
 *   POST /:orderId/dispatch             - Commit governed production dispatch
 *   GET  /:orderId/dispatch             - Fetch committed production dispatch record
 */
const express = require('express');
const router = express.Router();
const eligibilityService = require('../services/dispatchEligibilityService');
const dispatchService = require('../services/governedProductionDispatchService');

// POST /api/orders/:orderId/dispatch/eligibility
router.post('/:orderId/dispatch/eligibility', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { printhouseId, siteId, machineId, tenantId } = req.body || {};

        const result = await eligibilityService.evaluateEligibility({
            orderId,
            tenantId,
            printhouseId,
            siteId,
            machineId
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

// POST /api/orders/:orderId/dispatch
router.post('/:orderId/dispatch', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { printhouseId, siteId, machineId, tenantId, actorId } = req.body || {};

        const result = await dispatchService.createProductionDispatch({
            orderId,
            tenantId,
            printhouseId,
            siteId,
            machineId,
            actorId
        });

        res.json({
            success: true,
            idempotent: result.idempotent,
            dispatchRecord: result.dispatchRecord
        });
    } catch (err) {
        res.status(err.statusCode || 403).json({
            success: false,
            error: err.message,
            code: err.code || 'DISPATCH_DECISION_FAILED',
            reasons: err.reasons || []
        });
    }
});

// GET /api/orders/:orderId/dispatch
router.get('/:orderId/dispatch', async (req, res) => {
    try {
        const { orderId } = req.params;
        const record = await dispatchService.getProductionDispatch(orderId);

        if (!record) {
            return res.status(404).json({
                success: false,
                code: 'DISPATCH_RECORD_NOT_FOUND',
                error: `No active production dispatch record found for order '${orderId}'`
            });
        }

        res.json({
            success: true,
            dispatchRecord: record
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({
            success: false,
            error: err.message
        });
    }
});

module.exports = router;
