/**
 * Data Adapter for Control Plane
 * Goal: Replace monolith direct DB access with mocked/standardized data points.
 */

const dataAdapter = {
    /**
     * Replacement for db.query()
     */
    query: async (sql, params = []) => {
        console.log(`[DATA-ADAPTER] Executing: ${sql.substring(0, 50)}...`);
        
        // Return a default row for aggregate queries to prevent destructuring errors
        if (sql.toLowerCase().includes('select count') || sql.toLowerCase().includes('sum(')) {
            let backlog = 0;
            try {
                // Phase 7.4: Inject real queue backlog into metrics queries
                const stats = await require('./queueOperator').getAdminStats();
                backlog = stats.queues[0]?.size || 0;
            } catch (e) {}

            return { rows: [{ 
                total_jobs: 1250, success_rate: 98, avg_latency_ms: 450, 
                improvement_rate: 85, backlog: backlog, oldest_age_seconds: 0 
            }] };
        }
        
        return { rows: [] };
    },

    getOverviewMetrics: async (range) => {
        try {
            const queueOperator = require('./queueOperator');
            const stats = await queueOperator.getAdminStats();
            const queue = stats.queues[0] || {};

            return {
                totalJobs: 1250, // Mocked total history
                successRate: 98.4,
                avgLatencyMs: 450,
                maxLatencyMs: 1200,
                totalValueGenerated: 45000,
                totalHoursSaved: 180.5,
                avgRiskBefore: 75,
                avgRiskAfter: 12,
                queueBacklog: queue.size || 0, // REAL DATA
                deltaImprovementRate: 85.0
            };
        } catch (err) {
            console.warn('[DATA-ADAPTER] Failed to fetch real metrics, returning mock:', err.message);
            return {
                totalJobs: 1250,
                successRate: 0,
                avgLatencyMs: 0,
                queueBacklog: 0,
                deltaImprovementRate: 0
            };
        }
    },
    
    // Alias for Phase 7.4 compatibility
    getMetrics: async function(range) { return this.getOverviewMetrics(range); },

    getTenants: async () => {
        return [
            { id: 'tenant_mock_1', name: 'Mock Enterprise Print', status: 'ACTIVE', plan: 'ENTERPRISE' },
            { id: 'tenant_mock_2', name: 'Standard Print Shop', status: 'ACTIVE', plan: 'PRO' }
        ];
    },

    getQueueStats: async () => {
        return {
            waiting: 2,
            active: 1,
            completed: 1500,
            failed: 4,
            delayed: 0
        };
    }
};

module.exports = dataAdapter;
