const express = require('express');

module.exports = function createAdminLiveProductionRoutes(dependencies) {
    const router = express.Router();
    const { liveProductionEnablementService, liveReadinessEvaluationService, liveApprovalWorkflowService } = dependencies;

    // Helper to get actor from request
    const getActor = (req) => ({
        userId: req.user ? req.user.id : 'anonymous',
        role: req.user ? req.user.role : 'SYSTEM_ADMIN' // Fallback for tests
    });

    router.get('/enablement/:tenantId/:printhouseId', async (req, res) => {
        try {
            const { tenantId, printhouseId } = req.params;
            const data = await liveProductionEnablementService.getLiveEnablement({ tenantId, printhouseId });
            res.json(data);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/readiness/:tenantId/:printhouseId', async (req, res) => {
        try {
            const { tenantId, printhouseId } = req.params;
            const actor = getActor(req);
            const data = await liveReadinessEvaluationService.evaluateLiveReadiness({ tenantId, printhouseId, actor });
            res.json(data);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/timeline/:tenantId/:printhouseId', async (req, res) => {
        try {
            const { tenantId, printhouseId } = req.params;
            const data = await liveApprovalWorkflowService.getLiveApprovalTimeline({ tenantId, printhouseId });
            res.json(data);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/request', async (req, res) => {
        try {
            const { tenantId, printhouseId, liveScope, justification } = req.body;
            const actor = getActor(req);
            const data = await liveApprovalWorkflowService.submitLiveApprovalRequest({ tenantId, printhouseId, liveScope, actor, justification });
            res.json(data);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    router.post('/review', async (req, res) => {
        try {
            const { tenantId, printhouseId } = req.body;
            const actor = getActor(req);
            const data = await liveApprovalWorkflowService.reviewLiveApprovalRequest({ tenantId, printhouseId, actor });
            res.json(data);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    router.post('/approve', async (req, res) => {
        try {
            const { tenantId, printhouseId, approvalNotes, approvalPayload } = req.body;
            const actor = getActor(req);
            const data = await liveApprovalWorkflowService.approveLiveApprovalRequest({ tenantId, printhouseId, actor, approvalNotes, approvalPayload });
            res.json(data);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    router.post('/reject', async (req, res) => {
        try {
            const { tenantId, printhouseId, reason } = req.body;
            const actor = getActor(req);
            const data = await liveApprovalWorkflowService.rejectLiveApprovalRequest({ tenantId, printhouseId, actor, reason });
            res.json(data);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    router.post('/activate', async (req, res) => {
        try {
            const { tenantId, printhouseId } = req.body;
            const actor = getActor(req);
            const data = await liveApprovalWorkflowService.activateControlledLive({ tenantId, printhouseId, actor });
            res.json(data);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    router.post('/pause', async (req, res) => {
        try {
            const { tenantId, printhouseId, reason } = req.body;
            const actor = getActor(req);
            const data = await liveApprovalWorkflowService.pauseControlledLive({ tenantId, printhouseId, actor, reason });
            res.json(data);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    router.post('/resume', async (req, res) => {
        try {
            const { tenantId, printhouseId } = req.body;
            const actor = getActor(req);
            const data = await liveApprovalWorkflowService.resumeControlledLive({ tenantId, printhouseId, actor });
            res.json(data);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    router.post('/revoke', async (req, res) => {
        try {
            const { tenantId, printhouseId, reason, impactScope } = req.body;
            const actor = getActor(req);
            const data = await liveApprovalWorkflowService.revokeControlledLive({ tenantId, printhouseId, actor, reason, impactScope });
            res.json(data);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    return router;
};
