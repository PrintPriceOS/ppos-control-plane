const express = require('express');
const router = express.Router();
const db = require('../services/db');
const autonomousOrchestrator = require('../services/autonomousOrchestrator');
const autoDispatch = require('../services/autonomousDispatchService');
const slaMonitor = require('../services/slaMonitoringService');
const autoReroute = require('../services/autonomousRerouteService');
const learningLoop = require('../services/manufacturingLearningService');

/**
 * GET /api/admin/autonomous/status
 * Exposes autonomous loop health and active evaluations.
 */
router.get('/status', async (req, res) => {
    try {
        const status = autonomousOrchestrator.getStatus();
        res.json({ ok: true, status });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/autonomous/dispatch/evaluate
 * Manually trigger dispatch evaluation.
 */
router.post('/dispatch/evaluate', async (req, res) => {
    try {
        const result = await autoDispatch.evaluateQueuedJobs();
        res.json({ ok: true, result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/autonomous/sla/scan
 * Manually trigger SLA monitoring scan.
 */
router.post('/sla/scan', async (req, res) => {
    try {
        const result = await slaMonitor.scanActiveDispatches();
        res.json({ ok: true, result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/autonomous/reroute/run
 * Manually trigger autonomous rerouting.
 */
router.post('/reroute/run', async (req, res) => {
    try {
        const result = await autoReroute.evaluateReroutes();
        res.json({ ok: true, result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/autonomous/learning/recompute
 * Manually trigger learning feedback loop.
 */
router.post('/learning/recompute', async (req, res) => {
    try {
        const result = await learningLoop.recomputeIntelligence();
        res.json({ ok: true, result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * Legacy Pipeline Routes
 */
router.get('/pipelines', async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT ajp.*, j.original_name as job_name
            FROM autonomous_job_pipelines ajp
            LEFT JOIN jobs j ON ajp.job_id = j.id
            ORDER BY ajp.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/admin/pipelines/metrics
 */
router.get('/metrics', async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT 
                COUNT(*) as total_jobs,
                COALESCE(SUM(CASE WHEN pipeline_status = 'COMPLETED' THEN 1 ELSE 0 END), 0) as completed_autonomously,
                COALESCE(SUM(CASE WHEN pipeline_status = 'FAILED' THEN 1 ELSE 0 END), 0) as failed_pipelines,
                COALESCE(SUM(CASE WHEN pipeline_status = 'PAUSED' THEN 1 ELSE 0 END), 0) as requiring_intervention
            FROM autonomous_job_pipelines
        `);
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/admin/pipelines/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const { rows: [pipeline] } = await db.query('SELECT * FROM autonomous_job_pipelines WHERE id = ?', [req.params.id]);
        if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });

        const { rows: events } = await db.query('SELECT * FROM pipeline_events WHERE pipeline_id = ? ORDER BY created_at ASC', [req.params.id]);

        res.json({
            ...pipeline,
            events
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/admin/pipelines/:id/pause
 */
router.post('/:id/pause', async (req, res) => {
    try {
        const { reason } = req.body;
        await autonomousOrchestrator.pausePipeline(req.params.id, reason || 'Manual intervention');
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

/**
 * POST /api/admin/pipelines/:id/resume
 */
router.post('/:id/resume', async (req, res) => {
    try {
        await autonomousOrchestrator.resumePipeline(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

/**
 * POST /api/admin/pipelines/:id/retry-step
 */
router.post('/:id/retry-step', async (req, res) => {
    try {
        await autonomousOrchestrator.retryPipelineStep(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
