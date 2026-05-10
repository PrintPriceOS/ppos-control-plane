/**
 * src/api/services/profitabilityScoringService.js
 * 
 * Evaluates the profitability and margin-adjusted value of industrial dispatches.
 */
const logger = require('./logger').child('profitability-scoring');

class ProfitabilityScoringService {
    /**
     * Calculates the profitability score for a dispatch.
     */
    calculateProfitabilityScore(dispatch) {
        const margin = dispatch.estimated_margin || 0;
        const cost = dispatch.estimated_cost || 100;
        
        // Base score on margin
        let score = (margin / 50) * 100; // Assume 50% is target high margin
        
        // Penalize for high cost risk
        if (dispatch.status === 'SLA_AT_RISK') score -= 20;
        
        return Math.max(0, Math.min(100, score));
    }

    /**
     * Identifies high-value capacity allocation.
     */
    isStrategicAllocation(dispatch) {
        const score = this.calculateProfitabilityScore(dispatch);
        return score >= 80;
    }
}

module.exports = new ProfitabilityScoringService();
