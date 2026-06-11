const express = require('express');
const router = express.Router();
const CohortExpansionReviewService = require('../services/cohortExpansionReviewService');
const BetaHardeningActionService = require('../services/betaHardeningActionService');
const ExpansionApprovalGatingEngine = require('../services/expansionApprovalGatingEngine');

const reviewSvc = new CohortExpansionReviewService();
const actionSvc = new BetaHardeningActionService();
const gateSvc = new ExpansionApprovalGatingEngine({ betaHardeningActionService: actionSvc });

router.use((req, res, next) => {
    req.actor = { role: 'OPS_ADMIN', userId: 'admin_1' }; // Mock actor
    req.tenantId = 't_1';
    req.cohortId = req.query.cohortId || 'c_1';
    next();
});

router.post('/reviews', async (req, res) => {
    try {
        const review = await reviewSvc.requestExpansionReview({ 
            cohortId: req.cohortId, 
            tenantId: req.tenantId, 
            notes: req.body.notes, 
            actor: req.actor 
        });
        res.json({ success: true, review });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/reviews/:reviewId/decisions', async (req, res) => {
    try {
        const review = await reviewSvc.recordExpansionDecision({ 
            reviewId: req.params.reviewId, 
            decision: req.body.decision, 
            notes: req.body.notes, 
            actor: req.actor 
        });
        res.json({ success: true, review });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.get('/reviews', async (req, res) => {
    try {
        const reviews = await reviewSvc.listExpansionReviews({ cohort_id: req.cohortId }, req.actor);
        res.json({ success: true, reviews });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/actions', async (req, res) => {
    try {
        const action = await actionSvc.createHardeningAction({ 
            tenantId: req.tenantId, 
            cohortId: req.cohortId, 
            expansionReviewId: req.body.expansionReviewId,
            category: req.body.category,
            severity: req.body.severity,
            isMandatory: req.body.isMandatory,
            description: req.body.description,
            actor: req.actor 
        });
        res.json({ success: true, action });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/actions/:actionId/resolve', async (req, res) => {
    try {
        const action = await actionSvc.resolveHardeningAction({ 
            actionId: req.params.actionId, 
            resolutionNotes: req.body.resolutionNotes, 
            actor: req.actor 
        });
        res.json({ success: true, action });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.get('/actions', async (req, res) => {
    try {
        const actions = await actionSvc.listHardeningActions({ cohort_id: req.cohortId }, req.actor);
        res.json({ success: true, actions });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.get('/readiness', async (req, res) => {
    try {
        const readiness = await gateSvc.checkExpansionReadiness({ 
            cohortId: req.cohortId, 
            tenantId: req.tenantId, 
            actor: req.actor 
        });
        res.json({ success: true, readiness });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

module.exports = router;
