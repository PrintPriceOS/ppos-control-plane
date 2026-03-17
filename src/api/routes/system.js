const express = require('express');
const router = express.Router();
const connection = require('../adapters/redisConnection');
const queueOperator = require('../adapters/queueOperator');

/**
 * GET /api/system/health
 * Connectivity status for all runtime dependencies.
 */
router.get('/health', async (req, res) => {
    try {
        const redisInfo = connection.status; // 'ready', 'connect', 'reconnecting', etc.
        const redisLatency = await connection.ping();
        
        res.json({
            ok: redisInfo === 'ready',
            dependencies: {
                redis: {
                    status: redisInfo,
                    latency: redisLatency === 'PONG' ? 'OK' : 'ERROR'
                }
            },
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/system/queues
 * Real-time stats from BullMQ.
 */
router.get('/queues', async (req, res) => {
    const stats = await queueOperator.getAdminStats();
    res.json(stats);
});

/**
 * GET /api/system/workers
 * Active nodes registered in the system.
 */
router.get('/workers', async (req, res) => {
    try {
        const queueName = process.env.PPOS_QUEUE_NAME || 'preflight_async_queue';
        
        // V1.9.3 NEW: Query PPOS Worker Registry
        const registrySet = 'ppos:workers:active';
        const registeredIds = await connection.smembers(registrySet);
        
        const activeWorkers = [];
        const expiredIds = [];

        if (registeredIds.length > 0) {
            // Hydrate metadata
            for (const id of registeredIds) {
                const data = await connection.get(`ppos:worker:${id}`);
                if (data) {
                    activeWorkers.push(JSON.parse(data));
                } else {
                    expiredIds.push(id);
                }
            }

            // Cleanup expired IDs from the set (lazy cleanup)
            if (expiredIds.length > 0) {
                await connection.srem(registrySet, ...expiredIds);
            }
        }

        // FALLBACK: If new registry is empty, try legacy BullMQ set
        if (activeWorkers.length === 0) {
            const legacyWorkersKey = `bull:${queueName}:workers`;
            const legacyIds = await connection.smembers(legacyWorkersKey);
            
            return res.json({
                count: legacyIds.length,
                workers: legacyIds.map(id => ({ id, status: 'LEGACY', queue: queueName })),
                discovery: 'FALLBACK_LEGACY'
            });
        }
        
        res.json({
            count: activeWorkers.length,
            workers: activeWorkers,
            discovery: 'CANONICAL_REGISTRY',
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
