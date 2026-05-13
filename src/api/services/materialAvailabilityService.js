/**
 * src/api/services/materialAvailabilityService.js
 * 
 * Tracks, reserves, releases, and forecasts industrial material inventory state (paper, ink, consumables).
 * Implements real MES operator workflows: catalog intake, adjustments, consumption, procurement, and auditing.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('material-service');

class MaterialAvailabilityService {
    /**
     * Audit log registration helper
     */
    async logMaterialEvent(inventoryId, eventType, qty, beforeStock, afterStock, jobId, dispatchId, operatorId, reason, metadata) {
        const eventId = 'evt-mat-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        await db.query(`
            INSERT INTO material_inventory_events 
            (id, material_inventory_id, event_type, quantity_units, before_stock, after_stock, job_id, dispatch_id, operator_id, reason, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            eventId, 
            inventoryId, 
            eventType, 
            qty, 
            beforeStock, 
            afterStock, 
            jobId || null, 
            dispatchId || null, 
            operatorId || 'system-operator', 
            reason || '', 
            JSON.stringify(metadata || {})
        ]).catch(err => logger.warn({ event: 'log_material_event_failed', error: err.message }));
    }

    /**
     * Recalculates available units, daily burn rate, forecast, status, and procurement risk dynamically
     */
    async computeStateAndForecast(id) {
        const mat = await this.getMaterialById(id);
        if (!mat) return null;

        const available = mat.current_stock_units - mat.reserved_stock_units;
        const reorderPoint = mat.reorder_point || 5000;
        
        let statusStr = 'STABLE';
        let riskStr = 'NONE';
        let procRisk = 'LOW';

        if (available <= 0) {
            statusStr = 'CRITICAL';
            riskStr = 'SHORTAGE_RISK';
            procRisk = 'CRITICAL';
        } else if (available <= reorderPoint) {
            statusStr = 'AT_RISK';
            riskStr = 'LOW_STOCK';
            procRisk = 'HIGH';
        }

        const burnRate = Number(mat.daily_burn_rate) || 250;
        const actualBurnRate = Math.max(0.01, burnRate);
        const forecastDays = Math.min(365, Math.max(1, Math.round(available / actualBurnRate)));
        const forecastedDate = new Date(Date.now() + forecastDays * 86400000);
        const formattedDateSql = forecastedDate.toISOString().slice(0, 19).replace('T', ' ');

        await db.query(`
            UPDATE predictive_material_inventory
            SET available_units = ?, status = ?, operational_status = ?, shortage_risk = ?, procurement_risk = ?, depletion_forecast_days = ?, forecasted_depletion_date = ?
            WHERE id = ?
        `, [available, statusStr, statusStr, riskStr, procRisk, forecastDays, formattedDateSql, id]).catch(() => {});

        return await this.getMaterialById(id);
    }

    /**
     * Creates a new material in the catalog and establishes initial operational inventory scope.
     */
    async createMaterial(payload, tenantId, printhouseId) {
        const id = 'mat-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        const matName = payload.material_name || payload.name || 'Unnamed Material';
        const matType = payload.material_type || payload.type || 'PAPER';
        const gsm = payload.gsm || payload.paper_gsm || null;
        const finish = payload.finish_type || payload.finish || 'UNCOATED';
        const supplier = payload.supplier_name || payload.supplier || 'Generic Supplier';
        const cost = payload.cost_per_unit || payload.cost || 0.05;
        const initialStock = Number(payload.initial_stock || payload.current_stock_units || payload.stock || 0);
        const reorderPoint = Number(payload.reorder_point || 5000);
        const leadDays = Number(payload.replenishment_lead_days || 7);
        const nodeId = payload.node_id || printhouseId || 'node-alpha-1';
        const tId = tenantId || 'ppos-production';

        // Insert into materials_catalog
        await db.query(`
            INSERT INTO materials_catalog
            (id, tenant_id, printhouse_id, material_name, material_type, substrate_class, gsm, sheet_format, finish_type, supplier_name, cost_per_unit, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id, 
            tId, 
            printhouseId || null, 
            matName, 
            matType, 
            payload.substrate_class || 'STANDARD', 
            gsm, 
            payload.sheet_format || 'SRA3', 
            finish, 
            supplier, 
            cost, 
            JSON.stringify(payload.metadata || {})
        ]).catch(() => {});

        // Insert into predictive_material_inventory
        const available = initialStock;
        let statusStr = 'STABLE';
        if (available <= 0) statusStr = 'CRITICAL';
        else if (available <= reorderPoint) statusStr = 'AT_RISK';

        const depDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 19).replace('T', ' ');

        await db.query(`
            INSERT INTO predictive_material_inventory
            (id, node_id, material_catalog_id, material_name, material_type, paper_gsm, finish, current_stock_units, reserved_stock_units, available_units, reorder_point, replenishment_lead_days, shortage_risk, depletion_forecast_days, operational_status, status, daily_burn_rate, forecasted_depletion_date, procurement_risk, supplier_name, cost_per_unit, tenant_id, printhouse_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 30, ?, ?, 250.00, ?, ?, ?, ?, ?, ?)
        `, [
            id, 
            nodeId, 
            id, 
            matName, 
            matType, 
            gsm, 
            finish, 
            initialStock, 
            available, 
            reorderPoint, 
            leadDays, 
            statusStr === 'STABLE' ? 'NONE' : 'SHORTAGE_RISK', 
            statusStr, 
            statusStr, 
            depDate, 
            'LOW', 
            supplier, 
            cost, 
            tId, 
            printhouseId || null
        ]);

        if (initialStock > 0) {
            await this.logMaterialEvent(id, 'INTAKE', initialStock, 0, initialStock, null, null, payload.operator_id, 'Initial Stock Registration', payload);
        }

        return await this.computeStateAndForecast(id);
    }

    /**
     * Intake additional stock units for an existing material.
     */
    async intakeStock(id, quantity, reason, supplierBatch, expectedUse, operatorId) {
        const mat = await this.getMaterialById(id);
        if (!mat) throw new Error('Material specification not found');

        const qty = Number(quantity);
        if (qty <= 0) throw new Error('Intake quantity must be greater than zero');

        const beforeStock = mat.current_stock_units;
        const afterStock = beforeStock + qty;

        await db.query("UPDATE predictive_material_inventory SET current_stock_units = ? WHERE id = ?", [afterStock, id]);

        await this.logMaterialEvent(id, 'INTAKE', qty, beforeStock, afterStock, null, null, operatorId, reason || 'Warehouse Substrate Intake', { supplierBatch, expectedUse });

        return await this.computeStateAndForecast(id);
    }

    /**
     * Manually adjusts stock quantities with robust auditable trailing notes.
     */
    async adjustStock(id, quantityDelta, reason, operatorNote, operatorId) {
        const mat = await this.getMaterialById(id);
        if (!mat) throw new Error('Material specification not found');

        if (!reason) throw new Error('Audit governance requires a formal reason for physical stock adjustments');

        const delta = Number(quantityDelta);
        const beforeStock = mat.current_stock_units;
        const afterStock = Math.max(0, beforeStock + delta);

        await db.query("UPDATE predictive_material_inventory SET current_stock_units = ? WHERE id = ?", [afterStock, id]);

        await this.logMaterialEvent(id, 'ADJUSTMENT', delta, beforeStock, afterStock, null, null, operatorId, reason, { operatorNote });

        return await this.computeStateAndForecast(id);
    }

    /**
     * Directly reserves stock units for manufacturing workflows.
     */
    async reserveStockUnits(id, jobId, dispatchId, quantity, expiration, operatorId) {
        const mat = await this.getMaterialById(id);
        if (!mat) throw new Error('Material specification not found');

        const qty = Number(quantity);
        const available = mat.current_stock_units - mat.reserved_stock_units;
        if (available < qty) {
            throw new Error(`Insufficient operational stock. Available pool is ${available} units.`);
        }

        const beforeStock = mat.current_stock_units;
        const newReserved = mat.reserved_stock_units + qty;

        await db.query("UPDATE predictive_material_inventory SET reserved_stock_units = ? WHERE id = ?", [newReserved, id]);

        const resId = 'res-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        const expSql = expiration ? new Date(expiration).toISOString().slice(0, 19).replace('T', ' ') : new Date(Date.now() + 86400000).toISOString().slice(0, 19).replace('T', ' ');

        await db.query(`
            INSERT INTO manufacturing_material_reservations
            (id, material_inventory_id, job_id, dispatch_id, reserved_units, reservation_status, expires_at)
            VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)
        `, [resId, id, jobId || null, dispatchId || null, qty, expSql]).catch(() => {});

        await this.logMaterialEvent(id, 'RESERVATION', qty, beforeStock, beforeStock, jobId, dispatchId, operatorId, 'Manufacturing Core Allocation Reserved', { reservationId: resId });

        return await this.computeStateAndForecast(id);
    }

    /**
     * Consumes materials permanently post-production run.
     */
    async consumeStockUnits(id, jobId, quantityConsumed, wasteUnits, reason, operatorId) {
        const mat = await this.getMaterialById(id);
        if (!mat) throw new Error('Material specification not found');

        const qty = Number(quantityConsumed);
        const waste = Number(wasteUnits || 0);
        const totalReduce = qty + waste;

        const beforeStock = mat.current_stock_units;
        const afterStock = Math.max(0, beforeStock - totalReduce);
        const afterReserved = Math.max(0, mat.reserved_stock_units - qty);

        await db.query("UPDATE predictive_material_inventory SET current_stock_units = ?, reserved_stock_units = ? WHERE id = ?", [afterStock, afterReserved, id]);

        if (jobId) {
            await db.query("UPDATE manufacturing_material_reservations SET reservation_status = 'CONSUMED' WHERE material_inventory_id = ? AND job_id = ?", [id, jobId]).catch(() => {});
        }

        await this.logMaterialEvent(id, 'CONSUMPTION', totalReduce, beforeStock, afterStock, jobId, null, operatorId, reason || 'Production Batch Material Depletion', { consumed: qty, waste });

        return await this.computeStateAndForecast(id);
    }

    /**
     * Creates a new supplier restock procurement order.
     */
    async createProcurement(id, supplierName, orderedUnits, expectedDeliveryDate, risk, notes) {
        const mat = await this.getMaterialById(id);
        if (!mat) throw new Error('Material specification not found');

        const procId = 'proc-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        const qty = Number(orderedUnits);
        const expSql = expectedDeliveryDate ? new Date(expectedDeliveryDate).toISOString().slice(0, 19).replace('T', ' ') : new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 19).replace('T', ' ');

        await db.query(`
            INSERT INTO material_procurements
            (id, material_inventory_id, supplier_name, ordered_units, expected_delivery_date, procurement_status, procurement_risk, notes)
            VALUES (?, ?, ?, ?, ?, 'ORDERED', ?, ?)
        `, [procId, id, supplierName || mat.supplier_name, qty, expSql, risk || 'LOW', notes || '']).catch(() => {});

        await db.query("UPDATE predictive_material_inventory SET procurement_risk = ? WHERE id = ?", [risk || 'LOW', id]);

        await this.logMaterialEvent(id, 'RESTOCK_ORDERED', qty, mat.current_stock_units, mat.current_stock_units, null, null, null, 'Procurement Supply Order Placed', { procurementId: procId, supplierName });

        return await this.computeStateAndForecast(id);
    }

    /**
     * Receives and completes a procurement order, automatically incrementing operational inventory stock.
     */
    async receiveProcurement(procurementId, operatorId) {
        let procs = [];
        try {
            procs = await db.query("SELECT * FROM material_procurements WHERE id = ?", [procurementId]);
        } catch (err) {
            throw new Error('Procurements registry database error');
        }
        const proc = procs[0];
        if (!proc) throw new Error('Target procurement entry record not found');

        if (proc.procurement_status === 'RECEIVED') {
            throw new Error('Procurement already recorded as RECEIVED in ledger');
        }

        await db.query("UPDATE material_procurements SET procurement_status = 'RECEIVED' WHERE id = ?", [procurementId]);

        const mat = await this.getMaterialById(proc.material_inventory_id);
        if (mat) {
            const beforeStock = mat.current_stock_units;
            const afterStock = beforeStock + proc.ordered_units;
            await db.query("UPDATE predictive_material_inventory SET current_stock_units = ? WHERE id = ?", [afterStock, mat.id]);

            await this.logMaterialEvent(mat.id, 'RESTOCK_RECEIVED', proc.ordered_units, beforeStock, afterStock, null, null, operatorId, 'Supplier Restock Delivered to Intake Bay', { procurementId });

            await this.computeStateAndForecast(mat.id);
        }

        return { received: true, procurementId };
    }

    /**
     * Retrieves historical lifecycle audit trails for inventory items.
     */
    async getMaterialTimeline(id) {
        try {
            return await db.query("SELECT * FROM material_inventory_events WHERE material_inventory_id = ? ORDER BY created_at DESC", [id]);
        } catch (e) {
            return [];
        }
    }

    /**
     * Retrieves procurement listings for a dedicated item.
     */
    async getMaterialProcurements(id) {
        try {
            return await db.query("SELECT * FROM material_procurements WHERE material_inventory_id = ? ORDER BY created_at DESC", [id]);
        } catch (e) {
            return [];
        }
    }

    /**
     * Retrieves all materials across the federation with scope controls.
     */
    async getAllMaterials(filters = {}) {
        try {
            let columns = [];
            try {
                columns = await db.query("SHOW COLUMNS FROM predictive_material_inventory");
            } catch (err) {
                return { ok: true, materials: [], data: [], source_status: "MATERIAL_INVENTORY_UNAVAILABLE" };
            }

            if (!columns || columns.length === 0) {
                return { ok: true, materials: [], data: [], source_status: "MATERIAL_INVENTORY_UNAVAILABLE" };
            }

            const colNames = columns.map(c => c.Field);
            const isJoinSupported = colNames.includes('material_catalog_id');

            let sql = "";
            if (isJoinSupported) {
                sql = `
                    SELECT 
                        i.*, 
                        c.material_name AS catalog_material_name,
                        c.material_type AS catalog_material_type,
                        c.substrate_class AS catalog_substrate_class,
                        c.gsm AS catalog_gsm,
                        c.sheet_format AS catalog_sheet_format,
                        c.finish_type AS catalog_finish_type,
                        c.supplier_name AS catalog_supplier_name,
                        c.cost_per_unit AS catalog_cost_per_unit
                    FROM predictive_material_inventory i
                    LEFT JOIN materials_catalog c ON i.material_catalog_id = c.id
                `;
            } else {
                sql = "SELECT * FROM predictive_material_inventory";
            }

            let orderBy = isJoinSupported ? "i.id DESC" : "id DESC";
            if (colNames.includes('created_at')) {
                orderBy = isJoinSupported ? "i.created_at DESC" : "created_at DESC";
            } else if (colNames.includes('material_name')) {
                orderBy = isJoinSupported ? "i.material_name ASC" : "material_name ASC";
            }

            sql += ` ORDER BY ${orderBy}`;
            const allRows = await db.query(sql);

            logger.info({
                event: 'materials_service_query_result',
                rowCount: allRows.length,
                firstRow: allRows[0] || null
            });

            const totalInventoryRows = allRows.length;

            // Apply tenant filter
            let afterTenantRows = allRows;
            if (!filters.isSuperAdmin && filters.tenantId && filters.tenantId !== 'ppos-production') {
                afterTenantRows = allRows.filter(r => {
                    const rTenant = r.tenant_id || 'ppos-production';
                    return rTenant === filters.tenantId;
                });
            }
            const rowsAfterTenantFilter = afterTenantRows.length;

            // Apply node filter
            let afterNodeRows = afterTenantRows;
            if (filters.nodeId && filters.nodeId.trim() !== "") {
                const targetNode = filters.nodeId.trim();
                afterNodeRows = afterTenantRows.filter(r => r.node_id === targetNode);
            }
            const rowsAfterNodeFilter = afterNodeRows.length;

            // Log temporal stats requested by user
            logger.info({
                event: 'material_inventory_audit_logging',
                metrics: {
                    total_inventory_rows: totalInventoryRows,
                    rows_after_tenant_filter: rowsAfterTenantFilter,
                    rows_after_node_filter: rowsAfterNodeFilter,
                    rows_returned_to_frontend: rowsAfterNodeFilter
                },
                filters_applied: filters
            });

            return afterNodeRows.map(r => {
                const matName = r.catalog_material_name || r.material_name || 'Unnamed Material';
                const matType = r.catalog_material_type || r.material_type || 'PAPER';
                const printhouseId = r.printhouse_id || r.node_id || null;
                const tenantId = r.tenant_id || 'ppos-production';
                const gsm = r.catalog_gsm || r.paper_gsm || null;
                const finish = r.catalog_finish_type || r.finish || 'UNCOATED';
                const supplier = r.catalog_supplier_name || r.supplier_name || 'Generic Supplier';
                const cost = r.catalog_cost_per_unit || r.cost_per_unit || 0.05;

                const avail = (Number(r.current_stock_units) || 0) - (Number(r.reserved_stock_units) || 0);
                const rop = Number(r.reorder_point) || 5000;
                let computedStatus = r.status || 'STABLE';
                if (!r.status || r.status === 'UNKNOWN' || r.status === 'AVAILABLE') {
                    if (avail <= 0) computedStatus = 'CRITICAL';
                    else if (avail <= rop) computedStatus = 'AT_RISK';
                    else computedStatus = 'STABLE';
                }

                return {
                    ...r,
                    material_name: matName,
                    material_type: matType,
                    printhouse_id: printhouseId,
                    tenant_id: tenantId,
                    paper_gsm: gsm,
                    finish: finish,
                    supplier_name: supplier,
                    cost_per_unit: cost,
                    available_units: avail,
                    status: computedStatus
                };
            });
        } catch (e) {
            logger.warn({ event: 'get_all_materials_schema_drift', error: e.message });
            return { ok: true, materials: [], data: [], source_status: "MATERIAL_INVENTORY_UNAVAILABLE" };
        }
    }

    /**
     * Retrieves a single material by ID.
     */
    async getMaterialById(id) {
        try {
            let columns = [];
            try {
                columns = await db.query("SHOW COLUMNS FROM predictive_material_inventory");
            } catch (err) {}
            const colNames = (columns || []).map(c => c.Field);
            const isJoinSupported = colNames.includes('material_catalog_id');

            let sql = "";
            if (isJoinSupported) {
                sql = `
                    SELECT 
                        i.*, 
                        c.material_name AS catalog_material_name,
                        c.material_type AS catalog_material_type,
                        c.substrate_class AS catalog_substrate_class,
                        c.gsm AS catalog_gsm,
                        c.sheet_format AS catalog_sheet_format,
                        c.finish_type AS catalog_finish_type,
                        c.supplier_name AS catalog_supplier_name,
                        c.cost_per_unit AS catalog_cost_per_unit
                    FROM predictive_material_inventory i
                    LEFT JOIN materials_catalog c ON i.material_catalog_id = c.id
                    WHERE i.id = ?
                `;
            } else {
                sql = "SELECT * FROM predictive_material_inventory WHERE id = ?";
            }

            const rows = await db.query(sql, [id]);
            const r = rows[0];
            if (!r) return null;

            const matName = r.catalog_material_name || r.material_name || 'Unnamed Material';
            const matType = r.catalog_material_type || r.material_type || 'PAPER';
            const printhouseId = r.printhouse_id || r.node_id || null;
            const tenantId = r.tenant_id || 'ppos-production';
            const gsm = r.catalog_gsm || r.paper_gsm || null;
            const finish = r.catalog_finish_type || r.finish || 'UNCOATED';
            const supplier = r.catalog_supplier_name || r.supplier_name || 'Generic Supplier';
            const cost = r.catalog_cost_per_unit || r.cost_per_unit || 0.05;

            const avail = (Number(r.current_stock_units) || 0) - (Number(r.reserved_stock_units) || 0);
            const rop = Number(r.reorder_point) || 5000;
            let computedStatus = r.status || 'STABLE';
            if (!r.status || r.status === 'UNKNOWN' || r.status === 'AVAILABLE') {
                if (avail <= 0) computedStatus = 'CRITICAL';
                else if (avail <= rop) computedStatus = 'AT_RISK';
                else computedStatus = 'STABLE';
            }

            return {
                ...r,
                material_name: matName,
                material_type: matType,
                printhouse_id: printhouseId,
                tenant_id: tenantId,
                paper_gsm: gsm,
                finish: finish,
                supplier_name: supplier,
                cost_per_unit: cost,
                available_units: avail,
                status: computedStatus
            };
        } catch (e) {
            return null;
        }
    }

    /**
     * Retrieves current inventory for a specific node.
     */
    async getInventory(nodeId) {
        const res = await this.getAllMaterials({ nodeId, isSuperAdmin: true });
        return Array.isArray(res) ? res : [];
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
                
                const requestPaper = specs.paper || specs.material_name;
                if (mat.material_type === 'PAPER' && requestPaper && requestPaper.toLowerCase() === mat.material_name.toLowerCase()) {
                    projectedUsage += (Number(specs.copies || specs.units || 1));
                } else if (specs.material_id === mat.id) {
                    projectedUsage += (Number(specs.units || 1));
                }
            }

            const available = mat.current_stock_units - mat.reserved_stock_units;
            
            let baseBurn = Number(mat.daily_burn_rate) || (mat.material_type === 'PAPER' ? 250 : 0.05);
            const actualBurnRate = Math.max(0.01, baseBurn + (projectedUsage / 7));
            const forecastDays = Math.min(365, Math.max(1, Math.round(available / actualBurnRate)));
            const forecastedDate = new Date(Date.now() + forecastDays * 86400000);
            const formattedDateSql = forecastedDate.toISOString().slice(0, 19).replace('T', ' ');

            let risk = 'NONE';
            let statusStr = 'STABLE';
            let procRisk = mat.procurement_risk || 'LOW';

            if (available < projectedUsage) {
                risk = 'SHORTAGE_RISK';
                statusStr = 'CRITICAL';
                procRisk = 'CRITICAL';
                shortages.push({
                    material_id: mat.id,
                    material: mat.material_name,
                    shortage: projectedUsage - available,
                    criticality: 'HIGH'
                });
            } else if (available <= (mat.reorder_point || 5000)) {
                risk = 'LOW_STOCK';
                statusStr = available <= 0 ? 'CRITICAL' : 'AT_RISK';
                procRisk = available <= 0 ? 'CRITICAL' : 'HIGH';
            } else {
                risk = 'NONE';
                statusStr = 'STABLE';
                procRisk = forecastDays < 14 ? 'MEDIUM' : 'LOW';
            }

            await db.query(
                "UPDATE predictive_material_inventory SET available_units = ?, daily_burn_rate = ?, depletion_forecast_days = ?, forecasted_depletion_date = ?, shortage_risk = ?, operational_status = ?, status = ?, procurement_risk = ? WHERE id = ?",
                [available, actualBurnRate.toFixed(2), forecastDays, formattedDateSql, risk, statusStr, statusStr, procRisk, mat.id]
            ).catch(() => {});
        }

        return shortages;
    }

    /**
     * Reserves materials for a new dispatch. Legacy support.
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

        return await this.reserveStockUnits(mat.id, specs.job_id || null, dispatchId, unitsToReserve, null, 'dispatch-orchestration');
    }

    /**
     * Releases previously reserved materials. Legacy support.
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
            return { released: false, reason: 'Material not found' };
        }

        const newReserved = Math.max(0, mat.reserved_stock_units - unitsToRelease);
        await db.query("UPDATE predictive_material_inventory SET reserved_stock_units = ? WHERE id = ?", [newReserved, mat.id]);

        await this.logMaterialEvent(mat.id, 'RELEASE', unitsToRelease, mat.current_stock_units, mat.current_stock_units, specs.job_id || null, dispatchId, 'dispatch-orchestration', 'Released Unused Allocation Pool');

        await this.computeStateAndForecast(mat.id);

        return { released: true, material_id: mat.id, units: unitsToRelease };
    }
}

module.exports = new MaterialAvailabilityService();
