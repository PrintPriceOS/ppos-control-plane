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
        const body = req.body || {};
        const metadata = body.metadata || {};

        const workerId =
            body.workerId ||
            body.worker_id ||
            metadata.workerId ||
            metadata.worker_id;

        const normalizedMetadata = {
            ...metadata,
            hostname:
                body.hostname ||
                metadata.hostname ||
                body.host ||
                metadata.host ||
                workerId ||
                'unknown-worker-host',

            status:
                body.status ||
                metadata.status ||
                'HEALTHY',

            queueBindings:
                body.queueBindings ||
                body.queue_bindings ||
                body.queues ||
                metadata.queueBindings ||
                metadata.queue_bindings ||
                metadata.queues ||
                [],

            capabilities:
                body.capabilities ||
                metadata.capabilities ||
                {},

            gsVersion:
                body.gsVersion ||
                body.gs_version ||
                metadata.gsVersion ||
                metadata.gs_version,

            memoryProfileMb:
                body.memoryProfileMb ||
                body.memory_profile_mb ||
                metadata.memoryProfileMb ||
                metadata.memory_profile_mb,

            concurrency:
                body.concurrency ||
                metadata.concurrency,

            uptimeSeconds:
                body.uptimeSeconds ||
                body.uptime_seconds ||
                metadata.uptimeSeconds ||
                metadata.uptime_seconds
        };

        if (!workerId) {
            return res.status(400).json({
                ok: false,
                error: 'WORKER_ID_REQUIRED'
            });
        }

        const result = await workerRegistry.heartbeat(workerId, normalizedMetadata);

        console.log('[CONTROL][WORKER-HEARTBEAT][OK]', {
            workerId,
            hostname: normalizedMetadata.hostname,
            status: normalizedMetadata.status,
            authMode: req.auth?.authMode || req.auth?.type || 'unknown'
        });

        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[CONTROL][WORKER-HEARTBEAT][ERROR]', {
            error: err.message,
            bodyKeys: Object.keys(req.body || {}),
            metadataKeys: Object.keys(req.body?.metadata || {})
        });

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
