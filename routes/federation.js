/**
 * PrintPrice OS — Federation Routes
 */
const FederatedHealthAggregator = require('../services/FederatedHealthAggregator');

// Mock region configuration
const REGIONS = [
    { id: 'eu-west-1', endpoint: process.env.PPOS_EU_SERVICE_URL || 'http://localhost:3000' },
    { id: 'us-east-1', endpoint: process.env.PPOS_US_SERVICE_URL || 'http://localhost:3001' }
];

const aggregator = new FederatedHealthAggregator(REGIONS);

async function federationRoutes(fastify, options) {
    /**
     * GET /federation/health
     * Aggregated view of regional health summary.
     */
    fastify.get('/health', async (request, reply) => {
        const report = await aggregator.aggregateHealth();
        return report;
    });

    /**
     * GET /federation/regions
     * List registered regions.
     */
    fastify.get('/regions', async () => {
        return REGIONS;
    });
}

module.exports = federationRoutes;
