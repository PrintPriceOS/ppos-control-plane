/**
 * src/api/routes/anomalyAdmin.js
 * 
 * Routes for Phase 14 — Industrial Anomaly Detection + Digital Twin.
 */
const express = require('express');
const router = express.Router();
const db = require('../services/mysqlClient');
const anomaly = require('../services/anomalyDetectionService');
const twin = require('../services/digitalTwinService');
const recovery = require('../services/preemptiveRecoveryService');

/**
 * GET /api/admin/anomaly/health
 */
router.get('/health', async (req, res) => {
    try {
        const snapshot = await twin.getLatestSnapshot();
        res.json({
            ok: true,
            health: {
                state: "ANOMALY_DETECTION_ACTIVE",
                stabilityIndex: snapshot?.global_stability_index || 100,
                activeAnomalies: 0,
                lastSnapshotAt: snapshot?.created_at,
                timestamp: new Date().toISOString()
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/admin/anomaly/nodes
 */
router.get('/nodes', async (req, res) => {
    try {
        const rows = await db.query("SELECT node_id, current_drift_score FROM print_node_machine_profiles WHERE current_drift_score > 0");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/admin/anomaly/digital-twin
 */
router.get('/digital-twin', async (req, res) => {
    try {
        const rows = await db.query("SELECT * FROM industrial_digital_twin_snapshots ORDER BY created_at DESC LIMIT 50");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/admin/anomaly/recompute
 */
router.post('/recompute', async (req, res) => {
    try {
        await twin.generateSnapshot('MANUAL');
        res.json({ ok: true, message: 'Digital Twin snapshot generated.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/admin/anomaly/preemptive-recovery
 */
router.post('/preemptive-recovery', async (req, res) => {
    try {
        const count = await recovery.runPreemptiveRecovery();
        res.json({ ok: true, preemptiveRecoveries: count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
