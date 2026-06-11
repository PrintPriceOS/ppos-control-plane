const express = require('express');

function createAdminMarketplaceLaunchRouter(dependencies) {
    const router = express.Router();
    const ctlSvc = dependencies.marketplaceLaunchControlService;
    const wfSvc = dependencies.marketplaceLaunchWorkflowService;
    const rdSvc = dependencies.marketplaceLaunchReadinessService;
    const guardSvc = dependencies.publicMarketplaceGuardService;

    const wrap = fn => (req, res, next) => fn(req, res, next).catch(err => {
        const msg = err.message || 'Internal Server Error';
        res.status(msg.includes('Unauthorized') ? 403 : 400).json({ error: msg });
    });

    router.get('/state', wrap(async (req, res) => {
        const state = await ctlSvc.getLaunchControlState(req.user);
        res.json(state);
    }));

    router.get('/readiness', wrap(async (req, res) => {
        const snapshot = await rdSvc.buildLaunchReadinessSnapshot({ actor: req.user });
        res.json(rdSvc.sanitizeLaunchReadinessForRole(snapshot, req.user));
    }));

    router.get('/cohorts', wrap(async (req, res) => {
        const state = await ctlSvc.buildLaunchControlSnapshot(req.user);
        res.json(state.cohorts || []);
    }));

    router.post('/cohorts', wrap(async (req, res) => {
        const cohort = await ctlSvc.createLaunchCohort({ payload: req.body, actor: req.user });
        res.json(cohort);
    }));

    router.post('/cohorts/:cohortId/activate', wrap(async (req, res) => {
        const cohort = await ctlSvc.activateLaunchCohort({ cohortId: req.params.cohortId, actor: req.user });
        res.json(cohort);
    }));

    router.post('/cohorts/:cohortId/pause', wrap(async (req, res) => {
        const cohort = await ctlSvc.pauseLaunchCohort({ cohortId: req.params.cohortId, reason: req.body.reason, actor: req.user });
        res.json(cohort);
    }));

    router.post('/request-review', wrap(async (req, res) => {
        const state = await wfSvc.submitLaunchReviewRequest({ actor: req.user, justification: req.body.justification });
        res.json(state);
    }));

    router.post('/approve', wrap(async (req, res) => {
        const state = await wfSvc.approveMarketplaceLaunch({ actor: req.user, approvalPayload: req.body });
        res.json(state);
    }));

    router.post('/reject', wrap(async (req, res) => {
        const state = await wfSvc.rejectMarketplaceLaunch({ actor: req.user, reason: req.body.reason });
        res.json(state);
    }));

    router.post('/activate-limited-rollout', wrap(async (req, res) => {
        const state = await wfSvc.activateLimitedRollout({ cohortId: req.body.cohortId, actor: req.user });
        res.json(state);
    }));

    router.post('/pause', wrap(async (req, res) => {
        const state = await wfSvc.pauseMarketplaceLaunch({ actor: req.user, reason: req.body.reason });
        res.json(state);
    }));

    router.post('/resume', wrap(async (req, res) => {
        const state = await wfSvc.resumeMarketplaceLaunch({ actor: req.user });
        res.json(state);
    }));

    router.post('/emergency-stop', wrap(async (req, res) => {
        const state = await wfSvc.triggerMarketplaceEmergencyStop({ actor: req.user, reason: req.body.reason });
        res.json(state);
    }));

    router.post('/rollback', wrap(async (req, res) => {
        const state = await wfSvc.rollbackMarketplaceLaunch({ actor: req.user, reason: req.body.reason });
        res.json(state);
    }));

    router.get('/guard-decisions', wrap(async (req, res) => {
        const decisions = guardSvc._mockDecisions || [];
        res.json(decisions);
    }));

    router.get('/timeline', wrap(async (req, res) => {
        const timeline = await wfSvc.getLaunchWorkflowTimeline(req.user);
        res.json(timeline);
    }));

    return router;
}

module.exports = createAdminMarketplaceLaunchRouter;
