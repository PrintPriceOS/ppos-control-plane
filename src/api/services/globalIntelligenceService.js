/**
 * src/api/services/globalIntelligenceService.js
 * 
 * Aggregates predictive signals and anomaly telemetry into global federation intelligence.
 */
const twin = require('./federatedDigitalTwinService');
const registry = require('./federationRegistryService');
const recovery = require('./federationRecoveryService');

class GlobalIntelligenceService {
    async computeGlobalHealth() {
        const latestSnapshot = await twin.getLatestSnapshot();
        const activeFactories = await registry.getActiveFactories();
        const recoveryEvents = await recovery.getActiveRecoveryEvents();

        const globalStability = latestSnapshot?.federation_stability ?? 100;
        const imbalance = latestSnapshot?.inter_factory_imbalance ?? 0;
        
        // Federation Risk: High if many recovery events or high imbalance
        const riskScore = (recoveryEvents.length * 20) + (imbalance > 50 ? 30 : 0);
        
        const health = {
            timestamp: new Date().toISOString(),
            globalIndustrialHealth: Math.max(0, 100 - riskScore),
            swarmStabilityIndex: globalStability,
            federationRiskScore: Math.min(100, riskScore),
            globalRecoveryPressure: recoveryEvents.length > 0 ? 'HIGH' : 'STABLE',
            activeFederationNodes: activeFactories.length
        };

        return health;
    }
}

module.exports = new GlobalIntelligenceService();
