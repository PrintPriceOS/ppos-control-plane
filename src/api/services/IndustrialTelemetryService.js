/**
 * src/api/services/IndustrialTelemetryService.js
 * 
 * Handles real manufacturing telemetry ingestion, aggregation, and performance scoring.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('industrial-telemetry');

class IndustrialTelemetryService {
    /**
     * Ingests a real heartbeat from a Print Node.
     * Maps hardware-level telemetry into the Control Plane persistence layer.
     */
    async ingestHeartbeat(nodeId, payload, options = {}) {
        const timestamp = new Date();
        const trace_id = options.trace_id || options.traceId;
        
        try {
            // 1. Record raw heartbeat for historical analysis
            await db.query(`
                INSERT INTO node_heartbeats (
                    node_id, status, queue_depth, active_jobs, utilization_pct,
                    machine_state, worker_state, dispatches_active, dispatches_delayed,
                    storage_pressure, sync_version, heartbeat_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                nodeId, 
                payload.status || 'ONLINE', 
                payload.queue_depth || 0, 
                payload.active_jobs || 0,
                payload.utilization_pct || 0, 
                payload.machine_state || 'IDLE', 
                payload.worker_state || 'READY',
                payload.dispatches_active || 0, 
                payload.dispatches_delayed || 0,
                payload.storage_pressure || 0, 
                payload.sync_version || '1.0.0', 
                timestamp
            ]);

            // 2. Update the live state of the Print Node
            await db.query(`
                UPDATE print_nodes SET
                    status = ?,
                    machine_state = ?,
                    worker_state = ?,
                    capacity_utilization_pct = ?,
                    last_heartbeat_at = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [
                payload.status || 'ONLINE', 
                payload.machine_state || 'IDLE', 
                payload.worker_state || 'READY',
                payload.utilization_pct || 0, 
                timestamp, 
                nodeId
            ]);

            // 3. Update the underlying Printer Node (idempotent registry)
            await db.query(`
                UPDATE printer_nodes SET
                    status = 'ACTIVE',
                    machine_state = ?,
                    worker_state = ?,
                    capacity_utilization_pct = ?,
                    last_heartbeat_at = ?
                WHERE id = ?
            `, [
                payload.machine_state || 'IDLE',
                payload.worker_state || 'READY',
                payload.utilization_pct || 0,
                timestamp,
                nodeId
            ]);

            logger.info({ 
                type: 'TELEMETRY-INGESTION', 
                event: 'heartbeat_processed', 
                nodeId, 
                status: payload.status,
                trace_id
            }, `[TELEMETRY-INGESTION] Heartbeat from ${nodeId} processed.`);

            return { success: true, timestamp: timestamp.toISOString() };
        } catch (err) {
            logger.error({ 
                type: 'TELEMETRY-INGESTION-FAILED', 
                nodeId, 
                error: err.message,
                trace_id
            }, `[TELEMETRY-INGESTION-FAILED] ${nodeId}: ${err.message}`);
            throw err;
        }
    }

    /**
     * Handles heartbeat event from the industrial event bus.
     */
    async handleHeartbeat(payload, options = {}) {
        if (!payload || !payload.nodeId) {
            logger.warn({ type: 'TELEMETRY-INVALID-PAYLOAD', payload }, '[TELEMETRY-INVALID-PAYLOAD] Received heartbeat without nodeId');
            return;
        }
        return this.ingestHeartbeat(payload.nodeId, payload, options);
    }

    /**
     * Periodic check to mark stale nodes as DEGRADED.
     */
    async checkStaleNodes() {
        const threshold = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes
        
        try {
            // Mark as DEGRADED if last heartbeat is older than 15 minutes
            const result = await db.query(`
                UPDATE print_nodes 
                SET status = 'DEGRADED' 
                WHERE last_heartbeat_at < ? AND status != 'OFFLINE' AND status != 'DEGRADED'
            `, [threshold]);
            
            if (result.affectedRows > 0) {
                logger.info({ type: 'TELEMETRY-STALE-NODES', count: result.affectedRows }, `[TELEMETRY-STALE-NODES] Marked ${result.affectedRows} nodes as DEGRADED due to inactivity.`);
            }
        } catch (error) {
            logger.error({ type: 'TELEMETRY-STALE-CHECK-FAILED', error: error.message }, `[TELEMETRY-STALE-CHECK-FAILED] ${error.message}`);
        }
    }

    /**
     * Aggregated overview of the entire manufacturing grid.
     */
    async getTelemetryOverview() {
        try {
            const [nodeStats] = await db.query(`
                SELECT 
                    COUNT(*) as total_nodes,
                    SUM(CASE WHEN status = 'ONLINE' THEN 1 ELSE 0 END) as online_nodes,
                    SUM(CASE WHEN status = 'BUSY' THEN 1 ELSE 0 END) as busy_nodes,
                    SUM(CASE WHEN status = 'OFFLINE' THEN 1 ELSE 0 END) as offline_nodes,
                    AVG(capacity_utilization_pct) as avg_utilization
                FROM print_nodes
            `);

            const [jobStats] = await db.query(`
                SELECT 
                    SUM(active_jobs) as total_active_jobs,
                    SUM(queue_depth) as total_queue_depth
                FROM node_heartbeats
                WHERE heartbeat_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
            `);

            return {
                timestamp: new Date().toISOString(),
                nodes: {
                    total: nodeStats.total_nodes || 0,
                    online: nodeStats.online_nodes || 0,
                    busy: nodeStats.busy_nodes || 0,
                    offline: nodeStats.offline_nodes || 0,
                    utilization: parseFloat(nodeStats.avg_utilization || 0).toFixed(2)
                },
                production: {
                    activeJobs: jobStats.total_active_jobs || 0,
                    queueDepth: jobStats.total_queue_depth || 0
                }
            };
        } catch (err) {
            logger.error({ event: 'get_telemetry_overview_failed', error: err.message });
            return { error: true, message: err.message };
        }
    }

    /**
     * Detailed performance data for all nodes.
     */
    async getNodesPerformance() {
        return await db.query(`
            SELECT 
                id, company_name, status, machine_state, worker_state,
                capacity_utilization_pct, uptime_score, economic_efficiency,
                last_heartbeat_at
            FROM print_nodes
            ORDER BY capacity_utilization_pct DESC
        `);
    }

    /**
     * Historical telemetry for a specific node or the whole grid.
     */
    async getTelemetryHistory(nodeId = null, limit = 100) {
        let sql = `
            SELECT h.*, n.company_name 
            FROM node_heartbeats h
            JOIN print_nodes n ON h.node_id = n.id
        `;
        const params = [];

        if (nodeId) {
            sql += ` WHERE h.node_id = ? `;
            params.push(nodeId);
        }

        sql += ` ORDER BY h.heartbeat_at DESC LIMIT ? `;
        params.push(limit);

        return await db.query(sql, params);
    }
}

module.exports = new IndustrialTelemetryService();
