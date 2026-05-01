/**
 * Worker Admin Router
 */
const express = require('express');
const router = express.Router();
const workerRegistry = require('../services/workerRegistryService');

/**
 * GET /api/admin/workers/fleet
 */
router.get('/fleet', async (req, res) => {
    try {
        const fleet = await workerRegistry.getFleetStatus();
        res.json({ ok: true, fleet });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/workers/heartbeat
 * (Usually called by workers, but here for admin simulation/debugging)
 */
router.post('/heartbeat', async (req, res) => {
    try {
        const { workerId, metadata } = req.body;
        const result = await workerRegistry.heartbeat(workerId, metadata);
        res.json({ ok: true, ...result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/workers/:id/status
 */
router.post('/:id/status', async (req, res) => {
    try {
        await workerRegistry.setStatus(req.params.id, req.body.status);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
