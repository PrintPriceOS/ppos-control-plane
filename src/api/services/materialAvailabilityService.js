/**
 * src/api/services/materialAvailabilityService.js
 * 
 * Tracks, reserves, releases, and forecasts industrial material inventory state (paper, ink, consumables).
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('material-service');

class MaterialAvailabilityService {
    /**
     * Retrieves all materials across the federation.
     */
    async getAllMaterials() {
        try {
            let columns = [];
            try {
                columns = await db.query("SHOW COLUMNS FROM predictive_material_inventory");
            } catch (err) {
                return {
                    ok: true,
                    materials: [],
                    data: [],
                    source_status: "MATERIAL_INVENTORY_UNAVAILABLE"
                };
            }

            if (!columns || columns.length === 0) {
                return {
                    ok: true,
                    materials: [],
                    data: [],
                    source_status: "MATERIAL_INVENTORY_UNAVAILABLE"
                };
            }

            const colNames = columns.map(c => c.Field);
            let orderBy = "id DESC";
            if (colNames.includes('created_at')) {
                orderBy = "created_at DESC";
            } else if (colNames.includes('material_name')) {
                orderBy = "material_name ASC";
            }

            const rows = await db.query(`SELECT * FROM predictive_material_inventory ORDER BY ${orderBy}`);
            return rows;
        } catch (e) {
            logger.warn({ event: 'get_all_materials_schema_drift', error: e.message });
            return {
                ok: true,
                materials: [],
                data: [],
                source_status: "MATERIAL_INVENTORY_UNAVAILABLE"
            };
        }
    }

    /**
     * Retrieves a single material by ID.
     */
    async getMaterialById(id) {
        try {
            const rows = await db.query("SELECT * FROM predictive_material_inventory WHERE id = ?", [id]);
            return rows[0] || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Retrieves current inventory for a specific node.
     */
    async getInventory(nodeId) {
        try {
            return await db.query(
                "SELECT * FROM predictive_material_inventory WHERE node_id = ?",
                [nodeId]
            );
        } catch (e) {
            return [];
        }
    }

    /**
     * Forecasts material depletion based on active dispatches and real package specs.
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
            let projectedUsage = 0;
            for (const d of dispatches) {
                const metadata = typeof d.metadata_json === 'string' ? JSON.parse(d.metadata_json) : (d.metadata_json || {});
                const specs = metadata.specs || metadata;
                
                // Real matching logic based on package specs paper type or precise ID matching
                const requestPaper = specs.paper || specs.material_name;
                if (mat.material_type === 'PAPER' && requestPaper && requestPaper.toLowerCase() === mat.material_name.toLowerCase()) {
                    projectedUsage += (Number(specs.copies || specs.units || 1));
                } else if (specs.material_id === mat.id) {
                    projectedUsage += (Number(specs.units || 1));
                }
            }

            const available = mat.current_stock_units - mat.reserved_stock_units;
            
            // Derive/Update Shortage Risk dynamically
            let risk = 'NONE';
            let status = mat.operational_status;
            if (available < projectedUsage) {
                risk = 'SHORTAGE_RISK';
                status = 'SHORTAGE_RISK';
                logger.warn({ 
                    event: 'predictive_material_shortage', 
                    nodeId, 
                    material: mat.material_name, 
                    available, 
                    needed: projectedUsage 
                });
                shortages.push({
                    material_id: mat.id,
                    material: mat.material_name,
                    shortage: projectedUsage - available,
                    criticality: 'HIGH'
                });
            } else if (available < 1000) {
                risk = 'LOW_STOCK';
                status = available <= 0 ? 'UNAVAILABLE' : 'LOW_STOCK';
            } else {
                risk = 'NONE';
                status = 'AVAILABLE';
            }

            // Save forecast updates back if mutated
            if (mat.shortage_risk !== risk || mat.operational_status !== status) {
                await db.query(
                    "UPDATE predictive_material_inventory SET shortage_risk = ?, operational_status = ? WHERE id = ?",
                    [risk, status, mat.id]
                );
            }
        }

        return shortages;
    }

    /**
     * Reserves materials for a new dispatch. Fails loud if inventory is insufficient.
     */
    async reserveMaterials(dispatchId, nodeId, specs) {
        logger.info({ event: 'material_reservation_request', dispatchId, nodeId, specs });

        const materialId = specs.material_id;
        const paperName = specs.paper || specs.material_name;
        const unitsToReserve = Number(specs.units || specs.copies || 500);

        let mat = null;
        if (materialId) {
            mat = await this.getMaterialById(materialId);
        } else if (paperName) {
            const rows = await db.query(
                "SELECT * FROM predictive_material_inventory WHERE node_id = ? AND LOWER(material_name) = LOWER(?) LIMIT 1",
                [nodeId, paperName]
            );
            mat = rows[0] || null;
        }

        if (!mat) {
            throw new Error(`Material specification [${materialId || paperName || 'unknown'}] not found in node [${nodeId}] catalog.`);
        }

        const available = mat.current_stock_units - mat.reserved_stock_units;
        if (available < unitsToReserve) {
            throw new Error(`Insufficient material inventory. Requested: ${unitsToReserve}, Available: ${available} for material [${mat.material_name}].`);
        }

        const newReserved = mat.reserved_stock_units + unitsToReserve;
        let newStatus = mat.operational_status;
        let newRisk = mat.shortage_risk;

        if (mat.current_stock_units - newReserved <= 0) {
            newStatus = 'UNAVAILABLE';
            newRisk = 'SHORTAGE_RISK';
        } else if (mat.current_stock_units - newReserved < 1000) {
            newStatus = 'LOW_STOCK';
            newRisk = 'LOW_STOCK';
        }

        await db.query(
            "UPDATE predictive_material_inventory SET reserved_stock_units = ?, operational_status = ?, shortage_risk = ? WHERE id = ?",
            [newReserved, newStatus, newRisk, mat.id]
        );

        logger.info({ event: 'material_reserved_successfully', materialId: mat.id, unitsReserved: unitsToReserve, newReserved });
        return { reserved: true, material_id: mat.id, units: unitsToReserve };
    }

    /**
     * Releases previously reserved materials.
     */
    async releaseMaterials(dispatchId, nodeId, specs) {
        logger.info({ event: 'material_release_request', dispatchId, nodeId, specs });

        const materialId = specs.material_id;
        const paperName = specs.paper || specs.material_name;
        const unitsToRelease = Number(specs.units || specs.copies || 500);

        let mat = null;
        if (materialId) {
            mat = await this.getMaterialById(materialId);
        } else if (paperName) {
            const rows = await db.query(
                "SELECT * FROM predictive_material_inventory WHERE node_id = ? AND LOWER(material_name) = LOWER(?) LIMIT 1",
                [nodeId, paperName]
            );
            mat = rows[0] || null;
        }

        if (!mat) {
            logger.warn({ event: 'material_release_skipped', reason: 'Material not found', specs });
            return { released: false, reason: 'Material not found' };
        }

        const newReserved = Math.max(0, mat.reserved_stock_units - unitsToRelease);
        let newStatus = 'AVAILABLE';
        let newRisk = 'NONE';

        const available = mat.current_stock_units - newReserved;
        if (available <= 0) {
            newStatus = 'UNAVAILABLE';
            newRisk = 'SHORTAGE_RISK';
        } else if (available < 1000) {
            newStatus = 'LOW_STOCK';
            newRisk = 'LOW_STOCK';
        }

        await db.query(
            "UPDATE predictive_material_inventory SET reserved_stock_units = ?, operational_status = ?, shortage_risk = ? WHERE id = ?",
            [newReserved, newStatus, newRisk, mat.id]
        );

        logger.info({ event: 'material_released_successfully', materialId: mat.id, unitsReleased: unitsToRelease, newReserved });
        return { released: true, material_id: mat.id, units: unitsToRelease };
    }
}

module.exports = new MaterialAvailabilityService();
