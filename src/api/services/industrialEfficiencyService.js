/**
 * src/api/services/industrialEfficiencyService.js
 * 
 * Computes node-wide throughput and operational efficiency scores.
 */
const logger = require('./logger').child('industrial-efficiency');

class IndustrialEfficiencyService {
    /**
     * Calculates efficiency score based on turnover and reliability.
     */
    calculateEfficiency(stats) {
        if (!stats) return 0;

        const reliability = stats.reliabilityScore || 0;
        const utilization = stats.utilization || 0;
        
        // Efficiency is a balance of high utilization and high reliability
        const score = (reliability * 0.6) + (utilization * 0.4);
        
        return Math.max(0, Math.min(100, score));
    }
}

module.exports = new IndustrialEfficiencyService();
