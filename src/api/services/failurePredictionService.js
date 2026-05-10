/**
 * src/api/services/failurePredictionService.js
 * 
 * Deterministic failure probability escalation engine.
 */
const anomaly = require('./anomalyDetectionService');

class FailurePredictionService {
    /**
     * Predicts the probability of failure for a machine.
     */
    async predictFailure(nodeId, machineId) {
        const anomalyResult = await anomaly.calculateAnomalyScore(nodeId, machineId);
        
        // Probability is heavily weighted by anomaly score
        let probability = anomalyResult.score / 100;
        
        // Severity mapping
        let severity = 'LOW';
        if (probability >= 0.8) severity = 'CRITICAL';
        else if (probability >= 0.5) severity = 'HIGH';
        else if (probability >= 0.2) severity = 'MODERATE';

        return {
            failure_probability: probability,
            severity,
            anomaly_impact: anomalyResult.score,
            contributing_factors: anomalyResult.factors
        };
    }
}

module.exports = new FailurePredictionService();
