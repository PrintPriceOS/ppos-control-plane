/**
 * src/api/services/preemptiveRecoveryService.js
 * 
 * Executes self-healing actions before production failures occur.
 */
const db = require('./mysqlClient');
const failure = require('./failurePredictionService');
const rerouteService = require('./autonomousRerouteService');
const telemetry = require('./anomalyTelemetryService');

class PreemptiveRecoveryService {
    /**
     * Scans for unstable dispatches and performs preemptive rerouting.
     */
    async runPreemptiveRecovery() {
        const dispatches = await db.query(
            "SELECT id, node_id, machine_id FROM manufacturing_dispatches WHERE status NOT IN ('DELIVERED', 'FAILED', 'CANCELED', 'REROUTED')"
        );

        let recovered = 0;
        for (const d of dispatches) {
            const prediction = await failure.predictFailure(d.node_id, d.machine_id);
            
            if (prediction.severity === 'CRITICAL' || prediction.severity === 'HIGH') {
                telemetry.logPreemptiveReroute({
                    nodeId: d.node_id,
                    machineId: d.machine_id,
                    anomalyScore: prediction.anomaly_impact,
                    contributingFactors: prediction.contributing_factors,
                    context: { dispatchId: d.id, reason: 'PREEMPTIVE_INSTABILITY_RECOVERY' }
                });

                // Trigger autonomous reroute with predictive flag
                await rerouteService.executeReroute(d.id, {
                    reason: 'PREEMPTIVE_INSTABILITY_DETECTION',
                    is_preemptive: true
                });
                recovered++;
            }
        }

        return recovered;
    }
}

module.exports = new PreemptiveRecoveryService();
