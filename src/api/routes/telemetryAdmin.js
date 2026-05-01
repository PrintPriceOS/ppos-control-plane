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

module.exports = router;
