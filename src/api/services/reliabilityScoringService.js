/**
 * src/api/services/reliabilityScoringService.js
 * 
 * Calculates industrial reliability scores based on historical job performance.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('reliability-scoring');

class ReliabilityScoringService {
    /**
     * Get reliability metrics for a specific printer.
     */
    async getScore(printerId) {
        try {
            const rows = await db.query('SELECT * FROM printer_reliability_metrics WHERE printer_id = ?', [printerId]);
            
            if (rows.length === 0) {
                return {
                    score: 50, // Default neutral score
                    confidence: 'LOW',
                    reason: 'NO_HISTORICAL_DATA',
                    metrics: null
                };
            }

            const metrics = rows[0];
            const totalJobs = metrics.completed_jobs + metrics.failed_jobs;

            if (totalJobs < 5) {
                return {
                    score: parseFloat(metrics.reliability_score) || 50,
                    confidence: 'LOW',
                    reason: 'INSUFFICIENT_DATA_SAMPLES',
                    metrics
                };
            }

            return {
                score: parseFloat(metrics.reliability_score),
                confidence: totalJobs > 50 ? 'HIGH' : 'MEDIUM',
                metrics
            };
        } catch (err) {
            logger.error({ event: 'scoring_failed', printerId, error: err.message });
            return { score: 0, confidence: 'FAILED', error: err.message };
        }
    }

    /**
     * Update reliability metrics based on a new job outcome.
     * (Called by future automated job monitoring)
     */
    async recordOutcome(printerId, success, turnaroundHours = null) {
        // Implementation for future autonomy phases
    }
}

module.exports = new ReliabilityScoringService();
