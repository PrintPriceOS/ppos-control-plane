/**
 * src/api/services/anomalyTelemetryService.js
 * 
 * Centralized telemetry stream for industrial anomalies and drift events.
 */
const logger = require('./logger').child('anomaly-telemetry');

class AnomalyTelemetryService {
    /**
     * Logs a structured anomaly event.
     */
    logEvent(eventType, metadata) {
        const payload = {
            event: eventType,
            nodeId: metadata.nodeId,
            machineId: metadata.machineId,
            anomalyScore: metadata.anomalyScore || 0,
            contributingFactors: metadata.contributingFactors || [],
            industrialContext: metadata.context || {},
            timestamp: new Date().toISOString()
        };

        // Ensure no null messages
        logger.info(payload);
        
        return payload;
    }

    /**
     * Specialized event loggers
     */
    logAnomalyDetected(metadata) { return this.logEvent('anomaly_detected', metadata); }
    logDriftDetected(metadata) { return this.logEvent('drift_detected', metadata); }
    logFailureWarning(metadata) { return this.logEvent('predictive_failure_warning', metadata); }
    logPreemptiveReroute(metadata) { return this.logEvent('preemptive_reroute', metadata); }
    logInstabilityDetected(metadata) { return this.logEvent('industrial_instability_detected', metadata); }
}

module.exports = new AnomalyTelemetryService();
