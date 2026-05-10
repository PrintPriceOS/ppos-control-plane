/**
 * src/api/routes/productionDispatchAdmin.js
 * 
 * Protected admin routes for production dispatch execution and lifecycle management.
 */
const express = require('express');
const router = express.Router();
const orchestrationService = require('../services/productionOrchestrationService');
const scoringService = require('../services/industrialDispatchScoringService');
const { requireAdmin } = require('../middleware/auth');

/**
 * GET /api/admin/dispatch
 * Lists recent production dispatches.
 */
router.get('/', requireAdmin, async (req, res) => {
    try {
        const dispatches = await orchestrationService.getDispatches();
        res.json({ ok: true, dispatches });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/dispatch/assign
 * Executes a production assignment from a recommendation.
 */
router.post('/assign', requireAdmin, async (req, res) => {
    try {
        const { jobId, recommendation } = req.body;
        if (!jobId || !recommendation) {
            return res.status(400).json({ ok: false, error: 'MISSING_DATA' });
        }

        const result = await orchestrationService.assignDispatch(jobId, recommendation);
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/dispatch/:id
 * Returns full dispatch detail including events and reservations.
 */
router.get('/:id', requireAdmin, async (req, res) => {
    try {
        const detail = await orchestrationService.getDispatchDetail(req.params.id);
        if (!detail) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
        res.json({ ok: true, dispatch: detail });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/dispatch/:id/status
 * Updates dispatch status.
 */
router.post('/:id/status', requireAdmin, async (req, res) => {
    try {
        const { status, message } = req.body;
        await orchestrationService.updateStatus(req.params.id, status, message);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/dispatch/:id/reroute
 * Triggers a reroute for a dispatch.
 */
router.post('/:id/reroute', requireAdmin, async (req, res) => {
    try {
        const { reason } = req.body;
        const result = await orchestrationService.reroute(req.params.id, reason);
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/dispatch/score
 * Simulates dispatch scoring for a hypothetical job.
 * SIMULATION ONLY.
 */
router.post('/score', requireAdmin, async (req, res) => {
    try {
        const { jobInput, options } = req.body;
        if (!jobInput) return res.status(400).json({ ok: false, error: 'MISSING_JOB_INPUT' });

        const result = await scoringService.scoreDispatchCandidates(jobInput, options);
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

const executionService = require('../services/industrialDispatchExecutionService');
const heartbeatService = require('../services/industrialHeartbeatService');

/**
 * POST /api/admin/dispatch/create
 * Executes a real industrial dispatch.
 */
router.post('/create', requireAdmin, async (req, res) => {
    try {
        const { jobInput, selectedCandidate, options } = req.body;
        if (!jobInput || !selectedCandidate) {
            return res.status(400).json({ ok: false, error: 'MISSING_DATA' });
        }

        const result = await executionService.createManufacturingDispatch(jobInput, selectedCandidate, {
            ...options,
            operatorId: req.user?.id || 'admin'
        });
        res.json({ ok: true, ...result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/dispatch/:id/rollback
 * Rolls back an active dispatch and releases capacity.
 */
router.post('/:id/rollback', requireAdmin, async (req, res) => {
    try {
        const { reason } = req.body;
        const result = await executionService.rollbackDispatch(req.params.id, req.user?.id || 'admin', reason);
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/dispatch/heartbeat
 * Ingests real-time node heartbeat.
 * In a real production scenario, this might use a node-specific API key.
 */
router.post('/heartbeat', requireAdmin, async (req, res) => {
    try {
        const result = await heartbeatService.processNodeHeartbeat(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/dispatch/telemetry
 * Returns global industrial telemetry overview.
 */
router.get('/telemetry/overview', requireAdmin, async (req, res) => {
    try {
        const telemetry = await heartbeatService.getIndustrialTelemetryOverview();
        res.json({ ok: true, telemetry });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
