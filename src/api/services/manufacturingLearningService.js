/**
 * src/api/services/manufacturingLearningService.js
 * 
 * Analyzes historical production performance to update machine and node reliability scores.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('learning-loop');

class ManufacturingLearningService {
    /**
     * Recomputes reliability metrics based on completed industrial cycles.
     */
    async recomputeIntelligence() {
        logger.info({ event: 'learning_cycle_start' });
        
        const nodes = await db.query("SELECT id FROM print_nodes");
        let processed = 0;

        for (const node of nodes) {
            try {
                // 1. Aggregate Historical Dispatch Success
                const [stats] = await db.query(`
                    SELECT 
                        COUNT(*) as total_dispatches,
                        SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as successful_dispatches,
                        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_dispatches,
                        SUM(CASE WHEN status = 'AUTO_REROUTED' THEN 1 ELSE 0 END) as rerouted_dispatches,
                        AVG(TIMESTAMPDIFF(HOUR, created_at, updated_at)) as avg_hours
                    FROM manufacturing_dispatches
                    WHERE node_id = ? AND status IN ('DELIVERED', 'FAILED', 'AUTO_REROUTED')
                `, [node.id]);

                if (!stats || stats.total_dispatches === 0) continue;

                // 2. Compute Industrial Reliability Score
                const baseSuccess = stats.successful_dispatches / stats.total_dispatches;
                const reroutePenalty = (stats.rerouted_dispatches / stats.total_dispatches) * 0.5;
                const reliabilityScore = Math.max(0, (baseSuccess - reroutePenalty) * 100);

                // 3. Persist into metrics table
                await db.query(`
                    INSERT INTO printer_reliability_metrics (
                        printer_id, 
                        completed_jobs, 
                        failed_jobs, 
                        avg_turnaround_hours, 
                        reliability_score
                    ) VALUES (?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        completed_jobs = VALUES(completed_jobs),
                        failed_jobs = VALUES(failed_jobs),
                        avg_turnaround_hours = VALUES(avg_turnaround_hours),
                        reliability_score = VALUES(reliability_score)
                `, [
                    node.id, 
                    stats.successful_dispatches, 
                    stats.failed_dispatches, 
                    stats.avg_hours || 0, 
                    reliabilityScore
                ]);

                processed++;
            } catch (err) {
                logger.error({ event: 'node_learning_failed', nodeId: node.id, error: err.message });
            }
        }
        
        return { ok: true, nodesProcessed: processed };
    }
}

module.exports = new ManufacturingLearningService();
