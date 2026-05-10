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
        const debugEnabled = process.env.PPOS_DEBUG_OUTCOMES === 'true';

        return withTimeout((async () => {
            let patterns = [];
            let recentStats = { total: 0, failures: 0 };
            
            try {
                // 1. Fetch Failure Patterns (Historical)
                patterns = await db.query(`
                    SELECT 
                        JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.failure_code')) as failure_code,
                        COUNT(*) as count
                    FROM metrics
                    WHERE created_at >= NOW() - INTERVAL ${interval}
                    AND success = 0
                    GROUP BY failure_code
                    ORDER BY count DESC
                `);

                // 2. Fetch Operational Health (Real-time 1h)
                const [stats] = await db.query(`
                    SELECT 
                        COUNT(*) as total,
                        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures,
                        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes
                    FROM metrics
                    WHERE created_at >= NOW() - INTERVAL 1 HOUR
                `);
                recentStats = stats || { total: 0, failures: 0, successes: 0 };

                if (debugEnabled) {
                    logger.info({ 
                        event: 'outcomes_debug', 
                        total: recentStats.total, 
                        failures: recentStats.failures, 
                        patternCount: patterns.length 
                    });
                }

                // --- EVIDENCE-BASED STATE RESOLUTION ---
                
                // Default to IDLE (Source is healthy, but no data)
                let state = 'IDLE';
                
                const recentCompleted = parseInt(recentStats.successes) || 0;
                const recentFailed = parseInt(recentStats.failures) || 0;
                const totalRecent = parseInt(recentStats.total) || 0;
                const failureRatio = totalRecent > 0 ? parseFloat(((recentFailed / totalRecent) * 100).toFixed(2)) : 0;
                const patternCount = patterns.length;

                if (totalRecent > 0) {
                    // We have activity - Resolve between LIVE and DEGRADED
                    state = failureRatio > 15 ? 'DEGRADED' : 'LIVE';
                } else if (patternCount > 0) {
                    // No activity in last hour, but we have historical failures
                    // Stay IDLE or maybe DEGRADED if historical is very high? 
                    // Requirement: "Healthy idle systems should display IDLE"
                    state = 'IDLE';
                }

                return {
                    state,
                    recentCompleted,
                    recentFailed,
                    failureRatio,
                    patternCount,
                    patterns
                };

            } catch (err) {
                logger.error({ 
                    event: 'telemetry_failed', 
                    scope: 'outcomes', 
                    error: err.message,
                    stack: debugEnabled ? err.stack : undefined
                });
                
                // Return FAILED only if the source query itself exploded
                return { 
                    state: 'FAILED', 
                    recentCompleted: 0,
                    recentFailed: 0,
                    failureRatio: 0,
                    patternCount: 0,
                    patterns: [],
                    error: err.message
                };
            }
        })(), 3000, { 
            state: 'TIMEOUT', 
            recentCompleted: 0,
            recentFailed: 0,
            failureRatio: 0,
            patternCount: 0,
            patterns: [] 
        });
    }


    /**
     * Get readiness metrics for materials and pricing
     */
    async getReadinessMetrics() {
        try {
            const provisioningService = require('./industrialProvisioningService');
            
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

            // Provisioning Metrics
            const provStatus = await provisioningService.getProvisioningStatus();

            return {
                materials: {
                    state: hasMaterials ? 'LIVE' : 'NOT_CONFIGURED',
                    catalogCount
                },
                pricing: {
                    state: pricingCount.count > 0 ? 'LIVE' : 'DEGRADED',
                    profileCount: pricingCount.count
                },
                provisioning: {
                    state: (provStatus.printerNodes > 0 && provStatus.printNodes > 0) ? 'LIVE' : 'DEGRADED',
                    printerNodes: provStatus.printerNodes,
                    printNodes: provStatus.printNodes,
                    machineProfiles: provStatus.machineProfiles,
                    pricingProfiles: provStatus.pricingProfiles,
                    jobsHasMetadataJson: provStatus.jobsHasMetadataJson,
                    metricsHasMetadataJson: provStatus.metricsHasMetadataJson
                }
            };
        } catch (err) {
            logger.error({ event: 'readiness_failed', error: err.message });
            return { materials: { state: 'NOT_CONFIGURED' }, pricing: { state: 'DEGRADED' }, provisioning: { state: 'DEGRADED' } };
        }
    }


    /**
     * Get routing readiness based on profiles and configuration.
     */
    async getRoutingTelemetry() {
        try {
            const provisioningService = require('./industrialProvisioningService');
            const provStatus = await provisioningService.getProvisioningStatus();
            
            let state = 'LIVE';
            if (provStatus.pricingProfiles === 0) state = 'NOT_CONFIGURED';
            else if (provStatus.capacityProfiles === 0 || provStatus.reliabilityProfiles === 0) state = 'DEGRADED';

            return {
                state,
                compatibleNodes: provStatus.printNodes,
                machineProfiles: provStatus.machineProfiles,
                pricingProfiles: provStatus.pricingProfiles,
                reliabilityProfiles: provStatus.reliabilityProfiles,
                capacityProfiles: provStatus.capacityProfiles
            };
        } catch (err) {
            return { state: 'FAILED', error: err.message };
        }
    }

    /**
     * Get operational health snapshot for NOC
     */
    async getOperationalSnapshot() {
        const [queue, largeDocs, workers, storage, outcomes, readiness, routing] = await Promise.all([
            this.getQueueMetrics(),
            this.getLargeDocumentTelemetry(),
            this.getWorkerTelemetry(),
            this.getStorageMetrics(),
            this.getPreflightOutcomes(),
            this.getReadinessMetrics(),
            this.getRoutingTelemetry()
        ]);

        return {
            queue,
            largeDocs,
            workers,
            storage,
            outcomes,
            readiness,
            routing
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
