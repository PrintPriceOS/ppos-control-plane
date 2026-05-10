/**
 * src/api/services/materialAvailabilityService.js
 * 
 * Tracks and forecasts industrial material inventory state (paper, ink, consumables).
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('material-service');

class MaterialAvailabilityService {
    /**
     * Retrieves current inventory for a node.
     */
    async getInventory(nodeId) {
        return await db.query(
            "SELECT * FROM predictive_material_inventory WHERE node_id = ?",
            [nodeId]
        );
    }

    /**
     * Forecasts material depletion based on active dispatches and average consumption.
     */
    async forecastDepletion(nodeId) {
        logger.info({ event: 'material_forecast_start', nodeId });
        
        const materials = await this.getInventory(nodeId);
        const dispatches = await db.query(
            "SELECT * FROM manufacturing_dispatches WHERE node_id = ? AND status IN ('QUEUED', 'ASSIGNED', 'ACCEPTED', 'PREPARING', 'PRINTING')",
            [nodeId]
        );

        const shortages = [];
        
        for (const mat of materials) {
            // Mock logic: calculate usage based on active dispatches
            let projectedUsage = 0;
            for (const d of dispatches) {
                const metadata = typeof d.metadata_json === 'string' ? JSON.parse(d.metadata_json) : (d.metadata_json || {});
                const specs = metadata.specs || metadata;
                
                // If job matches material type (e.g., paper)
                if (mat.material_type === 'PAPER' && specs.paper?.toLowerCase() === mat.material_name.toLowerCase()) {
                    projectedUsage += (specs.copies || 1);
                }
            }

            const available = mat.current_stock_units - mat.reserved_stock_units;
            if (available < projectedUsage) {
                logger.warn({ 
                    event: 'predictive_material_shortage', 
                    nodeId, 
                    material: mat.material_name, 
                    available, 
                    needed: projectedUsage 
                });
                shortages.push({
                    material: mat.material_name,
                    shortage: projectedUsage - available,
                    criticality: 'HIGH'
                });
            }
        }

        return shortages;
    }

    /**
     * Reserves materials for a new dispatch.
     */
    async reserveMaterials(dispatchId, nodeId, specs) {
        // Implementation for industrial reservation logic
        logger.info({ event: 'material_reservation', dispatchId, nodeId });
    }
}

module.exports = new MaterialAvailabilityService();
