const express = require('express');

function createAdminLiveOpsRouter(dependencies) {
    const router = express.Router();
    const aggSvc = dependencies.adminLiveOpsAggregationService;
    const cmdSvc = dependencies.adminLiveOpsCommandService;

    const wrap = fn => (req, res, next) => fn(req, res, next).catch(err => {
        // Sanitize error
        const msg = err.message || 'Internal Server Error';
        res.status(msg.includes('Unauthorized') ? 403 : 400).json({ error: msg });
    });

    // -------------------------------------------------------------------------
    // Aggregation / Queues
    // -------------------------------------------------------------------------
    router.get('/overview', wrap(async (req, res) => {
        const data = await aggSvc.getCommandCenterOverview({ filters: req.query, actor: req.user });
        res.json(data);
    }));

    router.get('/counters', wrap(async (req, res) => {
        const data = await aggSvc.getCommandCenterCounters({ filters: req.query, actor: req.user });
        res.json(data);
    }));

    router.get('/live-orders/:liveOrderId', wrap(async (req, res) => {
        const data = await aggSvc.getLiveOrderCommandDetail({ liveOrderId: req.params.liveOrderId, actor: req.user });
        res.json(data);
    }));

    router.get('/partner-jobs/:partnerLiveJobId', wrap(async (req, res) => {
        const data = await aggSvc.getPartnerJobCommandDetail({ partnerLiveJobId: req.params.partnerLiveJobId, actor: req.user });
        res.json(data);
    }));

    router.get('/incidents', wrap(async (req, res) => {
        const data = await aggSvc.getIncidentCommandQueue({ filters: req.query, actor: req.user });
        res.json(data);
    }));

    router.get('/sla-risk', wrap(async (req, res) => {
        const data = await aggSvc.getSlaRiskCommandQueue({ filters: req.query, actor: req.user });
        res.json(data);
    }));

    router.get('/blocked-handoffs', wrap(async (req, res) => {
        const data = await aggSvc.getBlockedHandoffQueue({ filters: req.query, actor: req.user });
        res.json(data);
    }));

    router.get('/customer-actions', wrap(async (req, res) => {
        const data = await aggSvc.getCustomerActionQueue({ filters: req.query, actor: req.user });
        res.json(data);
    }));

    router.get('/partner-actions', wrap(async (req, res) => {
        const data = await aggSvc.getPartnerActionQueue({ filters: req.query, actor: req.user });
        res.json(data);
    }));

    router.get('/rollback-actions', wrap(async (req, res) => {
        const data = await aggSvc.getRollbackActionQueue({ filters: req.query, actor: req.user });
        res.json(data);
    }));

    router.get('/revocation-impact/:tenantId/:printhouseId', wrap(async (req, res) => {
        const data = await aggSvc.getRevocationImpactView({ tenantId: req.params.tenantId, printhouseId: req.params.printhouseId, actor: req.user });
        res.json(data);
    }));

    router.get('/search', wrap(async (req, res) => {
        const data = await aggSvc.searchCommandCenter({ query: req.query.q, filters: req.query, actor: req.user });
        res.json(data);
    }));

    // -------------------------------------------------------------------------
    // Command Actions
    // -------------------------------------------------------------------------
    router.post('/escalations', wrap(async (req, res) => {
        const data = await cmdSvc.createLiveOpsEscalation({ ...req.body, actor: req.user });
        res.json(data);
    }));

    router.post('/escalations/:escalationId/acknowledge', wrap(async (req, res) => {
        const data = await cmdSvc.acknowledgeLiveOpsEscalation({ escalationId: req.params.escalationId, actor: req.user });
        res.json(data);
    }));

    router.post('/escalations/:escalationId/resolve', wrap(async (req, res) => {
        const data = await cmdSvc.resolveLiveOpsEscalation({ escalationId: req.params.escalationId, resolutionNotes: req.body.resolutionNotes, actor: req.user });
        res.json(data);
    }));

    router.post('/live-orders/:liveOrderId/pause', wrap(async (req, res) => {
        const data = await cmdSvc.pauseLiveOrderFromCommandCenter({ liveOrderId: req.params.liveOrderId, reason: req.body.reason, actor: req.user });
        res.json(data);
    }));

    router.post('/live-orders/:liveOrderId/resume', wrap(async (req, res) => {
        const data = await cmdSvc.resumeLiveOrderFromCommandCenter({ liveOrderId: req.params.liveOrderId, actor: req.user });
        res.json(data);
    }));

    router.post('/live-orders/:liveOrderId/rollback', wrap(async (req, res) => {
        const data = await cmdSvc.triggerLiveOrderRollback({ liveOrderId: req.params.liveOrderId, rollbackType: req.body.rollbackType, reason: req.body.reason, actor: req.user });
        res.json(data);
    }));

    router.post('/live-orders/:liveOrderId/block', wrap(async (req, res) => {
        const data = await cmdSvc.blockLiveOrderFromCommandCenter({ liveOrderId: req.params.liveOrderId, reason: req.body.reason, actor: req.user });
        res.json(data);
    }));

    router.post('/live-enablements/:tenantId/:printhouseId/revoke', wrap(async (req, res) => {
        const data = await cmdSvc.revokeLiveEnablementFromCommandCenter({ tenantId: req.params.tenantId, printhouseId: req.params.printhouseId, reason: req.body.reason, impactScope: req.body.impactScope, actor: req.user });
        res.json(data);
    }));

    router.post('/partner-jobs/:partnerLiveJobId/request-reassignment', wrap(async (req, res) => {
        const data = await cmdSvc.requestPartnerReassignment({ partnerLiveJobId: req.params.partnerLiveJobId, reason: req.body.reason, actor: req.user });
        res.json(data);
    }));

    router.post('/partner-jobs/:partnerLiveJobId/review-completion', wrap(async (req, res) => {
        const data = await cmdSvc.reviewCompletionEvidenceFromCommandCenter({ partnerLiveJobId: req.params.partnerLiveJobId, actor: req.user });
        res.json(data);
    }));

    router.post('/live-orders/:liveOrderId/review-handoff', wrap(async (req, res) => {
        const data = await cmdSvc.reviewHandoffPackageFromCommandCenter({ liveOrderId: req.params.liveOrderId, actor: req.user });
        res.json(data);
    }));

    return router;
}

module.exports = createAdminLiveOpsRouter;
