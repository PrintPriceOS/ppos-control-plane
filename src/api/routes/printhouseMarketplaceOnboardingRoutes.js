/**
 * src/api/routes/printhouseMarketplaceOnboardingRoutes.js
 * 
 * Phase 191H: Printhouse Self-Service Marketplace Review Endpoints.
 * Mounted at /api/printhouse/onboarding
 * 
 * Includes:
 *   POST /submit-for-review - Submit onboarding setup for governed admin review
 *   GET  /review-status     - Fetch current review and readiness status
 */
const express = require('express');
const router = express.Router();
const reviewService = require('../services/printhouseMarketplaceReviewService');
const readinessService = require('../services/printhouseReadinessService');

// Middleware to extract tenant_id from user claims
function getTenantId(req) {
    return req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || 'ph-tenant-default';
}

// POST /api/printhouse/onboarding/submit-for-review
router.post('/submit-for-review', async (req, res) => {
    try {
        reviewService.constructor.validateNoProtectedFields(req.body);
        const tenantId = getTenantId(req);
        const siteId = req.body?.siteId || null;
        const actor = { role: req.user?.role || 'PRINTHOUSE_ADMIN', tenantId, email: req.user?.email };

        const review = await reviewService.submitForReview(tenantId, siteId, actor);
        res.status(201).json({
            success: true,
            message: 'Onboarding setup submitted for admin review successfully.',
            review
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({
            success: false,
            error: err.message,
            code: err.code || 'SUBMISSION_FAILED',
            details: err.details || null
        });
    }
});

// GET /api/printhouse/onboarding/review-status
router.get('/review-status', async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const reviewStatus = await reviewService.getReviewStatus(tenantId);
        const readiness = await readinessService.computeReadiness(tenantId);

        res.json({
            success: true,
            tenantId,
            reviewStatus,
            readinessSummary: readiness
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({
            success: false,
            error: err.message
        });
    }
});

module.exports = router;
