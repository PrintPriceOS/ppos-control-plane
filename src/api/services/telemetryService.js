/**
 * src/api/services/telemetryService.js
 * 
 * Aggregates operational telemetry from across the OS.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('telemetry-service');

class TelemetryService {
    /**
     * Get real-time BullMQ metrics
     */
    async getQueueMetrics() {
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
    }

    /**
     * Get Worker performance and health
     */
    async getWorkerTelemetry() {
        try {
            const operations = require('./preflightOperationsService');
            const health = await operations.getHealth();
            return {
                state: health.status === 'HEALTHY' ? 'LIVE' : 'DEGRADED',
                cluster: health.workers || [],
                stats: {
                    avgAnalyzeDuration: 4500, // Placeholder for real avg from metrics table
                    avgAutofixDuration: 12000,
                    gsTimeoutRate: 0.02
                }
            };
        } catch (err) {
            return { state: 'UNAVAILABLE', cluster: [] };
        }
    }

    /**
     * Get Storage usage and artifact lineage
     */
    async getStorageMetrics() {
        try {
            const storage = require('./preflightStorageService');
            const usage = await storage.getGlobalUsage();
            return {
                state: 'LIVE',
                ...usage
            };
        } catch (err) {
            return { state: 'UNAVAILABLE' };
        }
    }

    /**
     * Get Preflight outcomes and failure patterns
     */
    async getPreflightOutcomes(range = '24h') {
        const interval = range === '24h' ? '1 DAY' : range === '7d' ? '7 DAY' : '30 DAY';
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
    }
}

module.exports = new TelemetryService();
