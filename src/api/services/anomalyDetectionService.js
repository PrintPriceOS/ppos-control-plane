/**
 * src/api/services/anomalyDetectionService.js
 * 
 * Deterministic anomaly detection and scoring engine.
 */
const db = require('./mysqlClient');
const throughput = require('./throughputAnalysisService');
const drift = require('./nodeDriftService');
const telemetry = require('./anomalyTelemetryService');

class AnomalyDetectionService {
    /**
     * Calculates the aggregate anomaly score for a node/machine.
     */
    async calculateAnomalyScore(nodeId, machineId) {
        let aggregateScore = 0;
        const contributingFactors = [];

        // 1. Throughput Collapse Check
        const throughputResult = await throughput.detectThroughputAnomaly(machineId, 100);
        if (throughputResult.anomaly) {
            aggregateScore += throughputResult.score;
            contributingFactors.push(throughputResult.factor);
        }

        // 2. Drift Check
        const driftResult = await drift.analyzeDrift(nodeId);
        if (driftResult && driftResult.driftDetected) {
            aggregateScore += driftResult.score;
            contributingFactors.push('PERFORMANCE_DRIFT');
        }

        // 3. Repeated Reroutes Check
        const [rerouteStats] = await db.query(`
            SELECT COUNT(*) as count 
            FROM manufacturing_dispatch_events 
            WHERE event_type = 'AUTO_REROUTED' 
            AND metadata_json->'$.old_node' = ?
            AND created_at >= NOW() - INTERVAL 4 HOUR
        `, [nodeId]);

        if (rerouteStats.count >= 3) {
            aggregateScore += 30;
            contributingFactors.push('EXCESSIVE_REROUTE_CHURN');
        }

        // Final score capping
        aggregateScore = Math.min(aggregateScore, 100);
        
        let severity = 'NORMAL';
        if (aggregateScore >= 80) severity = 'CRITICAL';
        else if (aggregateScore >= 50) severity = 'HIGH';
        else if (aggregateScore >= 25) severity = 'ELEVATED';

        if (aggregateScore > 10) {
            telemetry.logAnomalyDetected({
                nodeId,
                machineId,
                anomalyScore: aggregateScore,
                contributingFactors,
                context: { severity }
            });
        }

        return { score: aggregateScore, severity, factors: contributingFactors };
    }
}

module.exports = new AnomalyDetectionService();
