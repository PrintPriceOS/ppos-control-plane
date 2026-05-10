/**
 * src/api/services/FederationTopologyService.js
 * 
 * Manages the global grid of manufacturing hubs and regional failover.
 * Provides topology awareness for cross-region industrial orchestration.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('federation-topology');

class FederationTopologyService {
    /**
     * Retrieves the current state of the global manufacturing grid.
     */
    async getGlobalGridState() {
        try {
            const hubs = await db.query(`
                SELECT 
                    id, company_name, region, federation_state, 
                    capacity_index, reliability_index, energy_score,
                    last_heartbeat
                FROM federation_factories
                ORDER BY region ASC
            `);

            const nodeDistribution = await db.query(`
                SELECT 
                    region, 
                    COUNT(*) as node_count, 
                    AVG(capacity_utilization_pct) as avg_util,
                    AVG(uptime_score) as avg_uptime
                FROM print_nodes
                GROUP BY region
            `);

            return {
                timestamp: new Date().toISOString(),
                topology_version: '1.0.0-industrial',
                hubs: hubs.map(h => ({
                    ...h,
                    status: h.federation_state,
                    is_active: h.federation_state === 'ACTIVE'
                })),
                regional_health: nodeDistribution.reduce((acc, r) => {
                    const region = r.region || 'UNKNOWN';
                    acc[region] = {
                        node_count: r.node_count,
                        avg_utilization: parseFloat(r.avg_util || 0).toFixed(2),
                        avg_uptime: parseFloat(r.avg_uptime || 0).toFixed(2),
                        load_status: r.avg_util > 90 ? 'CRITICAL' : r.avg_util > 75 ? 'DEGRADED' : 'HEALTHY'
                    };
                    return acc;
                }, {}),
                grid_stability_index: this._calculateStabilityIndex(hubs, nodeDistribution)
            };
        } catch (err) {
            logger.error({ event: 'grid_state_fetch_failed', error: err.message });
            throw err;
        }
    }

    /**
     * Calculates an overall stability index for the manufacturing grid.
     */
    _calculateStabilityIndex(hubs, distribution) {
        if (!hubs.length) return 0;
        
        const activeHubs = hubs.filter(h => h.federation_state === 'ACTIVE').length;
        const hubRatio = activeHubs / hubs.length;
        
        const avgUtil = distribution.reduce((sum, r) => sum + (r.avg_util || 0), 0) / (distribution.length || 1);
        const loadFactor = Math.max(0, (100 - avgUtil) / 100);

        return parseFloat((hubRatio * loadFactor * 100).toFixed(2));
    }

    /**
     * Identifies fallback hubs for a specific region during failover.
     */
    async getFallbackHubs(primaryRegion) {
        return await db.query(`
            SELECT id, company_name, region, capacity_index, reliability_index
            FROM federation_factories
            WHERE region != ? AND federation_state = 'ACTIVE'
            ORDER BY reliability_index DESC, capacity_index DESC
            LIMIT 3
        `, [primaryRegion]);
    }
}

module.exports = new FederationTopologyService();
