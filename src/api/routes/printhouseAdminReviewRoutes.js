/**
 * src/api/routes/printhouseAdminReviewRoutes.js
 * 
 * Phase 191H: Admin Governance Routes for Printhouse Review & Controlled Activation.
 * Mounted at /api/admin/printhouse-reviews
 */
const express = require('express');
const router = express.Router();
const reviewService = require('../services/printhouseMarketplaceReviewService');
const activationService = require('../services/printhouseActivationGovernanceService');

function getAdminActor(req) {
    return {
        id: req.user?.id || 'admin-actor-1',
        role: req.user?.role || 'SUPER_ADMIN',
        email: req.user?.email || 'admin@printprice.pro'
    };
}

// GET /api/admin/printhouse-reviews - List review queue
router.get('/', async (req, res) => {
    try {
        const queue = await reviewService.listReviewQueue(req.query.status || null);
        res.json({
            success: true,
            total: queue.length,
            reviews: queue
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/admin/printhouse-reviews/:reviewId - Get review detail
router.get('/:reviewId', async (req, res) => {
    try {
        const review = await reviewService.getReviewById(null, req.params.reviewId);
        res.json({ success: true, review });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

// POST /api/admin/printhouse-reviews/:reviewId/start - Start review
router.post('/:reviewId/start', async (req, res) => {
    try {
        const reviewer = getAdminActor(req);
        const review = await reviewService.startReview(req.params.reviewId, reviewer);
        res.json({ success: true, message: 'Review started', review });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

// POST /api/admin/printhouse-reviews/:reviewId/request-changes - Request changes
router.post('/:reviewId/request-changes', async (req, res) => {
    try {
        const reviewer = getAdminActor(req);
        const { reasonCode, explanation } = req.body || {};
        const review = await reviewService.requestChanges(req.params.reviewId, reasonCode, explanation, reviewer);
        res.json({ success: true, message: 'Changes requested from Printhouse', review });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

// POST /api/admin/printhouse-reviews/:reviewId/approve - Approve review
router.post('/:reviewId/approve', async (req, res) => {
    try {
        const reviewer = getAdminActor(req);
        const review = await reviewService.approveReview(req.params.reviewId, reviewer);
        res.json({
            success: true,
            message: 'Marketplace review APPROVED. Production routing remains DISABLED until explicit controlled activation.',
            review
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

// POST /api/admin/printhouse-reviews/:reviewId/reject - Reject review
router.post('/:reviewId/reject', async (req, res) => {
    try {
        const reviewer = getAdminActor(req);
        const { reasonCode, explanation } = req.body || {};
        const review = await reviewService.rejectReview(req.params.reviewId, reasonCode, explanation, reviewer);
        res.json({ success: true, message: 'Marketplace review REJECTED', review });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

// POST /api/admin/printhouse-reviews/:reviewId/activate - Atomic Controlled Activation
router.post('/:reviewId/activate', async (req, res) => {
    try {
        const reviewer = getAdminActor(req);
        const grant = await activationService.activateMarketplaceNode(req.params.reviewId, reviewer, req.body || {});
        res.json({
            success: true,
            message: 'Marketplace node ACTIVATED successfully with atomic capability grants.',
            grant
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: err.message, code: err.code || 'ACTIVATION_FAILED' });
    }
});

// POST /api/admin/printhouse-reviews/:reviewId/suspend - Suspend activation
router.post('/:reviewId/suspend', async (req, res) => {
    try {
        const reviewer = getAdminActor(req);
        const review = await reviewService.getReviewById(null, req.params.reviewId);
        await reviewService.suspendReview(req.params.reviewId, req.body?.reasonCode, req.body?.explanation, reviewer);
        const result = await activationService.suspendActivation(review.tenantId, req.body?.reasonCode, reviewer);

        res.json({
            success: true,
            message: 'Marketplace node SUSPENDED. Production routing disabled.',
            result
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

module.exports = router;
