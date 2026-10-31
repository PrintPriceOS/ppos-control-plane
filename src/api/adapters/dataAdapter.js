/**
 * Data Adapter for Control Plane (V2 - REAL PERSISTENCE)
 * Goal: Replace monolith direct DB access with real MySQL queries.
 */
const mysqlClient = require('../services/mysqlClient');
const logger = require('../services/logger').child('data-adapter');

const dataAdapter = {
    /**
     * Replacement for db.query() - Returns { rows: [] } for compatibility with admin.js
     */
    query: async (sql, params = []) => {
        try {
            const rows = await mysqlClient.query(sql, params);
            // MySQL2 returns an array for rows. We wrap it for the Control Plane's expectation.
            return { rows: Array.isArray(rows) ? rows : [rows] };
        } catch (err) {
            logger.error({
                event: 'query_failed',
                message: `SQL Query failure: ${sql.substring(0, 100)}...`,
                metadata: { error: err.message }
            });
            throw err; // Propagate to route handler
        }
    },

    /**
     * Phase 10: Real Overview Metrics
     */
    getOverviewMetrics: async (range = '24h') => {
        const intervalMap = { '24h': '1 DAY', '7d': '7 DAY', '30d': '30 DAY' };
        const interval = intervalMap[range] || '1 DAY';

        const sql = `
            SELECT 
                COUNT(*) as totalJobs,
                (SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0)) * 100 as successRate,
                AVG(processing_ms) as avgLatencyMs,
                SUM(value_generated) as totalValueGenerated,
                SUM(hours_saved) as totalHoursSaved
            FROM metrics
            WHERE created_at >= NOW() - INTERVAL ${interval}
        `;
        
        const { rows } = await dataAdapter.query(sql);
        const raw = rows[0] || {};

        // Data Classification Layer (Phase 10 Hardening)
        return {
            totalJobs: { value: raw.totalJobs || 0, type: 'SOURCE_OF_TRUTH', source: 'MySQL:metrics' },
            successRate: { value: raw.successRate || 0, type: 'DERIVED', formula: 'success/total' },
            avgLatencyMs: { value: Math.round(raw.avgLatencyMs || 0), type: 'DERIVED', source: 'MySQL:metrics' },
            totalValueGenerated: { value: raw.totalValueGenerated || 0, type: 'ESTIMATED', source: 'PricingModel-V1' },
            totalHoursSaved: { value: raw.totalHoursSaved || 0, type: 'ESTIMATED', source: 'EfficiencyModel-V2' },
            deltaImprovementRate: { value: 0, type: 'ESTIMATED', status: 'PARTIAL' } // Placeholder for actual delta logic
        };
    },
    
    getMetrics: async function(range) { return this.getOverviewMetrics(range); },

    /**
     * Real Tenant Fetching
     */
    getTenants: async () => {
        const { rows } = await dataAdapter.query('SELECT * FROM tenants WHERE status = "ACTIVE"');
        return rows;
    },

    /**
     * Real Queue Stats (Connecting to BullMQ via queueOperator)
     */
    getQueueStats: async () => {
        try {
            const queueOperator = require('./queueOperator');
            const stats = await queueOperator.getAdminStats();
            const q = stats.queues[0] || {};
            return {
                state: 'LIVE',
                counts: {
                    waiting: q.counts?.waiting || 0,
                    active: q.counts?.active || 0,
                    completed: q.counts?.completed || 0,
                    failed: q.counts?.failed || 0,
                    delayed: q.counts?.delayed || 0
                }
            };
        } catch (err) {
            logger.warn({
                event: 'queue_telemetry_failure',
                message: 'Failed to fetch real queue stats, returning degraded state',
                metadata: { error: err.message }
            });
            return { 
                state: 'DEGRADED', 
                reason: 'BullMQ Connectivity Failure',
                counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 } 
            };
        }
    }
};

module.exports = dataAdapter;
