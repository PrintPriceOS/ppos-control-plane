/**
 * src/api/services/dispatchRecommendationService.js
 * 
 * Orchestrates routing services to generate ranked industrial dispatch recommendations.
 */
const economicRouting = require('./economicRoutingService');
const reliabilityScoring = require('./reliabilityScoringService');
const capacityScoring = require('./capacityScoringService');
const logger = require('./logger').child('dispatch-recommendation');

class DispatchRecommendationService {
    /**
     * Generates ranked recommendations for a job specification.
     */
    async getRecommendations(specs) {
        try {
            // 1. Get base candidates (Technical + Economic)
            const candidates = await economicRouting.evaluateCandidates(specs);
            
            if (candidates.length === 0) {
                return {
                    ok: true,
                    recommendations: [],
                    message: 'NO_COMPATIBLE_MACHINES_FOUND'
                };
            }

            // 2. Normalize Economic Scores
            // Find lowest cost to use as baseline
            const lowestCost = Math.min(...candidates.map(c => c.estimatedCost));
            
            const processed = await Promise.all(candidates.map(async (c) => {
                // 3. Get Reliability and Congestion Scores
                const reliability = await reliabilityScoring.getScore(c.nodeId);
                const congestion = await capacityScoring.getScore(c.nodeId);
                
                // 4. Calculate SLA Score (SImple heuristic for now)
                let slaScore = 80;
                if (specs.is_rush && congestion.score < 50) slaScore = 40; // High congestion hurts rush
                if (specs.is_rush && congestion.score > 80) slaScore = 100;

                // 5. Final Weighted Scoring
                // technicalScore * 0.35 + economicScore * 0.30 + reliabilityScore * 0.20 + congestionScore * 0.10 + slaScore * 0.05
                
                const economicScore = (lowestCost / c.estimatedCost) * 100;
                const finalScore = (
                    (c.technicalScore * 0.35) +
                    (economicScore * 0.30) +
                    (reliability.score * 0.20) +
                    (congestion.score * 0.10) +
                    (slaScore * 0.05)
                );

                // 6. Generate Explainability Reasons
                const reasons = [];
                if (c.technicalScore === 100) reasons.push('Fully compatible machine profile');
                if (economicScore > 90) reasons.push('Optimal production economics');
                if (reliability.confidence === 'HIGH') reasons.push('Strong historical reliability');
                if (congestion.score > 80) reasons.push('Low queue congestion');
                if (specs.is_rush && slaScore > 90) reasons.push('High rush fulfillment capability');

                return {
                    nodeId: c.nodeId,
                    machineId: c.machineId,
                    technicalScore: c.technicalScore,
                    economicScore: Math.round(economicScore),
                    reliabilityScore: Math.round(reliability.score),
                    congestionScore: Math.round(congestion.score),
                    slaScore: Math.round(slaScore),
                    finalScore: Math.round(finalScore),
                    confidence: reliability.confidence,
                    estimatedCost: c.estimatedCost,
                    estimatedMargin: 20, // Mock for now, would derive from price - cost
                    estimatedProductionDays: specs.is_rush ? 2 : 5,
                    reasons
                };
            }));

            // 7. Sort by final score descending
            return {
                ok: true,
                recommendations: processed.sort((a, b) => b.finalScore - a.finalScore)
            };

        } catch (err) {
            logger.error({ event: 'recommendation_failed', error: err.message });
            throw err;
        }
    }
}

module.exports = new DispatchRecommendationService();
