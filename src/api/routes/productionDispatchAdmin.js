/**
 * src/api/routes/productionDispatchAdmin.js
 * 
 * Protected admin routes for production dispatch execution and lifecycle management.
 */
const express = require('express');
const router = express.Router();
const orchestrationService = require('../services/productionOrchestrationService');
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

module.exports = router;
