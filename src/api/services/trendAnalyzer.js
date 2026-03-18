/**
 * Trend Analyzer for PrintPrice OS Intelligence Layer
 * Phase 10 — Batch B (Predictive Intelligence)
 */

const db = require('./db');

/**
 * Detects trajectory shifts for specific metrics.
 * Uses rolling windows to calculate 'acceleration'.
 */
async function analyzeTrends(entityType, entityId, metric = 'failure_rate') {
    let trend = 'STABLE';
    let confidence = 0.5; // Baseline confidence

    try {
        // We compare two windows:
        // Window A: Last 5 minutes (Recent)
        // Window B: Previous 15 minutes (Baseline)
        
        let query = '';
        if (metric === 'failure_rate') {
            query = `
                SELECT 
                    SUM(CASE WHEN updated_at >= NOW() - INTERVAL 5 MINUTE THEN 1 ELSE 0 END) as recent_fails,
                    COUNT(CASE WHEN updated_at >= NOW() - INTERVAL 5 MINUTE THEN 1 END) as recent_total,
                    SUM(CASE WHEN updated_at < NOW() - INTERVAL 5 MINUTE AND updated_at >= NOW() - INTERVAL 20 MINUTE THEN 1 ELSE 0 END) as baseline_fails,
                    COUNT(CASE WHEN updated_at < NOW() - INTERVAL 5 MINUTE AND updated_at >= NOW() - INTERVAL 20 MINUTE THEN 1 END) as baseline_total
                FROM jobs 
                WHERE tenant_id = ?
            `;
        }

        const { rows: [stats] } = await db.query(query, [entityId]);

        if (stats && stats.recent_total > 0 && stats.baseline_total > 0) {
            const recentRate = stats.recent_fails / stats.recent_total;
            const baselineRate = stats.baseline_fails / stats.baseline_total;

            const delta = recentRate - baselineRate;

            if (delta > 0.2) trend = 'UP_FAST';
            else if (delta > 0.05) trend = 'UP';
            else if (delta < -0.05) trend = 'DOWN';
            
            // Confidence increases with sample size
            confidence = Math.min(1, stats.recent_total / 20);
        }

    } catch (err) {
        console.error(`[TREND-ANALYZER] Error for ${entityId}:`, err);
    }

    return {
        entityType,
        entityId,
        metric,
        trend,
        confidence,
        timestamp: new Date().toISOString()
    };
}

module.exports = {
    analyzeTrends
};
