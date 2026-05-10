/**
 * src/api/services/nodeDriftService.js
 * 
 * Detects performance drift from historical industrial baselines.
 */
const db = require('./mysqlClient');
const telemetry = require('./anomalyTelemetryService');

class NodeDriftService {
    /**
     * Compares current performance against baseline.
     */
    async analyzeDrift(nodeId) {
        const [node] = await db.query("SELECT reliability_score FROM printer_reliability_metrics WHERE printer_id = ?", [nodeId]);
        if (!node) return null;

        const historicalBaseline = 90; // Default industrial baseline
        const current = node.reliability_score;
        const drift = historicalBaseline - current;

        if (drift > 20) {
            telemetry.logDriftDetected({
                nodeId,
                anomalyScore: drift,
                contributingFactors: ['RELIABILITY_DRIFT'],
                context: { current, baseline: historicalBaseline }
            });

            // Persist drift score
            await db.query(
                "UPDATE print_node_machine_profiles SET current_drift_score = ? WHERE node_id = ?",
                [drift, nodeId]
            );

            return { driftDetected: true, score: drift };
        }

        return { driftDetected: false, score: 0 };
    }
}

module.exports = new NodeDriftService();
