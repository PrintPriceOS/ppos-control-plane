/**
 * src/api/services/routing/SlaPredictionService.js
 * 
 * Predictive Industrial Intelligence for SLA Reliability.
 * Analyzes queue pressure, throughput history, and node health to predict delivery success.
 */
const db = require('../mysqlClient');
const logger = require('../logger').child('sla-prediction');

class SlaPredictionService {
    /**
     * Predicts the likelihood of meeting a specific delivery deadline at a node.
     */
    async predictSlaLikelihood(nodeId, deadline, jobComplexity = 1) {
        try {
            // 1. Get Node Telemetry & Current Load
            const [node] = await db.query(`
                SELECT 
                    capacity_utilization_pct,
                    throughput,
                    uptime_score,
                    queue_depth,
                    active_jobs
                FROM print_nodes
                WHERE id = ?
            `, [nodeId]);

            if (!node) return { likelihood: 0, reason: 'NODE_NOT_FOUND', risk: 'CRITICAL' };

            // 2. Get Recent Throughput History (Last 24h)
            const [throughput] = await db.query(`
                SELECT AVG(processing_ms) as avg_processing_ms
                FROM metrics
                WHERE printhouse_id = (SELECT printhouse_id FROM control_users WHERE id = ?)
                AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
            `, [nodeId]);
            // Note: printhouse_id mapping might be complex, using node.id for now or assuming metrics has printhouse_id

            // 3. Calculate Estimated Production Start
            // Simple heuristic: (Queue Depth * Avg Processing) / Throughput Factor
            const avgMs = throughput?.avg_processing_ms || 3600000; // Default 1h per job
            const estimatedWaitMs = (node.queue_depth + node.active_jobs) * avgMs * jobComplexity;
            const now = new Date();
            const estimatedStart = new Date(now.getTime() + estimatedWaitMs);
            
            // 4. Compare with Deadline
            const targetDeadline = new Date(deadline);
            const bufferMs = targetDeadline.getTime() - estimatedStart.getTime();
            const bufferHours = bufferMs / (1000 * 60 * 60);

            // 5. Risk Assessment
            let risk = 'LOW';
            let likelihood = 100;

            if (bufferHours < 2) {
                risk = 'CRITICAL';
                likelihood = 20;
            } else if (bufferHours < 6) {
                risk = 'HIGH';
                likelihood = 50;
            } else if (bufferHours < 12) {
                risk = 'MEDIUM';
                likelihood = 80;
            }

            // 6. Adjust by Uptime Score
            likelihood = (likelihood * (node.uptime_score / 100)).toFixed(2);

            return {
                likelihood: parseFloat(likelihood),
                estimated_start: estimatedStart.toISOString(),
                buffer_hours: parseFloat(bufferHours.toFixed(2)),
                risk,
                telemetry: {
                    utilization: node.capacity_utilization_pct,
                    queue: node.queue_depth
                }
            };

        } catch (err) {
            logger.error({ event: 'sla_prediction_failed', node_id: nodeId, error: err.message });
            return { likelihood: 0, reason: 'PREDICTION_ERROR', risk: 'UNKNOWN' };
        }
    }

    /**
     * Aggregated SLA Risk for a Region.
     */
    async getRegionalSlaRisk(region) {
        const nodes = await db.query(`
            SELECT id, uptime_score, capacity_utilization_pct
            FROM print_nodes
            WHERE region = ? AND status = 'ONLINE'
        `, [region]);

        if (!nodes.length) return { risk: 'UNKNOWN', nodes: 0 };

        const avgUtil = nodes.reduce((sum, n) => sum + n.capacity_utilization_pct, 0) / nodes.length;
        const avgUptime = nodes.reduce((sum, n) => sum + n.uptime_score, 0) / nodes.length;

        let risk = 'LOW';
        if (avgUtil > 85) risk = 'CRITICAL';
        else if (avgUtil > 70) risk = 'HIGH';
        else if (avgUtil > 50) risk = 'MEDIUM';

        return {
            region,
            risk,
            avg_utilization: avgUtil.toFixed(2),
            avg_uptime: avgUptime.toFixed(2),
            node_count: nodes.length
        };
    }
}

module.exports = new SlaPredictionService();
