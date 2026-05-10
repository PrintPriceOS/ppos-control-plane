/**
 * src/api/services/economicOptimizationService.js
 * 
 * Global economic routing and operational cost optimization engine.
 */
const profitability = require('./profitabilityScoringService');
const energy = require('./energyOptimizationService');
const efficiency = require('./industrialEfficiencyService');

class EconomicOptimizationService {
    /**
     * Calculates a global economic score for a dispatch candidate.
     */
    calculateEconomicScore(candidate) {
        const pScore = profitability.calculateProfitabilityScore(candidate.dispatch);
        const eScore = energy.calculateEnergyEfficiency(candidate.utilization, candidate.activeJobs);
        const iScore = efficiency.calculateEfficiency(candidate.stats);
        
        // Balanced operational economy
        const economicScore = (pScore * 0.4) + (eScore * 0.3) + (iScore * 0.3);
        
        return {
            score: Math.round(economicScore),
            breakdown: {
                profitability: pScore,
                energy: eScore,
                industrial: iScore
            }
        };
    }
}

module.exports = new EconomicOptimizationService();
