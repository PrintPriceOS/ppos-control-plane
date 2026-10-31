/**
 * src/api/services/observabilityService.js
 * 
 * Enterprise-grade observability and monitoring.
 * Provides structured logging, metrics (Prometheus), and health checks.
 */
const logger = require('./logger').child('observability');
const db = require('./mysqlClient');
const os = require('os');

class ObservabilityService {
    constructor() {
        this.startTime = Date.now();
        this.metrics = {
            totalRequests: 0,
            errorCount: 0,
            activeJobs: 0,
            lastHealthCheck: null
        };
    }

    /**
     * Records a request metric.
     */
    trackRequest(method, path, statusCode, durationMs) {
        this.metrics.totalRequests++;
        if (statusCode >= 400) this.metrics.errorCount++;
        
        // Detailed logging for slow or error requests
        if (durationMs > 1000 || statusCode >= 500) {
            logger.warn({
                event: 'request_anomaly',
                method,
                path,
                statusCode,
                durationMs,
                metadata: { timestamp: new Date().toISOString() }
            });
        }
    }

    /**
     * Gets system health snapshot.
     */
    async getHealthSnapshot() {
        const snapshot = {
            status: 'UP',
            uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
            system: {
                load: os.loadavg(),
                free_mem: os.freemem(),
                total_mem: os.totalmem()
            },
            dependencies: {
                mysql: 'UNKNOWN',
                redis: process.env.REDIS_HOST ? 'CONFIGURED' : 'UNCONFIGURED'
            },
            timestamp: new Date().toISOString()
        };

        try {
            await db.query('SELECT 1');
            snapshot.dependencies.mysql = 'UP';
        } catch (err) {
            snapshot.status = 'DEGRADED';
            snapshot.dependencies.mysql = 'DOWN';
            snapshot.error = err.message;
        }

        this.metrics.lastHealthCheck = snapshot;
        return snapshot;
    }

    /**
     * Record industrial metrics to the database for historical analysis.
     */
    async flushMetricsToDb() {
        try {
            const snapshot = await this.getHealthSnapshot();
            await db.query(`
                INSERT INTO metrics (tenant_id, type, value_generated, metadata_json)
                VALUES (?, ?, ?, ?)
            `, [
                'system',
                'HEALTH_SNAPSHOT',
                snapshot.status === 'UP' ? 1 : 0,
                JSON.stringify(snapshot)
            ]);
        } catch (err) {
            logger.error({ event: 'metrics_flush_failed', error: err.message });
        }
    }
}

module.exports = new ObservabilityService();
