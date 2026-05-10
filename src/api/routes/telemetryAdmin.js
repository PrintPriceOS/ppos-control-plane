/**
 * src/api/routes/telemetryAdmin.js
 * 
 * Operational Telemetry API for industrial monitoring.
 */
const express = require('express');
const router = express.Router();
const telemetry = require('../services/telemetryService');
const requireAdmin = require('../middleware/requireAdmin');

router.use(requireAdmin);

/**
 * GET /api/admin/telemetry/snapshot
 * Comprehensive operational snapshot for the SOC dashboard.
 */
router.get('/snapshot', async (req, res) => {
    try {
        const [queue, workers, storage, outcomes] = await Promise.all([
            telemetry.getQueueMetrics(),
            telemetry.getWorkerTelemetry(),
            telemetry.getStorageMetrics(),
            telemetry.getPreflightOutcomes('24h')
        ]);

        res.json({
            ok: true,
            timestamp: new Date().toISOString(),
            snapshot: {
                queue,
                workers,
                storage,
                outcomes
            }
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/telemetry/industrial
 * High-fidelity industrial snapshot including fleet health and storage governance.
 */
router.get('/industrial', async (req, res) => {
    try {
        const snapshot = await telemetry.getIndustrialSnapshot();
        res.json({ ok: true, ...snapshot });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/telemetry/nodes/:nodeId/mes
 * Returns MES operational history for a specific printer node.
 */
router.get('/nodes/:nodeId/mes', async (req, res) => {
    try {
        const stats = await telemetry.getNodeMESStats(req.params.nodeId);
        res.json({ ok: true, stats });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
