/**
 * Data Adapter for Control Plane
 * Goal: Replace monolith direct DB access with mocked/standardized data points.
 */

const dataAdapter = {
    /**
     * Replacement for db.query()
     */
    query: async (sql, params = []) => {
        console.log(`[DATA-ADAPTER-MOCK] Executing: ${sql.substring(0, 50)}...`);
        
        // Return a default row for aggregate queries to prevent destructuring errors
        if (sql.toLowerCase().includes('select count') || sql.toLowerCase().includes('sum(')) {
            return { rows: [{ 
                total_jobs: 0, success_rate: 0, avg_latency_ms: 0, 
                improvement_rate: 0, backlog: 0, oldest_age_seconds: 0 
            }] };
        }
        
        return { rows: [] };
    },

    getOverviewMetrics: async (range) => {
        return {
            totalJobs: 1250,
            successRate: 98.4,
            avgLatencyMs: 450,
            maxLatencyMs: 1200,
            totalValueGenerated: 45000,
            totalHoursSaved: 180.5,
            avgRiskBefore: 75,
            avgRiskAfter: 12,
            queueBacklog: 5,
            deltaImprovementRate: 85.0
        };
    },

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
