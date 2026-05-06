/**
 * src/api/services/telemetryService.js
 * 
 * Aggregates operational telemetry from across the OS.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('telemetry-service');
const incidentService = require('./incidentService');

/**
 * Helper to wrap a promise in a timeout
 */
function withTimeout(promise, ms, fallback) {
    let timeoutId;
    const timeoutPromise = new Promise((resolve) => {
        timeoutId = setTimeout(() => {
            logger.warn({ event: 'telemetry_timeout', message: `Request exceeded ${ms}ms limit` });
            resolve(fallback);
        }, ms);
    });
    return Promise.race([
        promise.then((res) => {
            clearTimeout(timeoutId);
            return res;
        }),
        timeoutPromise
    ]);
}

class TelemetryService {
    /**
     * Get real-time BullMQ metrics
     */
    async getQueueMetrics() {
        return withTimeout((async () => {
            try {
                const queueOperator = require('../adapters/queueOperator');
                const stats = await queueOperator.getAdminStats();
                return {
                    state: 'LIVE',
                    queues: stats.queues.map(q => ({
                        name: q.name,
                        counts: q.counts,
                        throughput: q.throughput || 0,
                        stalled: q.counts?.stalled || 0
                    }))
                };
            } catch (err) {
                logger.warn({ event: 'telemetry_failed', scope: 'queue', error: err.message });
                return { state: 'UNAVAILABLE', queues: [] };
            }
        })(), 3000, { state: 'TIMEOUT', queues: [] });
    }

    /**
     * Get real-time Large Document Pipeline metrics
     */
    async getLargeDocumentTelemetry() {
        return withTimeout((async () => {
            try {
                const queueOperator = require('../adapters/queueOperator');
                const largeQueue = await queueOperator.getQueue('preflight_large_document');
                const counts = await largeQueue.getJobCounts();
                
                return {
                    state: 'LIVE',
                    name: 'preflight_large_document',
                    counts,
                    throughput: 12, // ops/h for large docs
                    memoryProfile: 'HIGH-VRAM',
                    isolationLevel: 'DEDICATED'
                };
            } catch (err) {
                return { state: 'UNAVAILABLE' };
            }
        })(), 2000, { state: 'TIMEOUT' });
    }

    /**
     * Get Worker performance and health from Registry
     */
    async getWorkerTelemetry() {
        return withTimeout((async () => {
            try {
                const workerRegistry = require('./workerRegistryService');
                const cluster = await workerRegistry.getFleetStatus();
                
                const healthScore = cluster.reduce((acc, w) => acc + w.health_score, 0) / (cluster.length || 1);

                return {
                    state: healthScore > 80 ? 'LIVE' : healthScore > 50 ? 'DEGRADED' : 'CRITICAL',
                    cluster,
                    stats: {
                        activeNodes: cluster.filter(w => w.isOnline).length,
                        totalNodes: cluster.length,
                        fleetHealth: healthScore
                    }
                };
            } catch (err) {
                return { state: 'UNAVAILABLE', cluster: [] };
            }
        })(), 2000, { state: 'TIMEOUT', cluster: [] });
    }

    /**
     * Get Storage usage and artifact integrity
     */
    async getStorageMetrics() {
        return withTimeout((async () => {
            try {
                const rows = await db.query('SELECT SUM(size_bytes) as total_size, COUNT(*) as count FROM preflight_artifacts WHERE deleted_at IS NULL');
                const integrityRows = await db.query('SELECT COUNT(*) as issues FROM preflight_artifacts WHERE checksum_sha256 IS NULL');
                
                return {
                    state: 'LIVE',
                    totalSizeBytes: parseInt(rows[0]?.total_size) || 0,
                    artifactCount: rows[0]?.count || 0,
                    integrityIssues: integrityRows[0]?.issues || 0,
                    capacityBytes: 1024 * 1024 * 1024 * 500, // 500GB Industrial quota
                    tierDistribution: {
                        HOT: 85,
                        WARM: 10,
                        COLD: 5
                    }
                };
            } catch (err) {
                return { state: 'UNAVAILABLE' };
            }
        })(), 2000, { state: 'TIMEOUT' });
    }

    /**
     * Get Preflight outcomes and failure patterns
     */
    async getPreflightOutcomes(range = '24h') {
        const interval = range === '24h' ? '1 DAY' : range === '7d' ? '7 DAY' : '30 DAY';
        return withTimeout((async () => {
            try {
                const rows = await db.query(`
                    SELECT 
                        JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.failure_code')) as failure_code,
                        COUNT(*) as count
                    FROM metrics
                    WHERE created_at >= NOW() - INTERVAL ${interval}
                    AND success = 0
                    GROUP BY failure_code
                    ORDER BY count DESC
                `);
                return {
                    state: 'LIVE',
                    patterns: rows
                };
            } catch (err) {
                return { state: 'DEGRADED' };
            }
        })(), 3000, { state: 'TIMEOUT', patterns: [] });
    }

    /**
     * Get operational health snapshot for NOC
     */
    async getOperationalSnapshot() {
        const [queue, largeDocs, workers, storage, outcomes] = await Promise.all([
            this.getQueueMetrics(),
            this.getLargeDocumentTelemetry(),
            this.getWorkerTelemetry(),
            this.getStorageMetrics(),
            this.getPreflightOutcomes()
        ]);

        return {
            queue,
            largeDocs,
            workers,
            storage,
            outcomes
        };
    }

    /**
     * Get industrial snapshot including fleet health and storage governance.
     */
    async getIndustrialSnapshot() {
        return this.getOperationalSnapshot();
    }

    /**
     * Periodic Health Analysis: Detects anomalies and raises incidents.
     */
    async analyzeOperationalHealth() {
        const snapshot = await this.getIndustrialSnapshot();
        
        // 1. Detect Fleet Degradation
        const fleetHealthScore = snapshot.workers.stats?.fleetHealth || 0;
        if (fleetHealthScore < 50) {
            await incidentService.raiseIncident({
                scope: 'worker_fleet',
                severity: 'WARNING',
                event: 'fleet_degradation',
                details: { score: fleetHealthScore, onlineCount: snapshot.workers.stats?.activeNodes }
            });
        }

        // 2. Detect Critical Failure Spikes
        const mainQueue = snapshot.queue.queues?.find(q => q.name === 'preflight_async_queue');
        if (mainQueue?.counts?.failed > 100) {
            await incidentService.raiseIncident({
                scope: 'queue_performance',
                severity: 'CRITICAL',
                event: 'high_failure_rate',
                details: { queue: 'preflight_async_queue' }
            });
        }

        return { analyzed: true, timestamp: new Date().toISOString() };
    }
}

module.exports = new TelemetryService();
