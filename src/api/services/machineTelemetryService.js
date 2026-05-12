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
        let targetId = machineId;
        if (targetId && targetId.startsWith('machine_') && targetId.endsWith('_primary')) {
            targetId = targetId.substring(8, targetId.length - 8);
        }

        try {
            // 1. Fetch Core Machine Info
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
            `, [targetId, targetId]);

            if (!nodeRows) {
                return {
                    header: {
                        id: machineId,
                        name: `Primary Machine (${targetId})`,
                        manufacturer: 'SYNTHETIC_FEDERATION_NODE',
                        model: 'UNREGISTERED_PROFILE',
                        printhouse: targetId,
                        region: 'FEDERATION_SYNTHETIC',
                        timezone: 'UTC',
                        mode: 'ISOLATED',
                        heartbeat_age_sec: null,
                        status: 'OFFLINE',
                        uptime_pct: 0,
                        source_status: 'SYNTHETIC_OR_UNREGISTERED_PROFILE'
                    },
                    telemetry: {
                        jobs_running: 0,
                        jobs_queued: 0,
                        jobs_failed_24h: 0,
                        throughput_h: 0,
                        utilization_pct: 0,
                        avg_turnaround: 0,
                        avg_lead_time: 0,
                        dispatch_latency: 0,
                        saturation: 0,
                        current_load: 0,
                        source_status: 'SYNTHETIC_OR_UNREGISTERED_PROFILE'
                    },
                    history: {
                        t24h: { completed: 0, failed: 0, sla_avg: 0, preflight_avg: 0 },
                        t7d: { completed: 0, failed: 0 },
                        incidents: [],
                        source_status: 'SYNTHETIC_OR_UNREGISTERED_PROFILE'
                    },
                    source_status: 'SYNTHETIC_OR_UNREGISTERED_PROFILE'
                };
            }

            const node = nodeRows;

            // 2. Fetch Live Telemetry
            let telemetryRows = null;
            try {
                const [tRows] = await db.query("SELECT * FROM machine_telemetry WHERE machine_id = ?", [node.id]);
                if (tRows) telemetryRows = tRows;
            } catch (e) {}

            let heartbeatRows = null;
            try {
                const [hRows] = await db.query("SELECT * FROM node_heartbeats WHERE node_id = ? ORDER BY heartbeat_at DESC LIMIT 1", [node.id]);
                if (hRows) heartbeatRows = hRows;
            } catch (e) {}

            // 3. Fetch Throughput Aggregates
            let throughput24h = null;
            try {
                const [tp24] = await db.query(`
                    SELECT 
                        SUM(jobs_completed) as completed,
                        SUM(jobs_failed) as failed,
                        AVG(sla_success_ratio) as sla_avg,
                        AVG(avg_preflight_score) as preflight_avg
                    FROM machine_throughput_history
                    WHERE machine_id = ? AND period_start >= NOW() - INTERVAL 24 HOUR
                `, [node.id]);
                if (tp24) throughput24h = tp24;
            } catch (e) {}

            let throughput7d = null;
            try {
                const [tp7] = await db.query(`
                    SELECT 
                        SUM(jobs_completed) as completed,
                        SUM(jobs_failed) as failed
                    FROM machine_throughput_history
                    WHERE machine_id = ? AND period_start >= NOW() - INTERVAL 7 DAY
                `, [node.id]);
                if (tp7) throughput7d = tp7;
            } catch (e) {}

            // 4. Fetch Recent Incidents
            let incidents = [];
            try {
                const [inc] = await db.query("SELECT * FROM machine_incidents WHERE machine_id = ? AND resolved = FALSE ORDER BY created_at DESC LIMIT 10", [node.id]);
                if (inc && Array.isArray(inc)) incidents = inc;
            } catch (e) {}

            return {
                header: {
                    id: node.id,
                    name: node.machine_name || node.company_name,
                    manufacturer: node.manufacturer || 'INDUSTRIAL_GENERIC',
                    model: node.model || 'CONTROL_PLANE_V1',
                    printhouse: node.company_name,
                    region: node.country || 'GLOBAL',
                    timezone: 'UTC',
                    mode: node.status === 'ONLINE' ? 'LIVE' : 'ISOLATED',
                    heartbeat_age_sec: node.last_heartbeat_at ? Math.floor((Date.now() - new Date(node.last_heartbeat_at).getTime()) / 1000) : null,
                    status: node.status,
                    uptime_pct: telemetryRows?.utilization_pct || 0,
                    source_status: 'LIVE_TELEMETRY'
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
                    current_load: node.capacity_utilization_pct || 0,
                    source_status: 'LIVE_TELEMETRY'
                },
                history: {
                    t24h: throughput24h || { completed: 0, failed: 0, sla_avg: 0, preflight_avg: 0 },
                    t7d: throughput7d || { completed: 0, failed: 0 },
                    incidents: incidents || [],
                    source_status: 'LIVE_TELEMETRY'
                },
                source_status: 'LIVE_TELEMETRY'
            };
        } catch (err) {
            return {
                header: {
                    id: machineId,
                    name: `Primary Machine (${targetId})`,
                    manufacturer: 'SYNTHETIC_FEDERATION_NODE',
                    model: 'UNREGISTERED_PROFILE',
                    printhouse: targetId,
                    region: 'FEDERATION_SYNTHETIC',
                    timezone: 'UTC',
                    mode: 'ISOLATED',
                    heartbeat_age_sec: null,
                    status: 'OFFLINE',
                    uptime_pct: 0,
                    source_status: 'SYNTHETIC_OR_UNREGISTERED_PROFILE'
                },
                telemetry: {
                    jobs_running: 0,
                    jobs_queued: 0,
                    jobs_failed_24h: 0,
                    throughput_h: 0,
                    utilization_pct: 0,
                    avg_turnaround: 0,
                    avg_lead_time: 0,
                    dispatch_latency: 0,
                    saturation: 0,
                    current_load: 0,
                    source_status: 'SYNTHETIC_OR_UNREGISTERED_PROFILE'
                },
                history: {
                    t24h: { completed: 0, failed: 0, sla_avg: 0, preflight_avg: 0 },
                    t7d: { completed: 0, failed: 0 },
                    incidents: [],
                    source_status: 'SYNTHETIC_OR_UNREGISTERED_PROFILE'
                },
                source_status: 'SYNTHETIC_OR_UNREGISTERED_PROFILE'
            };
        }
    }
}

module.exports = new MachineTelemetryService();
