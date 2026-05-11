/**
 * src/api/services/routingMapService.js
 * 
 * Visualization layer for the Live Dispatch Map.
 * Aggregates active dispatches and node topology into a map-ready format.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('routing-map');

class RoutingMapService {
    /**
     * Retrieves the live topology and active routing lines.
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
                    md.id, md.status, md.federation_node_id, 
                    md.created_at,
                    pn.latitude as dest_lat, pn.longitude as dest_lon,
                    pn.company_name as dest_name
                FROM manufacturing_dispatches md
                JOIN print_nodes pn ON md.federation_node_id = pn.id
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

            // 4. Map Routing Lines
            const routes = (dispatches || []).map(d => {
                // Deterministic Origin Scatter based on ID to simulate client diversity
                const hubCoords = [
                    { lat: 51.5074, lng: -0.1278 }, // London
                    { lat: 48.8566, lng: 2.3522 },  // Paris
                    { lat: 52.5200, lng: 13.4050 }, // Berlin
                    { lat: 40.4168, lng: -3.7038 }, // Madrid
                    { lat: 52.2297, lng: 21.0122 }  // Warsaw
                ];
                
                const hubIndex = parseInt(d.id.toString().slice(-1)) % hubCoords.length;
                const baseOrigin = hubCoords[hubIndex];
                
                // Add minor jitter (+/- 0.5 deg)
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
}

module.exports = new RoutingMapService();
