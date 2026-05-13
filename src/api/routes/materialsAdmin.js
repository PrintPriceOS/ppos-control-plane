/**
 * src/api/routes/materialsAdmin.js
 * 
 * Canonical backend API routes for Materials & Paper Catalog.
 * Handles inventory retrieval, node matching, reservation locks, and dynamic lifecycle events.
 * Implements real operator workflows for Printhouses without typing raw SQL.
 */
const express = require('express');
const router = express.Router();
const materialService = require('../services/materialAvailabilityService');
const db = require('../services/mysqlClient');
const logger = require('../services/logger').child('materials-route');

// Helper to extract multi-tenant scope from request context
function getScopeContext(req) {
    const isSuper = req.headers?.['x-user-role'] === 'SUPER_ADMIN' || 
                    req.headers?.['x-role'] === 'SUPER_ADMIN' || 
                    req.query?.role === 'SUPER_ADMIN' || 
                    req.query?.user_role === 'SUPER_ADMIN' || 
                    (req.user && req.user?.role === 'SUPER_ADMIN') || 
                    false;
    return {
        tenantId: req.headers?.['x-tenant-id'] || req.query?.tenant_id || 'ppos-production',
        printhouseId: req.headers?.['x-printhouse-id'] || req.query?.printhouse_id || null,
        operatorId: req.headers?.['x-operator-id'] || req.body?.operator_id || req.query?.operator_id || 'operator-dashboard',
        isSuperAdmin: isSuper
    };
}

/**
 * GET /api/admin/materials/debug
 * Direct database introspection endpoint to diagnose driver/plugin/table availability.
 */
router.get('/debug', async (req, res) => {
    try {
        const unwrap = (result) => Array.isArray(result) ? (Array.isArray(result[0]) ? result[0] : result) : [];

        const tablesRaw = await db.query(`
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME IN (
                'predictive_material_inventory',
                'materials_catalog',
                'material_inventory_events',
                'material_procurements'
              )
        `);
        const tables = unwrap(tablesRaw);

        const inventoryColumnsRaw = await db.query(`
            SELECT COLUMN_NAME, DATA_TYPE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'predictive_material_inventory'
            ORDER BY ORDINAL_POSITION
        `);
        const inventoryColumns = unwrap(inventoryColumnsRaw);

        const countRowsRaw = await db.query(`
            SELECT COUNT(*) AS total
            FROM predictive_material_inventory
        `);
        const countRows = unwrap(countRowsRaw);

        const sampleRowsRaw = await db.query(`
            SELECT *
            FROM predictive_material_inventory
            LIMIT 5
        `);
        const sampleRows = unwrap(sampleRowsRaw);

        return res.json({
            ok: true,
            tables,
            inventoryColumns,
            count: countRows?.[0]?.total ?? 0,
            sampleRows
        });
    } catch (error) {
        console.error('[MATERIALS][DEBUG_FAILED]', error);
        return res.status(500).json({
            ok: false,
            error: error.message,
            code: error.code,
            sqlMessage: error.sqlMessage,
            stack: error.stack
        });
    }
});


/**
 * GET /api/admin/materials
 * Retrieves all catalog materials with predictive availability scoring, scoped to tenant/printhouse.
 */
router.get('/', async (req, res) => {
    const scope = getScopeContext(req);
    const unwrap = (result) => Array.isArray(result) ? (Array.isArray(result[0]) ? result[0] : result) : [];

    try {
        const rows = await materialService.getAllMaterials({
            tenantId: scope.tenantId,
            printhouseId: scope.printhouseId,
            isSuperAdmin: scope.isSuperAdmin
        });
        
        const materialsArray = Array.isArray(rows) ? rows : (Array.isArray(rows?.materials) ? rows.materials : []);
        const registeredStockUnits = materialsArray.reduce((acc, m) => acc + (Number(m.current_stock_units) || 0), 0);
        const reservedCapacityLocks = materialsArray.reduce((acc, m) => acc + (Number(m.reserved_stock_units) || 0), 0);
        const netAvailablePool = registeredStockUnits - reservedCapacityLocks;
        const shortageImpactIndicators = materialsArray.filter(m => m.status === 'CRITICAL' || m.shortage_risk === 'SHORTAGE_RISK').length;

        const payload = {
            ok: true,
            materials: materialsArray,
            summary: {
                registeredStockUnits,
                reservedCapacityLocks,
                netAvailablePool,
                shortageImpactIndicators
            }
        };
        if (rows && rows.source_status) {
            payload.source_status = rows.source_status;
        }

        logger.info({
            event: 'materials_route_response_shape',
            isArray: Array.isArray(payload),
            keys: payload && typeof payload === 'object' ? Object.keys(payload) : [],
            count: materialsArray.length,
            first: materialsArray[0]
        });

        return res.json(payload);
    } catch (error) {
        console.error('[MATERIALS][SERVICE_FAILED_SAFE_FALLBACK]', error);

        try {
            const fallbackRowsRaw = await db.query(`
                SELECT
                    id,
                    node_id,
                    COALESCE(tenant_id, 'ppos-production') AS tenant_id,
                    COALESCE(printhouse_id, node_id) AS printhouse_id,
                    material_type,
                    material_name,
                    current_stock_units,
                    reserved_stock_units,
                    stock_unit_name,
                    replenishment_lead_days,
                    reorder_point,
                    forecasted_depletion_date,
                    last_updated,
                    created_at,
                    (COALESCE(current_stock_units,0) - COALESCE(reserved_stock_units,0)) AS available_units,
                    CASE
                      WHEN (COALESCE(current_stock_units,0) - COALESCE(reserved_stock_units,0)) <= 0 THEN 'CRITICAL'
                      WHEN (COALESCE(current_stock_units,0) - COALESCE(reserved_stock_units,0)) <= COALESCE(reorder_point,100) THEN 'AT_RISK'
                      ELSE 'STABLE'
                    END AS status
                FROM predictive_material_inventory
                ORDER BY created_at DESC
                LIMIT 500
            `);
            const fallbackRows = unwrap(fallbackRowsRaw);

            return res.json({
                ok: true,
                materials: fallbackRows,
                summary: {
                    registeredStockUnits: fallbackRows.reduce((s, r) => s + Number(r.current_stock_units || 0), 0),
                    reservedCapacityLocks: fallbackRows.reduce((s, r) => s + Number(r.reserved_stock_units || 0), 0),
                    netAvailablePool: fallbackRows.reduce((s, r) => s + Number(r.available_units || 0), 0),
                    shortageImpactIndicators: fallbackRows.filter(r => ['CRITICAL', 'AT_RISK'].includes(r.status)).length
                },
                degraded: true,
                degradedReason: error.message,
                sqlMessage: error.sqlMessage,
                code: error.code
            });
        } catch (fallbackError) {
            console.error('[MATERIALS][FALLBACK_FAILED]', fallbackError);
            return res.status(500).json({
                ok: false,
                error: 'MATERIALS_ENDPOINT_TOTAL_FAILURE',
                primary: {
                    message: error.message,
                    code: error.code,
                    sqlMessage: error.sqlMessage
                },
                fallback: {
                    message: fallbackError.message,
                    code: fallbackError.code,
                    sqlMessage: fallbackError.sqlMessage
                }
            });
        }
    }
});

/**
 * POST /api/admin/materials
 * Creates a new material in the catalog and initializes base predictive inventory.
 */
router.post('/', async (req, res) => {
    const scope = getScopeContext(req);
    try {
        const result = await materialService.createMaterial(req.body || {}, scope.tenantId, scope.printhouseId);
        res.json({ ok: true, data: result });
    } catch (err) {
        console.error('[MATERIALS-API] Failed to create material:', err);
        res.status(500).json({ ok: false, error: err.message, code: 'MATERIAL_CREATE_ERROR' });
    }
});

/**
 * POST /api/admin/materials/procurements/:id/receive
 * Marks an active supplier procurement as received, auto-incrementing stock.
 */
router.post('/procurements/:id/receive', async (req, res) => {
    const scope = getScopeContext(req);
    try {
        const result = await materialService.receiveProcurement(req.params.id, scope.operatorId);
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[MATERIALS-API] Failed to receive procurement:', err);
        res.status(500).json({ ok: false, error: err.message, code: 'PROCUREMENT_RECEIVE_ERROR' });
    }
});

/**
 * GET /api/admin/materials/node/:nodeId
 * Retrieves material catalog dedicated to a target physical printing machine/node.
 */
router.get('/node/:nodeId', async (req, res) => {
    const { nodeId } = req.params;
    try {
        await materialService.forecastDepletion(nodeId);
        const rows = await materialService.getInventory(nodeId);
        res.json({ ok: true, data: rows });
    } catch (err) {
        console.error(`[MATERIALS-API] Failed to fetch inventory for node [${nodeId}]:`, err);
        res.status(500).json({ ok: false, error: err.message, code: 'NODE_MATERIALS_FETCH_ERROR' });
    }
});

/**
 * POST /api/admin/materials/reserve
 * Legacy signature: Locks capacity units for active manufacturing dispatches.
 */
router.post('/reserve', async (req, res) => {
    const { dispatch_id, node_id, specs } = req.body || {};
    if (!node_id || !specs) {
        return res.status(400).json({ ok: false, error: 'Missing parameters: node_id and specs are mandatory', code: 'INVALID_RESERVATION_PAYLOAD' });
    }

    try {
        const result = await materialService.reserveMaterials(dispatch_id || 'manual-override', node_id, specs);
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[MATERIALS-API] Reservation lock failed loud:', err.message);
        res.status(409).json({ ok: false, error: err.message, code: 'MATERIAL_RESERVATION_FAILED' });
    }
});

/**
 * POST /api/admin/materials/release
 * Legacy signature: Frees previously held inventory resources.
 */
router.post('/release', async (req, res) => {
    const { dispatch_id, node_id, specs } = req.body || {};
    if (!node_id || !specs) {
        return res.status(400).json({ ok: false, error: 'Missing parameters: node_id and specs are mandatory', code: 'INVALID_RELEASE_PAYLOAD' });
    }

    try {
        const result = await materialService.releaseMaterials(dispatch_id || 'manual-override', node_id, specs);
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[MATERIALS-API] Material inventory release failed:', err.message);
        res.status(500).json({ ok: false, error: err.message, code: 'MATERIAL_RELEASE_ERROR' });
    }
});

/**
 * GET /api/admin/materials/:id
 * Retrieves granular state metrics for a solitary material unit.
 */
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const mat = await materialService.getMaterialById(id);
        if (!mat) {
            return res.status(404).json({ ok: false, error: 'Material specification not found', code: 'MATERIAL_NOT_FOUND' });
        }
        res.json({ ok: true, data: mat });
    } catch (err) {
        console.error(`[MATERIALS-API] Failed to fetch unit [${id}]:`, err);
        res.status(500).json({ ok: false, error: err.message, code: 'MATERIAL_DETAIL_ERROR' });
    }
});

/**
 * POST /api/admin/materials/:id/intake
 * Operator workflow: Intake physical stock quantities.
 */
router.post('/:id/intake', async (req, res) => {
    const scope = getScopeContext(req);
    const { quantity, reason, supplier_batch, expected_use } = req.body || {};
    try {
        const result = await materialService.intakeStock(req.params.id, quantity, reason, supplier_batch, expected_use, scope.operatorId);
        res.json({ ok: true, data: result });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message, code: 'INTAKE_STOCK_ERROR' });
    }
});

/**
 * POST /api/admin/materials/:id/adjust
 * Operator workflow: Manual audited physical inventory overrides.
 */
router.post('/:id/adjust', async (req, res) => {
    const scope = getScopeContext(req);
    const { quantity_delta, reason, operator_note } = req.body || {};
    try {
        const result = await materialService.adjustStock(req.params.id, quantity_delta, reason, operator_note, scope.operatorId);
        res.json({ ok: true, data: result });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message, code: 'ADJUST_STOCK_ERROR' });
    }
});

/**
 * POST /api/admin/materials/:id/reserve
 * Operator workflow: Explicit allocation reservation lock.
 */
router.post('/:id/reserve', async (req, res) => {
    const scope = getScopeContext(req);
    const { job_id, dispatch_id, quantity, expiration } = req.body || {};
    try {
        const result = await materialService.reserveStockUnits(req.params.id, job_id, dispatch_id, quantity, expiration, scope.operatorId);
        res.json({ ok: true, data: result });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message, code: 'RESERVE_STOCK_ERROR' });
    }
});

/**
 * POST /api/admin/materials/:id/release
 * Operator workflow: Frees explicitly allocated pool units.
 */
router.post('/:id/release', async (req, res) => {
    const { quantity } = req.body || {};
    try {
        const mat = await materialService.getMaterialById(req.params.id);
        if (!mat) return res.status(404).json({ ok: false, error: 'Material not found' });
        
        const qtyToRelease = Number(quantity || 500);
        const newReserved = Math.max(0, mat.reserved_stock_units - qtyToRelease);
        await materialService.computeStateAndForecast(mat.id);
        // Release manual wrapper
        await materialService.releaseMaterials('manual-operator-release', mat.node_id, { material_id: mat.id, units: qtyToRelease });
        
        const updated = await materialService.getMaterialById(mat.id);
        res.json({ ok: true, data: updated });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'RELEASE_STOCK_ERROR' });
    }
});

/**
 * POST /api/admin/materials/:id/consume
 * Operator workflow: Depletes stock permanently post-production execution.
 */
router.post('/:id/consume', async (req, res) => {
    const scope = getScopeContext(req);
    const { job_id, quantity_consumed, waste_units, reason } = req.body || {};
    try {
        const result = await materialService.consumeStockUnits(req.params.id, job_id, quantity_consumed, waste_units, reason, scope.operatorId);
        res.json({ ok: true, data: result });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message, code: 'CONSUME_STOCK_ERROR' });
    }
});

/**
 * POST /api/admin/materials/:id/procurements
 * Operator workflow: Triggers a new supplier restock purchase order.
 */
router.post('/:id/procurements', async (req, res) => {
    const { supplier_name, ordered_units, expected_delivery_date, risk, notes } = req.body || {};
    try {
        const result = await materialService.createProcurement(req.params.id, supplier_name, ordered_units, expected_delivery_date, risk, notes);
        res.json({ ok: true, data: result });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message, code: 'CREATE_PROCUREMENT_ERROR' });
    }
});

/**
 * GET /api/admin/materials/:id/events
 * Retrieves chronological timeline tracking history logs.
 */
router.get('/:id/events', async (req, res) => {
    try {
        const timeline = await materialService.getMaterialTimeline(req.params.id);
        res.json({ ok: true, events: timeline });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'EVENTS_TIMELINE_ERROR' });
    }
});

/**
 * GET /api/admin/materials/:id/procurements
 * Retrieves restock order histories for targeted item.
 */
router.get('/:id/procurements', async (req, res) => {
    try {
        const list = await materialService.getMaterialProcurements(req.params.id);
        res.json({ ok: true, procurements: list });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'PROCUREMENTS_LIST_ERROR' });
    }
});

/**
 * GET /api/admin/materials/:id/forecast
 * Recalculates depletion projections and yields current diagnostic forecasts.
 */
router.get('/:id/forecast', async (req, res) => {
    try {
        const mat = await materialService.getMaterialById(req.params.id);
        if (mat && mat.node_id) {
            await materialService.forecastDepletion(mat.node_id);
        }
        const updated = await materialService.getMaterialById(req.params.id);
        res.json({ ok: true, forecast: updated });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'FORECAST_CALCULATION_ERROR' });
    }
});

module.exports = router;
