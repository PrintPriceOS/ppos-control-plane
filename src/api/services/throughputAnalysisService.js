/**
 * src/api/services/throughputAnalysisService.js
 * 
 * Analyzes industrial throughput degradation and sudden collapse patterns.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('throughput-analysis');

class ThroughputAnalysisService {
    /**
     * Calculates current throughput for a machine (jobs/hour).
     */
    async calculateCurrentThroughput(machineId) {
        const [row] = await db.query(`
            SELECT COUNT(*) as count 
            FROM manufacturing_dispatches 
            WHERE machine_id = ? 
            AND status = 'DELIVERED' 
            AND updated_at >= NOW() - INTERVAL 1 HOUR
        `, [machineId]);
        
        return row.count || 0;
    }

    /**
     * Detects sudden throughput collapse.
     */
    async detectThroughputAnomaly(machineId, baseline) {
        const current = await this.calculateCurrentThroughput(machineId);
        
        if (baseline > 0 && current < (baseline * 0.5)) {
            logger.warn({ 
                event: 'throughput_collapse', 
                machineId, 
                current, 
                baseline, 
                drop: `${Math.round((1 - current/baseline) * 100)}%` 
            });
            return {
                anomaly: true,
                score: 40,
                factor: 'THROUGHPUT_COLLAPSE',
                details: { current, baseline }
            };
        }
        
        return { anomaly: false, score: 0 };
    }
}

module.exports = new ThroughputAnalysisService();
