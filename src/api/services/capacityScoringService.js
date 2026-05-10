/**
 * src/api/services/capacityScoringService.js
 * 
 * Calculates industrial congestion scores based on active load and queue depth.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('capacity-scoring');

class CapacityScoringService {
    /**
     * Calculates a congestion score (0-100, where 100 is empty/idle).
     */
    async getScore(printerId) {
        try {
            const rows = await db.query('SELECT * FROM printer_capacity_state WHERE printer_id = ?', [printerId]);
            
            if (rows.length === 0) {
                // If no capacity state recorded, we check if node is online
                const [node] = await db.query('SELECT status FROM print_nodes WHERE id = ?', [printerId]);
                if (node && node.status === 'ONLINE') {
                    return { score: 90, confidence: 'MEDIUM', reason: 'ASSUMED_AVAILABLE' };
                }
                return { score: 0, confidence: 'LOW', reason: 'NO_CAPACITY_DATA' };
            }

            const state = rows[0];

            if (state.maintenance_mode) {
                return { score: 0, confidence: 'HIGH', reason: 'MAINTENANCE_MODE' };
            }

            // Normalization: utilization 0% -> score 100, utilization 100% -> score 0
            let score = 100 - parseFloat(state.utilization_percent || 0);
            
            // Adjust for queued jobs
            if (state.queued_jobs > 10) {
                score -= Math.min(score, state.queued_jobs * 2);
            }

            return {
                score: Math.max(0, score),
                confidence: 'HIGH',
                utilization: state.utilization_percent,
                activeJobs: state.active_jobs,
                queuedJobs: state.queued_jobs
            };
        } catch (err) {
            logger.error({ event: 'scoring_failed', printerId, error: err.message });
            return { score: 0, confidence: 'FAILED', error: err.message };
        }
    }
}

module.exports = new CapacityScoringService();
