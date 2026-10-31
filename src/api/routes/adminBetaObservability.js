const express = require('express');
const router = express.Router();
const BetaObservabilityEventService = require('../services/betaObservabilityEventService');
const BetaFunnelAggregationService = require('../services/betaFunnelAggregationService');
const BetaHealthAlertService = require('../services/betaHealthAlertService');

const obsSvc = new BetaObservabilityEventService();
const aggSvc = new BetaFunnelAggregationService({ betaObservabilityEventService: obsSvc });
const alertSvc = new BetaHealthAlertService({ betaFunnelAggregationService: aggSvc });

router.use((req, res, next) => {
    req.actor = { role: 'OPS_ADMIN', userId: 'admin_1' }; // Mock actor
    req.tenantId = 't_1';
    req.cohortId = req.query.cohortId || 'c_1';
    next();
});

router.get('/overview', async (req, res) => {
    try {
        const funnel = await aggSvc.computeBetaFunnel({ cohortId: req.cohortId, tenantId: req.tenantId, actor: req.actor });
        res.json({ success: true, overview: funnel });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.get('/funnel', async (req, res) => {
    try {
        const funnel = await aggSvc.computeBetaFunnel({ cohortId: req.cohortId, tenantId: req.tenantId, actor: req.actor });
        res.json({ success: true, funnel });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.get('/stages', async (req, res) => {
    try {
        const counts = await aggSvc.computeStageCounts({ cohortId: req.cohortId, tenantId: req.tenantId, actor: req.actor });
        res.json({ success: true, stages: counts });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.get('/dropoffs', async (req, res) => {
    try {
        const dropOffs = await aggSvc.computeDropOffs({ cohortId: req.cohortId, tenantId: req.tenantId, actor: req.actor });
        res.json({ success: true, dropOffs });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.get('/cohorts/:cohortId/performance', async (req, res) => {
    try {
        const perf = await aggSvc.computeCohortPerformance({ cohortId: req.params.cohortId, actor: req.actor });
        res.json({ success: true, performance: perf });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.get('/events', async (req, res) => {
    try {
        const events = await obsSvc.listBetaFunnelEvents({ tenant_id: req.tenantId, cohort_id: req.cohortId }, req.actor);
        res.json({ success: true, events });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.get('/alerts', async (req, res) => {
    try {
        res.json({ success: true, alerts: alertSvc._mockAlerts });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/alerts/:alertId/acknowledge', async (req, res) => {
    try {
        const alert = await alertSvc.acknowledgeBetaAlert({ alertId: req.params.alertId, actor: req.actor });
        res.json({ success: true, alert });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/alerts/:alertId/resolve', async (req, res) => {
    try {
        const alert = await alertSvc.resolveBetaAlert({ alertId: req.params.alertId, resolutionNotes: req.body.notes, actor: req.actor });
        res.json({ success: true, alert });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/alerts/:alertId/dismiss', async (req, res) => {
    try {
        const alert = await alertSvc.dismissBetaAlert({ alertId: req.params.alertId, reason: req.body.reason, actor: req.actor });
        res.json({ success: true, alert });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

module.exports = router;
