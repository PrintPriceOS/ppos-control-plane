/**
 * src/api/services/routingHeatmapService.js
 * 
 * Aggregates regional pressure and saturation data for industrial visualization.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('routing-heatmap');

class RoutingHeatmapService {
    /**
     * Calculates saturation intensity per region.
     */
    async getRegionalHeatmap() {
        try {
            const regions = await db.query(`
                SELECT 
                    region, 
                    COUNT(*) as node_count,
                    AVG(capacity_utilization_pct) as avg_utilization,
                    SUM(active_jobs) as total_jobs,
                    SUM(queue_depth) as total_backlog
                FROM print_nodes
                WHERE status != 'OFFLINE'
                GROUP BY region
            `);

            return (regions || []).map(r => {
                const util = parseFloat(r.avg_utilization || 0);
                const pressure = (util * 0.7) + (Math.min(100, (r.total_backlog / 10)) * 0.3);
                
                return {
                    region: r.region,
                    node_count: r.node_count,
                    utilization: util.toFixed(2),
                    pressure: pressure.toFixed(2),
                    status: pressure > 90 ? 'SATURATED' : pressure > 70 ? 'HIGH_PRESSURE' : 'HEALTHY',
                    center: this._getRegionCenter(r.region)
                };
            });
        } catch (err) {
            logger.error({ event: 'heatmap_generation_failed', error: err.message });
            throw err;
        }
    }

    _getRegionCenter(region) {
        const centers = {
            'eu-west': { lat: 53.3498, lng: -6.2603 }, // Dublin
            'eu-north': { lat: 59.3293, lng: 18.0686 }, // Stockholm
            'eu-central': { lat: 50.1109, lng: 8.6821 }, // Frankfurt
            'eu-south': { lat: 40.4168, lng: -3.7038 }, // Madrid
            'uk-ireland': { lat: 51.5074, lng: -0.1278 } // London
        };
        return centers[region?.toLowerCase()] || { lat: 50, lng: 10 };
    }
}

module.exports = new RoutingHeatmapService();
