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
        // BullMQ stores worker info in Redis keys
        // Scan for keys like bull:preflight_async_queue:workers
        const queueName = process.env.PPOS_QUEUE_NAME || 'preflight_async_queue';
        const workersKey = `bull:${queueName}:workers`;
        
        // This is a rough estimation based on Redis keys
        const workerIds = await connection.smembers(workersKey);
        
        res.json({
            count: workerIds.length,
            workerIds: workerIds,
            queueMapping: queueName,
            status: 'ACTIVE'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
