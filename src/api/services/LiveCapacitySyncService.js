/**
 * src/api/services/LiveCapacitySyncService.js
 * 
 * Phase 34 - Live Federation Activation.
 * Synchronizes real-time node heartbeats into operational capacity states.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('live-capacity-sync');

class LiveCapacitySyncService {
    /**
     * Aggregates latest heartbeats and updates system-wide capacity state.
     */
    async syncLiveCapacity() {
        logger.info({ event: 'capacity_sync_start' });

        try {
            // 1. Fetch latest heartbeat for every known node
            const latestHeartbeats = await db.query(`
                SELECT h.* 
                FROM node_heartbeats h
                INNER JOIN (
                    SELECT node_id, MAX(heartbeat_at) as max_at
                    FROM node_heartbeats
                    GROUP BY node_id
                ) latest ON h.node_id = latest.node_id AND h.heartbeat_at = latest.max_at
            `);

            const now = new Date();
            let syncCount = 0;

            for (const hb of latestHeartbeats) {
                const lastSeen = new Date(hb.heartbeat_at);
                const diffMinutes = (now - lastSeen) / (1000 * 60);

                // 2. Derive Operational Intelligence
                let freshnessState = 'FRESH';
                let routingEligible = true;
                
                if (diffMinutes > 15) {
                    freshnessState = 'STALE';
                    routingEligible = false;
                } else if (diffMinutes > 5) {
                    freshnessState = 'DELAYED';
                }

                let liveStatus = hb.status;
                if (freshnessState === 'STALE') {
                    liveStatus = 'OFFLINE';
                }

                let saturationRisk = 'LOW';
                if (hb.utilization_pct > 90) saturationRisk = 'CRITICAL';
                else if (hb.utilization_pct > 75) saturationRisk = 'HIGH';

                // 3. Persist Operational State (print_nodes)
                await db.query(`
                    UPDATE print_nodes 
                    SET status = ?, 
                        capacity_utilization_pct = ?,
                        last_heartbeat_at = ?,
                        machine_state = ?,
                        worker_state = ?,
                        sync_version = ?
                    WHERE id = ?
                `, [
                    liveStatus, 
                    hb.utilization_pct || 0, 
                    hb.heartbeat_at, 
                    hb.machine_state || 'UNKNOWN', 
                    hb.worker_state || 'UNKNOWN',
                    hb.sync_version || '1.0',
                    hb.node_id
                ]);

                // 4. Update Registry (printer_nodes)
                await db.query(`
                    UPDATE printer_nodes
                    SET status = ?,
                        capacity_utilization_pct = ?,
                        queue_depth = ?,
                        active_jobs = ?,
                        machine_state = ?,
                        worker_state = ?
                    WHERE id = ?
                `, [
                    liveStatus === 'OFFLINE' ? 'OFFLINE' : 'ACTIVE', 
                    hb.utilization_pct || 0, 
                    hb.queue_depth || 0, 
                    hb.active_jobs || 0,
                    hb.machine_state || 'UNKNOWN',
                    hb.worker_state || 'UNKNOWN',
                    hb.node_id
                ]);

                // 5. Capture Snapshot for Intelligence Timeline
                await db.query(`
                    INSERT INTO live_capacity_snapshots (
                        node_id, status, utilization_pct, freshness_state, 
                        routing_eligible, saturation_risk, captured_at
                    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                `, [
                    hb.node_id, 
                    liveStatus, 
                    hb.utilization_pct || 0, 
                    freshnessState, 
                    routingEligible, 
                    saturationRisk
                ]);

                syncCount++;
            }

            logger.info({ event: 'capacity_sync_complete', syncCount });
            return { ok: true, syncCount, timestamp: new Date().toISOString() };
        } catch (err) {
            logger.error({ event: 'capacity_sync_failed', error: err.message });
            throw err;
        }
    }

    /**
     * Retrieves the latest capacity state for all nodes.
     */
    async getLiveCapacityOverview() {
        return db.query(`
            SELECT s.*, p.company_name, p.city, p.country
            FROM live_capacity_snapshots s
            JOIN print_nodes p ON s.node_id = p.id
            WHERE s.captured_at IN (
                SELECT MAX(captured_at) 
                FROM live_capacity_snapshots 
                GROUP BY node_id
            )
            ORDER BY s.utilization_pct DESC
        `);
    }
}

module.exports = new LiveCapacitySyncService();
