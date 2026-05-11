/**
 * src/api/services/FederationTopologyService.js
 * 
 * Unified service for Federation Map, Heatmap, and Regional Analysis.
 * Consolidates routingMapService and routingHeatmapService logic.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('federation-topology');

class FederationTopologyService {
    /**
     * Retrieves the complete federation map state.
     */
    async getMapState() {
        try {
            // 1. Get All Active Industrial Nodes with Coordinates
            const nodes = await db.query(`
                SELECT 
                    id, company_name, region, status, 
                    latitude, longitude, capacity_utilization_pct,
                    uptime_score
                FROM print_nodes
                WHERE status IN ('ONLINE', 'DEGRADED', 'OFFLINE')
            `);

            // 2. Get Active Dispatches with Origin/Destination
            const dispatches = await db.query(`
                SELECT 
                    md.id, md.status, md.print_node_id as node_id, 
                    md.created_at,
                    pn.latitude as dest_lat, pn.longitude as dest_lon,
                    pn.company_name as dest_name
                FROM manufacturing_dispatches md
                JOIN print_nodes pn ON md.print_node_id = pn.id
                WHERE md.status IN ('ALLOCATED', 'IN_PRODUCTION', 'SHIPPED')
                AND md.created_at > DATE_SUB(NOW(), INTERVAL 12 HOUR)
            `);

            // 3. Map Nodes to DTO
            const mapNodes = (nodes || []).map(n => ({
                id: n.id,
                name: n.company_name,
                region: n.region,
                lat: parseFloat(n.latitude),
                lng: parseFloat(n.longitude),
                status: n.status,
                utilization: n.capacity_utilization_pct,
                is_active: n.status === 'ONLINE'
            }));

            // 4. Map Routing Lines (with deterministic jittered origin)
            const routes = (dispatches || []).map(d => {
                const hubCoords = [
                    { lat: 51.5074, lng: -0.1278 }, // London
                    { lat: 48.8566, lng: 2.3522 },  // Paris
                    { lat: 52.5200, lng: 13.4050 }, // Berlin
                    { lat: 40.4168, lng: -3.7038 }, // Madrid
                    { lat: 52.2297, lng: 21.0122 }  // Warsaw
                ];
                
                const hubIndex = parseInt(d.id.toString().slice(-1)) % hubCoords.length;
                const baseOrigin = hubCoords[hubIndex];
                
                const jitterLat = (parseInt(d.id.toString().slice(-2, -1)) / 10) - 0.5;
                const jitterLng = (parseInt(d.id.toString().slice(-3, -2)) / 10) - 0.5;

                return {
                    id: d.id,
                    status: d.status,
                    origin: { 
                        lat: baseOrigin.lat + jitterLat, 
                        lng: baseOrigin.lng + jitterLng 
                    },
                    destination: { lat: parseFloat(d.dest_lat), lng: parseFloat(d.dest_lon) },
                    intensity: d.status === 'IN_PRODUCTION' ? 1.0 : 0.5,
                    age_minutes: Math.round((new Date() - new Date(d.created_at)) / 60000)
                };
            });

            return {
                timestamp: new Date().toISOString(),
                nodes: mapNodes,
                routes: routes,
                summary: {
                    total_active_nodes: mapNodes.filter(n => n.is_active).length,
                    active_dispatches: routes.length
                }
            };

        } catch (err) {
            logger.error({ event: 'map_state_fetch_failed', error: err.message });
            throw err;
        }
    }

    /**
     * Calculates regional saturation intensity.
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
            'eu-west': { lat: 53.3498, lng: -6.2603 },
            'eu-north': { lat: 59.3293, lng: 18.0686 },
            'eu-central': { lat: 50.1109, lng: 8.6821 },
            'eu-south': { lat: 40.4168, lng: -3.7038 },
            'uk-ireland': { lat: 51.5074, lng: -0.1278 }
        };
        return centers[region?.toLowerCase()] || { lat: 50, lng: 10 };
    }
}

module.exports = new FederationTopologyService();
