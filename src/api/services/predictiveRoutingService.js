/**
 * src/api/services/predictiveRoutingService.js
 * 
 * Augments current routing logic with predictive scoring and future-aware constraints.
 */
const recommendationService = require('./dispatchRecommendationService');
const bottleneckService = require('./predictiveBottleneckService');
const materialService = require('./materialAvailabilityService');
const logger = require('./logger').child('predictive-routing');

class PredictiveRoutingService {
    /**
     * Provides a future-aware recommendation.
     */
    async getPredictiveRecommendation(jobId, options = {}) {
        logger.info({ event: 'predictive_routing_start', jobId });
        
        // 1. Get base recommendation
        const base = await recommendationService.getRecommendation(jobId, options);
        if (!base || !base.ok) return base;

        // 2. Augment with bottleneck prediction
        const nodeForecasts = await bottleneckService.forecastSaturation(base.best_node.id);
        const bestMachineForecast = nodeForecasts.find(f => f.machineId === base.best_machine.id);
        
        let predictiveScore = base.score || 80;
        const warnings = [];

        if (bestMachineForecast && bestMachineForecast.riskLevel !== 'STABLE') {
            predictiveScore -= 20;
            warnings.push(`PREDICTIVE_BOTTLENECK: ${bestMachineForecast.riskLevel}`);
        }

        // 3. Augment with material forecast
        const materialShortages = await materialService.forecastDepletion(base.best_node.id);
        const hasMaterialShortage = materialShortages.length > 0;
        
        if (hasMaterialShortage) {
            predictiveScore -= 50; // Critical penalty threshold
            warnings.push(`PREDICTIVE_MATERIAL_SHORTAGE: Substrate capacity unconfirmed or depleted for ${materialShortages.map(s => s.material).join(', ')}`);
        }

        return {
            ...base,
            predictive_score: Math.max(predictiveScore, 0),
            predictive_warnings: warnings,
            is_predictive: true,
            is_routable: !hasMaterialShortage, // Strict gatekeeping parameter preventing assignment to nodes without stock
            routing_blocked_by_material_shortage: hasMaterialShortage
        };
    }
}

module.exports = new PredictiveRoutingService();
