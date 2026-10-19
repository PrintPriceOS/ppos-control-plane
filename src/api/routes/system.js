const express = require('express');
const router = express.Router();
const connection = require('../adapters/redisConnection');
const queueOperator = require('../adapters/queueOperator');
const { requireAdmin, requireRole, resolveActorContext } = require('../middleware/auth');

/**
 * Bounded check for Redis connectivity without side effects.
 * Uses existing connection, bounding ping latency with a strict timeout.
 */
async function checkRedisHealth(timeoutMs = 1500) {
    if (!connection) {
        return {
            status: 'unconfigured',
            latency: 'UNCONFIGURED',
            isReady: false
        };
    }

    const currentStatus = connection.status || 'unknown';

    // If connection status is already closed or end, avoid hanging ping
    if (currentStatus === 'end' || currentStatus === 'close') {
        return {
            status: currentStatus,
            latency: 'DISCONNECTED',
            isReady: false
        };
    }

    try {
        const pingPromise = connection.ping();
        const timeoutPromise = new Promise((_, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('REDIS_PING_TIMEOUT'));
            }, timeoutMs);
            if (timer.unref) timer.unref();
        });

        const res = await Promise.race([pingPromise, timeoutPromise]);
        const isReady = currentStatus === 'ready' && res === 'PONG';
        return {
            status: currentStatus,
            latency: res === 'PONG' ? 'OK' : 'ERROR',
            isReady
        };
    } catch (err) {
        const isTimeout = err && err.message === 'REDIS_PING_TIMEOUT';
        return {
            status: currentStatus,
            latency: isTimeout ? 'TIMEOUT' : 'ERROR',
            isReady: false
        };
    }
}

/**
 * GET /api/system/health
 * Connectivity status for all runtime dependencies.
 * 
 * RBAC:
 * - Requires authenticated user (requireAdmin).
 * - Printhouse roles (PRINTHOUSE_ADMIN, PRINTHOUSE_OPERATOR):
 *   Returns minimal sanitized health status without PID, process details,
 *   internal network topology, queue names, or raw errors.
 * - Platform Admin roles (SUPER_ADMIN, OPS_ADMIN, SYSTEM_ADMIN):
 *   Returns full diagnostic payload including PID, uptime, and dependency details.
 */
router.get('/health', requireAdmin, async (req, res) => {
    try {
        const actor = resolveActorContext(req);
        const redisHealth = await checkRedisHealth(1500);
        const isOverallOk = redisHealth.isReady;

        // Printhouse role: minimal sanitized contract
        if (actor.isPrinthouseUser) {
            return res.json({
                ok: isOverallOk,
                status: isOverallOk ? 'HEALTHY' : 'DEGRADED',
                services: {
                    operational: isOverallOk
                },
                timestamp: new Date().toISOString()
            });
        }

        // Platform / Operator Admin roles: full diagnostic payload
        const uptimeSeconds = Math.floor(process.uptime());
        const startTime = Date.now() - (uptimeSeconds * 1000);

        return res.json({
            ok: isOverallOk,
            status: isOverallOk ? 'HEALTHY' : 'DEGRADED',
            uptime_seconds: uptimeSeconds,
            startTime: startTime,
            pid: process.pid,
            dependencies: {
                redis: {
                    status: redisHealth.status,
                    latency: redisHealth.latency
                }
            },
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        // Sanitize error response: no raw stack or internal leakage
        const actor = resolveActorContext(req);
        if (actor.isPrinthouseUser) {
            return res.status(500).json({
                ok: false,
                status: 'DEGRADED',
                error: 'System diagnostic check failed'
            });
        }

        return res.status(500).json({
            ok: false,
            status: 'DEGRADED',
            error: 'System diagnostic check encountered an unexpected error'
        });
    }
});

/**
 * GET /api/system/queues
 * Real-time stats from BullMQ.
 * Restricted strictly to SUPER_ADMIN / OPS_ADMIN.
 */
router.get('/queues', requireAdmin, requireRole('OPS_ADMIN'), async (req, res) => {
    try {
        const stats = await queueOperator.getAdminStats();
        res.json(stats);
    } catch (err) {
        res.status(500).json({ ok: false, error: 'Failed to retrieve queue statistics' });
    }
});

/**
 * GET /api/system/workers
 * Active nodes registered in the system.
 * Restricted strictly to SUPER_ADMIN / OPS_ADMIN.
 */
router.get('/workers', requireAdmin, requireRole('OPS_ADMIN'), async (req, res) => {
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
        res.status(500).json({ error: 'Failed to retrieve worker status' });
    }
});

module.exports = router;
