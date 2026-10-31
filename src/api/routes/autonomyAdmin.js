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
        res.json({ ok: true, data: status });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'AUTONOMY_STATUS_ERROR' });
    }
});

router.post('/dispatch/evaluate', async (req, res) => {
    try {
        const result = await autoDispatch.evaluateQueuedJobs();
        res.json({ ok: true, data: result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'AUTONOMY_EVALUATE_ERROR' });
    }
});

router.post('/sla/scan', async (req, res) => {
    try {
        const result = await slaMonitor.scanActiveDispatches();
        res.json({ ok: true, data: result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'AUTONOMY_SLA_SCAN_ERROR' });
    }
});

router.post('/reroute/run', async (req, res) => {
    try {
        const result = await autoReroute.evaluateReroutes();
        res.json({ ok: true, data: result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'AUTONOMY_REROUTE_ERROR' });
    }
});

router.post('/learning/recompute', async (req, res) => {
    try {
        const result = await learningLoop.recomputeIntelligence();
        res.json({ ok: true, data: result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'AUTONOMY_LEARNING_ERROR' });
    }
});

router.get('/pipelines', async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT ajp.*, j.original_name as job_name
            FROM autonomous_job_pipelines ajp
            LEFT JOIN jobs j ON ajp.job_id = j.id
            ORDER BY ajp.created_at DESC
        `);
        res.json({ ok: true, data: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'AUTONOMY_PIPELINES_QUERY_ERROR' });
    }
});

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
        res.json({ ok: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'AUTONOMY_METRICS_QUERY_ERROR' });
    }
});

router.get('/health', async (req, res) => {
    try {
        const telemetryService = require('../services/telemetryService');
        const health = await telemetryService.getIndustrialHealthSnapshot();
        res.json({ ok: true, health });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'AUTONOMY_HEALTH_ERROR' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const { rows: [pipeline] } = await db.query('SELECT * FROM autonomous_job_pipelines WHERE id = ?', [req.params.id]);
        if (!pipeline) return res.status(404).json({ ok: false, error: 'Pipeline not found', code: 'AUTONOMY_PIPELINE_NOT_FOUND' });

        const { rows: events } = await db.query('SELECT * FROM pipeline_events WHERE pipeline_id = ? ORDER BY created_at ASC', [req.params.id]);

        res.json({
            ok: true,
            data: {
                ...pipeline,
                events
            }
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'AUTONOMY_PIPELINE_QUERY_ERROR' });
    }
});

router.post('/:id/pause', async (req, res) => {
    try {
        const { reason } = req.body;
        await autonomousOrchestrator.pausePipeline(req.params.id, reason || 'Manual intervention');
        res.json({ ok: true, message: 'Pipeline paused' });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message, code: 'AUTONOMY_PAUSE_ERROR' });
    }
});

router.post('/:id/resume', async (req, res) => {
    try {
        await autonomousOrchestrator.resumePipeline(req.params.id);
        res.json({ ok: true, message: 'Pipeline resumed' });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message, code: 'AUTONOMY_RESUME_ERROR' });
    }
});

router.post('/:id/retry-step', async (req, res) => {
    try {
        await autonomousOrchestrator.retryPipelineStep(req.params.id);
        res.json({ ok: true, message: 'Step retry triggered' });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message, code: 'AUTONOMY_RETRY_ERROR' });
    }
});

module.exports = router;
