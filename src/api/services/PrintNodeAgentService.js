/**
 * src/api/services/PrintNodeAgentService.js
 * 
 * Phase 34 - Live Federation Activation.
 * Manages continuously-connected print nodes and their telemetry state.
 */
const db = require('./mysqlClient');
const heartbeatService = require('./industrialHeartbeatService');
const logger = require('./logger').child('print-node-agent');

class PrintNodeAgentService {
    /**
     * Processes a real agent heartbeat, updating registry and telemetry.
     */
    async processHeartbeat(payload) {
        // 1. Structural Validation
        if (!payload.node_id) {
            throw new Error('Industrial Agent Error: Missing node_id in heartbeat payload.');
        }

        logger.info({ 
            event: 'agent_heartbeat_received', 
            nodeId: payload.node_id,
            status: payload.status 
        });

        // 2. Delegate to core heartbeat logic (persists to node_heartbeats)
        const heartbeatResult = await heartbeatService.processNodeHeartbeat(payload);

        // 3. Update Registry tables with real-time agent metadata
        try {
            await db.query(`
                UPDATE print_nodes 
                SET machine_state = ?, 
                    worker_state = ?, 
                    sync_version = ?,
                    last_heartbeat_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [
                payload.machine_state || 'READY',
                payload.worker_state || 'ACTIVE',
                payload.sync_version || '1.0.0',
                payload.node_id
            ]);

            // Update source printer_nodes record if it exists
            await db.query(`
                UPDATE printer_nodes 
                SET machine_state = ?, 
                    worker_state = ?, 
                    sync_version = ?,
                    queue_depth = ?,
                    active_jobs = ?,
                    capacity_utilization_pct = ?
                WHERE id = ?
            `, [
                payload.machine_state || 'READY',
                payload.worker_state || 'ACTIVE',
                payload.sync_version || '1.0.0',
                payload.queue_depth || 0,
                payload.active_jobs || 0,
                payload.capacity_utilization_pct || 0,
                payload.node_id
            ]);

        } catch (err) {
            logger.warn({ 
                event: 'registry_update_failed', 
                nodeId: payload.node_id, 
                error: err.message 
            });
            // Non-fatal: heartbeat was already persisted to node_heartbeats
        }

        return {
            ok: true,
            nodeId: payload.node_id,
            registryState: heartbeatResult.state,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Returns all nodes currently considered ONLINE in the federation.
     */
    async getLiveNodes() {
        return db.query(`
            SELECT id, company_name, status, machine_state, worker_state, 
                   capacity_utilization_pct, last_heartbeat_at
            FROM print_nodes
            WHERE last_heartbeat_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
            ORDER BY last_heartbeat_at DESC
        `);
    }

    /**
     * Returns detailed status for a single node.
     */
    async getNodeStatus(nodeId) {
        const [node] = await db.query(`
            SELECT * FROM print_nodes WHERE id = ?
        `, [nodeId]);
        
        if (!node) return null;

        const [latestHeartbeat] = await db.query(`
            SELECT * FROM node_heartbeats 
            WHERE node_id = ? 
            ORDER BY heartbeat_at DESC LIMIT 1
        `, [nodeId]);

        return {
            ...node,
            latest_heartbeat: latestHeartbeat || null
        };
    }
}

module.exports = new PrintNodeAgentService();
