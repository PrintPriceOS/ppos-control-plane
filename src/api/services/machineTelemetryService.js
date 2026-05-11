/**
 * Machine Telemetry Service
 * 
 * Aggregates live operational data from heartbeats, dispatches, and throughput history.
 * Phase 34 - Live Federation Activation.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('machine-telemetry');

class MachineTelemetryService {
    /**
     * Get aggregated machine state for the drawer
     */
    async getMachineDetails(machineId) {
        // 1. Fetch Core Machine Info (from print_nodes / machine_profiles)
        const [nodeRows] = await db.query(`
            SELECT 
                pn.*,
                pm.profile_name as machine_name,
                pm.manufacturer,
                pm.model,
                pm.profile_type,
                pm.raw_data_json as profile_data
            FROM print_nodes pn
            LEFT JOIN print_node_machine_profiles pm ON pn.id = pm.node_id
            WHERE pn.id = ? OR pn.company_name = ?
            LIMIT 1
        `, [machineId, machineId]);

        if (!nodeRows) {
            throw new Error(`Machine ${machineId} not found in federation registry.`);
        }

        const node = nodeRows;

        // 2. Fetch Live Telemetry (Latest Heartbeat + Aggregates)
        const [telemetryRows] = await db.query(`
            SELECT * FROM machine_telemetry WHERE machine_id = ?
        `, [node.id]);

        const [heartbeatRows] = await db.query(`
            SELECT * FROM node_heartbeats 
            WHERE node_id = ? 
            ORDER BY heartbeat_at DESC LIMIT 1
        `, [node.id]);

        // 3. Fetch Throughput Aggregates (24h / 7d)
        const [throughput24h] = await db.query(`
            SELECT 
                SUM(jobs_completed) as completed,
                SUM(jobs_failed) as failed,
                AVG(sla_success_ratio) as sla_avg,
                AVG(avg_preflight_score) as preflight_avg
            FROM machine_throughput_history
            WHERE machine_id = ? AND period_start >= NOW() - INTERVAL 24 HOUR
        `, [node.id]);

        const [throughput7d] = await db.query(`
            SELECT 
                SUM(jobs_completed) as completed,
                SUM(jobs_failed) as failed
            FROM machine_throughput_history
            WHERE machine_id = ? AND period_start >= NOW() - INTERVAL 7 DAY
        `, [node.id]);

        // 4. Fetch Recent Incidents
        const [incidents] = await db.query(`
            SELECT * FROM machine_incidents 
            WHERE machine_id = ? AND resolved = FALSE
            ORDER BY created_at DESC LIMIT 10
        `, [node.id]);

        return {
            header: {
                id: node.id,
                name: node.machine_name || node.company_name,
                manufacturer: node.manufacturer || 'INDUSTRIAL_GENERIC',
                model: node.model || 'CONTROL_PLANE_V1',
                printhouse: node.company_name,
                region: node.country || 'GLOBAL',
                timezone: 'UTC', // Default to UTC for industrial coordination
                mode: node.status === 'ONLINE' ? 'LIVE' : 'ISOLATED',
                heartbeat_age_sec: node.last_heartbeat_at ? Math.floor((Date.now() - new Date(node.last_heartbeat_at).getTime()) / 1000) : null,
                status: node.status,
                uptime_pct: telemetryRows?.utilization_pct || 0 // Proxying uptime for now
            },
            telemetry: {
                jobs_running: heartbeatRows?.active_jobs || 0,
                jobs_queued: heartbeatRows?.queue_depth || 0,
                jobs_failed_24h: throughput24h?.failed || 0,
                throughput_h: telemetryRows?.throughput_h || 0,
                utilization_pct: node.capacity_utilization_pct || 0,
                avg_turnaround: telemetryRows?.avg_turnaround_mins || 0,
                avg_lead_time: telemetryRows?.avg_lead_time_mins || 0,
                dispatch_latency: telemetryRows?.avg_dispatch_latency_ms || 0,
                saturation: telemetryRows?.estimated_saturation_pct || 0,
                current_load: node.capacity_utilization_pct || 0
            },
            history: {
                t24h: throughput24h || { completed: 0, failed: 0, sla_avg: 0, preflight_avg: 0 },
                t7d: throughput7d || { completed: 0, failed: 0 },
                incidents: incidents || []
            }
        };
    }
}

module.exports = new MachineTelemetryService();
