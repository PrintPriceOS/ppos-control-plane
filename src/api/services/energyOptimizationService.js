/**
 * src/api/services/energyOptimizationService.js
 * 
 * Tracks industrial energy efficiency and machine consumption pressure.
 */
const logger = require('./logger').child('energy-optimization');

class EnergyOptimizationService {
    /**
     * Estimates machine energy efficiency based on utilization and load.
     */
    calculateEnergyEfficiency(utilization, activeJobs) {
        // Optimal energy efficiency is usually at 70-80% utilization
        let score = 100;
        
        if (utilization > 90) score -= 30; // Inefficiency due to thermal/overload
        if (utilization < 20 && activeJobs > 0) score -= 40; // Inefficiency due to idle overhead
        
        return Math.max(0, Math.min(100, score));
    }

    /**
     * Identifies high energy pressure machines.
     */
    isEnergyPressureDetected(utilization) {
        return utilization > 95;
    }
}

module.exports = new EnergyOptimizationService();
