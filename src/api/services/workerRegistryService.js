/**
 * Worker Registry Service
 * 
 * Manages the cluster of distributed workers, their capabilities, and health states.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('worker-registry');

class WorkerRegistryService {
    /**
     * Heartbeat from a worker node.
     */
    async heartbeat(workerId, metadata) {
        const {
            hostname,
            status = 'HEALTHY',
            queueBindings = [],
            capabilities = {},
            gsVersion,
            memoryProfileMb,
            concurrency,
            uptimeSeconds
        } = metadata;

        const healthScore = this.calculateHealthScore(metadata);

        await db.query(`
            INSERT INTO worker_nodes (
                id, hostname, status, queue_bindings, capabilities, 
                gs_version, memory_profile_mb, concurrency, uptime_seconds,
                health_score, last_heartbeat
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE
                status = VALUES(status),
                queue_bindings = VALUES(queue_bindings),
                capabilities = VALUES(capabilities),
                gs_version = VALUES(gs_version),
                memory_profile_mb = VALUES(memory_profile_mb),
                concurrency = VALUES(concurrency),
                uptime_seconds = VALUES(uptime_seconds),
                health_score = VALUES(health_score),
                last_heartbeat = CURRENT_TIMESTAMP
        `, [
            workerId, hostname, status, JSON.stringify(queueBindings), JSON.stringify(capabilities),
            gsVersion, memoryProfileMb, concurrency, uptimeSeconds, healthScore
        ]);

        return { workerId, healthScore };
    }

    /**
     * Get the entire worker fleet status.
     */
    async getFleetStatus() {
        const workers = await db.query('SELECT * FROM worker_nodes ORDER BY last_heartbeat DESC');
        
        return workers.map(w => ({
            ...w,
            queue_bindings: w.queue_bindings || [],
            capabilities: w.capabilities || {},
            isOnline: (Date.now() - new Date(w.last_heartbeat).getTime()) < 60000 // 1 minute threshold
        }));
    }

    /**
     * Calculate worker health score based on telemetry.
     */
    calculateHealthScore(metadata) {
        let score = 100;
        
        // Degradation rules
        if (metadata.memoryPressure > 80) score -= 20;
        if (metadata.failureRate > 10) score -= 30;
        if (metadata.avgLatencyMs > 60000) score -= 15;
        
        return Math.max(0, score);
    }

    /**
     * Get workers by capability.
     */
    async getWorkersByCapability(capability) {
        const fleet = await this.getFleetStatus();
        return fleet.filter(w => w.capabilities[capability] === true && w.isOnline);
    }

    /**
     * Set worker status manually (Maintenance/Offline).
     */
    async setStatus(workerId, status) {
        logger.warn({
            event: 'worker_status_override',
            workerId,
            status
        });

        await db.query('UPDATE worker_nodes SET status = ? WHERE id = ?', [status, workerId]);
    }
}

module.exports = new WorkerRegistryService();
