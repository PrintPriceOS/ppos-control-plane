/**
 * src/api/routes/adminProductionMonitoring.js
 * 
 * Express router for Production Monitoring and SLA Dashboard administrative control.
 */

const express = require('express');
const router = express.Router();
const productionMonitoringService = require('../services/productionMonitoringService');
const queueMonitoringService = require('../services/productionQueueMonitoringService');
const machineLoadMonitoringService = require('../services/machineLoadMonitoringService');
const productionIncidentService = require('../services/productionIncidentService');
const slaEvaluationService = require('../services/slaEvaluationService');
const { resolveActorContext } = require('../middleware/auth');

function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(err => {
            console.error('[PRODUCTION-MONITORING-ROUTE-ERROR]', err);
            res.status(500).json({
                ok: false,
                error: {
                    code: 'PRODUCTION_MONITORING_SYSTEM_ERROR',
                    message: err.message
                }
            });
        });
    };
}

/**
 * GET /api/admin/production-monitoring/overview
 */
router.get('/overview', asyncHandler(async (req, res) => {
    const actor = resolveActorContext(req);
    const tenantId = req.query.tenantId;
    const printhouseId = req.query.printhouseId;
    const result = await queueMonitoringService.getQueueOverview({ tenantId, printhouseId }, actor);
    res.json({ ok: true, ...result });
}));

/**
 * GET /api/admin/production-monitoring/timeline/:orderId/:jobId
 */
router.get('/timeline/:orderId/:jobId', asyncHandler(async (req, res) => {
    const actor = resolveActorContext(req);
    const { orderId, jobId } = req.params;
    const events = await productionMonitoringService.getProductionTimeline({ orderId, jobId }, actor);
    res.json({ ok: true, events });
}));

/**
 * GET /api/admin/production-monitoring/incidents
 */
router.get('/incidents', asyncHandler(async (req, res) => {
    const actor = resolveActorContext(req);
    const { tenantId, printhouseId, status, severity } = req.query;
    const incidents = await productionIncidentService.listIncidents({ tenantId, printhouseId, status, severity }, actor);
    res.json({ ok: true, incidents });
}));

/**
 * POST /api/admin/production-monitoring/incidents
 */
router.post('/incidents', asyncHandler(async (req, res) => {
    const actor = resolveActorContext(req);
    const incident = await productionIncidentService.createIncident(req.body, actor);
    res.json({ ok: true, incident });
}));

/**
 * POST /api/admin/production-monitoring/incidents/:incidentId/acknowledge
 */
router.post('/incidents/:incidentId/acknowledge', asyncHandler(async (req, res) => {
    const actor = resolveActorContext(req);
    const { incidentId } = req.params;
    const incident = await productionIncidentService.acknowledgeIncident({ incidentId, actor });
    res.json({ ok: true, incident });
}));

/**
 * POST /api/admin/production-monitoring/incidents/:incidentId/resolve
 */
router.post('/incidents/:incidentId/resolve', asyncHandler(async (req, res) => {
    const actor = resolveActorContext(req);
    const { incidentId } = req.params;
    const { resolutionNotes } = req.body;
    const incident = await productionIncidentService.resolveIncident({ incidentId, resolutionNotes, actor });
    res.json({ ok: true, incident });
}));

/**
 * POST /api/admin/production-monitoring/incidents/:incidentId/dismiss
 */
router.post('/incidents/:incidentId/dismiss', asyncHandler(async (req, res) => {
    const actor = resolveActorContext(req);
    const { incidentId } = req.params;
    const { reason } = req.body;
    const incident = await productionIncidentService.dismissIncident({ incidentId, reason, actor });
    res.json({ ok: true, incident });
}));

/**
 * GET /api/admin/production-monitoring/machines
 */
router.get('/machines', asyncHandler(async (req, res) => {
    const actor = resolveActorContext(req);
    const { tenantId, printhouseId } = req.query;
    const machines = await machineLoadMonitoringService.listMachineLoads({ tenantId, printhouseId }, actor);
    res.json({ ok: true, machines });
}));

/**
 * GET /api/admin/production-monitoring/sla-summary
 */
router.get('/sla-summary', asyncHandler(async (req, res) => {
    const actor = resolveActorContext(req);
    const { tenantId, printhouseId } = req.query;
    const summary = await slaEvaluationService.getSlaDashboardSummary({ tenantId, printhouseId }, actor);
    res.json({ ok: true, summary });
}));

module.exports = router;
