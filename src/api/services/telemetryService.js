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
        })(), 2000, { state: 'TIMEOUT', counts: { active: 0, waiting: 0, failed: 0, stalled: 0 } });
    }

    /**
     * Get Worker performance and health from Registry
     */
    async getWorkerTelemetry() {
        return withTimeout((async () => {
            try {
                const workerRegistry = require('./workerRegistryService');
                const cluster = await workerRegistry.getFleetStatus();
                
                const activeNodes = cluster.filter(w => w.status === 'HEALTHY').length;
                const staleNodes = cluster.filter(w => w.status === 'STALE').length;
                const offlineNodes = cluster.filter(w => w.status === 'OFFLINE').length;
                const totalNodes = cluster.length;

                const fleetHealth = totalNodes > 0 ? Math.round((activeNodes / totalNodes) * 100) : 0;

                return {
                    state: fleetHealth > 80 ? 'LIVE' : fleetHealth > 50 ? 'DEGRADED' : 'CRITICAL',
                    activeFleet: cluster.filter(w => w.status === 'HEALTHY' || w.status === 'STALE'),
                    historicalFleet: cluster.filter(w => w.status === 'OFFLINE'),
                    stats: {
                        activeNodes,
                        staleNodes,
                        offlineNodes,
                        totalNodes,
                        fleetHealth
                    }
                };
            } catch (err) {
                logger.error({ event: 'telemetry_failed', scope: 'workers', error: err.message });
                return { state: 'UNAVAILABLE', activeFleet: [], historicalFleet: [], stats: { totalNodes: 0, fleetHealth: 0 } };
            }
        })(), 2000, { state: 'TIMEOUT', activeFleet: [], historicalFleet: [], stats: { totalNodes: 0, fleetHealth: 0 } });
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
                return { 
                    state: 'UNAVAILABLE', 
                    totalSizeBytes: 0, 
                    artifactCount: 0, 
                    integrityIssues: 0, 
                    capacityBytes: 1024 * 1024 * 1024 * 500,
                    tierDistribution: { HOT: 0, WARM: 0, COLD: 0 }
                };
            }
        })(), 2000, { 
            state: 'TIMEOUT', 
            totalSizeBytes: 0, 
            artifactCount: 0, 
            integrityIssues: 0, 
            capacityBytes: 1024 * 1024 * 1024 * 500,
            tierDistribution: { HOT: 0, WARM: 0, COLD: 0 }
        });
    }

    /**
     * Get Preflight outcomes and failure patterns
     */
    async getPreflightOutcomes(range = '24h') {
        const interval = range === '24h' ? '1 DAY' : range === '7d' ? '7 DAY' : '30 DAY';
        return withTimeout((async () => {
            try {
                const patterns = await db.query(`
                    SELECT 
                        JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.failure_code')) as failure_code,
                        COUNT(*) as count
                    FROM metrics
                    WHERE created_at >= NOW() - INTERVAL ${interval}
                    AND success = 0
                    GROUP BY failure_code
                    ORDER BY count DESC
                `);

                // Real State Logic
                const [recentStats] = await db.query(`
                    SELECT 
                        COUNT(*) as total,
                        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures
                    FROM metrics
                    WHERE created_at >= NOW() - INTERVAL 1 HOUR
                `);

                let state = 'IDLE';
                if (recentStats.total > 0) {
                    const failureRate = (recentStats.failures / recentStats.total) * 100;
                    state = failureRate > 15 ? 'DEGRADED' : 'LIVE';
                }

                return {
                    state,
                    patterns
                };
            } catch (err) {
                logger.error({ event: 'telemetry_failed', scope: 'outcomes', error: err.message });
                return { state: 'FAILED', patterns: [] };
            }
        })(), 3000, { state: 'TIMEOUT', patterns: [] });
    }

    /**
     * Get readiness metrics for materials and pricing
     */
    async getReadinessMetrics() {
        try {
            // Check for real rates in printer nodes
            const rows = await db.query('SELECT rates_json FROM printer_nodes WHERE rates_json IS NOT NULL LIMIT 10');
            
            let hasMaterials = false;
            let catalogCount = 0;
            
            for (const row of rows) {
                const rates = typeof row.rates_json === 'string' ? JSON.parse(row.rates_json) : row.rates_json;
                if (rates && (rates.paper_price_cover_by_kilo || rates.paper_price_interior_by_kilo)) {
                    hasMaterials = true;
                    catalogCount += 1;
                }
            }

            // Check for pricing profiles
            const [pricingCount] = await db.query('SELECT COUNT(*) as count FROM printer_pricing_profiles');

            return {
                materials: {
                    state: hasMaterials ? 'LIVE' : 'NOT_CONFIGURED',
                    catalogCount
                },
                pricing: {
                    state: pricingCount.count > 0 ? 'LIVE' : 'DEGRADED',
                    profileCount: pricingCount.count
                }
            };
        } catch (err) {
            return { materials: { state: 'NOT_CONFIGURED' }, pricing: { state: 'DEGRADED' } };
        }
    }

    /**
     * Get operational health snapshot for NOC
     */
    async getOperationalSnapshot() {
        const [queue, largeDocs, workers, storage, outcomes, readiness] = await Promise.all([
            this.getQueueMetrics(),
            this.getLargeDocumentTelemetry(),
            this.getWorkerTelemetry(),
            this.getStorageMetrics(),
            this.getPreflightOutcomes(),
            this.getReadinessMetrics()
        ]);

        return {
            queue,
            largeDocs,
            workers,
            storage,
            outcomes,
            readiness
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
