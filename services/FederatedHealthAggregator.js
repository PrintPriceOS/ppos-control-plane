/**
 * PrintPrice OS — Federated Health Aggregator
 * 
 * Aggregates health diagnostics from across the regional network.
 */
const axios = require('axios');

class FederatedHealthAggregator {
    constructor(regionConfig) {
        this.regions = regionConfig || []; // Array of { id, endpoint }
    }

    /**
     * Fetch health reports from all known regions.
     */
    async aggregateHealth() {
        const reports = await Promise.all(this.regions.map(async (region) => {
            try {
                // In production, this would call the regional health service endpoint
                const response = await axios.get(`${region.endpoint}/health`, { timeout: 5000 });
                return {
                    region_id: region.id,
                    ...response.data
                };
            } catch (e) {
                return {
                    region_id: region.id,
                    status: 'UNREACHABLE',
                    error: e.message
                };
            }
        }));

        return {
            timestamp: new Date().toISOString(),
            global_status: this.calculateGlobalStatus(reports),
            regions: reports
        };
    }

    calculateGlobalStatus(reports) {
        if (reports.some(r => r.status === 'CRITICAL' || r.status === 'ERROR')) return 'CRITICAL';
        if (reports.some(r => r.status === 'DEGRADED' || r.status === 'UNREACHABLE')) return 'DEGRADED';
        return 'HEALTHY';
    }
}

module.exports = FederatedHealthAggregator;
