/**
 * src/api/routes/printNodeAgentAdmin.js
 * 
 * Phase 34 - Live Federation Activation.
 * Admin endpoints for monitoring and managing the Industrial Agent layer.
 */
const express = require('express');
const router = express.Router();
const agentService = require('../services/PrintNodeAgentService');

/**
 * POST /api/admin/nodes/heartbeat
 * Manual or proxy heartbeat ingestion for the federation agent layer.
 */
router.post('/heartbeat', async (req, res) => {
    try {
        const result = await agentService.processHeartbeat(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/nodes/live
 * Returns all print nodes considered "Alive" (heartbeat within 15m).
 */
router.get('/live', async (req, res) => {
    try {
        const nodes = await agentService.getLiveNodes();
        res.json({ ok: true, nodes });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/nodes/:nodeId/status
 * Detailed diagnostic status for a specific industrial node.
 */
router.get('/:nodeId/status', async (req, res) => {
    try {
        const status = await agentService.getNodeStatus(req.params.nodeId);
        if (!status) {
            return res.status(404).json({ 
                ok: false, 
                error: 'Industrial Registry Error: Node not found in federation.' 
            });
        }
        res.json({ ok: true, status });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/nodes/capacity/live
 * Provides a global overview of derived live capacity states across the federation.
 */
router.get('/capacity/live', async (req, res) => {
    try {
        const capacitySync = require('../services/LiveCapacitySyncService');
        const overview = await capacitySync.getLiveCapacityOverview();
        res.json({ ok: true, overview });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
