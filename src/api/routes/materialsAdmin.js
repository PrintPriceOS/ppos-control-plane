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
const paperCostIntegrationService = require('../services/paperCostIntegrationService');
const db = require('../services/mysqlClient');
const logger = require('../services/logger').child('materials-route');

const { resolveActorContext, requireAdmin } = require('../middleware/auth');

router.use(requireAdmin);


// Helper to extract multi-tenant scope from request context
function getScopeContext(req) {
    const context = resolveActorContext(req);
    // Explicit tenant resolution: Suppliers cannot access printhouse materials admin routes
    if (context.isSupplierUser && !context.isSuperAdmin) {
        const err = new Error('FORBIDDEN_SUPPLIER_ACCESS_TO_PRINTHOUSE_MATERIALS');
        err.statusCode = 403;
        throw err;
    }

    return {
        tenantId: context.isSuperAdmin ? (req.headers?.['x-tenant-id'] || req.query?.tenant_id || context.tenantId) : context.tenantId,
        printhouseId: context.isSuperAdmin ? (req.headers?.['x-printhouse-id'] || req.query?.printhouse_id || context.printhouseId) : context.printhouseId,
        operatorId: context.userId || 'operator-dashboard',
        role: context.role,
        isSuperAdmin: context.isSuperAdmin,
        isPrinthouseUser: context.isPrinthouseUser
    };
}

/**
 * GET /api/admin/materials/debug
 * Direct database introspection endpoint to diagnose driver/plugin/table availability.
 * Restringido estrictamente a SUPER_ADMIN.
 */
router.get('/debug', (req, res, next) => {
    const context = resolveActorContext(req);
    if (!context.isSuperAdmin) {
        return res.status(403).json({
            ok: false,
            error: { code: 'FORBIDDEN', message: 'Diagnostic endpoint requires explicit SUPER_ADMIN authorization.' }
        });
    }
    next();
}, async (req, res) => {
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

    // Server-side center authorization: non-superadmin without authorized center is rejected immediately (HTTP 403)
    if (!scope.isSuperAdmin && !scope.printhouseId) {
        return res.status(403).json({
            ok: false,
            error: 'FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS',
            code: 'FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS'
        });
    }

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

        // Fail closed: do not capture authorization or validation errors to run fallback
        if (error.statusCode) {
            return res.status(error.statusCode).json({
                ok: false,
                error: error.message,
                code: error.code || 'FORBIDDEN'
            });
        }

        try {
            // Strictly scoped fallback query: NEVER return global un-scoped inventory to a tenant
            let fallbackSql = `
                SELECT
                    id,
                    node_id,
                    tenant_id,
                    printhouse_id,
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
            `;
            const params = [];
            if (!scope.isSuperAdmin) {
                fallbackSql += ` WHERE tenant_id = ? AND (printhouse_id = ? OR node_id = ?)`;
                params.push(scope.tenantId, scope.printhouseId, scope.printhouseId);
            }
            fallbackSql += ` ORDER BY created_at DESC LIMIT 500`;

            const fallbackRowsRaw = await db.query(fallbackSql, params);
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

// Helper to assert operator write permissions (requires OPERATOR or ADMIN role)
function assertWritePermission(scope) {
    if (scope.isSuperAdmin) return;
    const actorRole = (scope.role || '').toUpperCase();
    const canWrite = ['SUPER_ADMIN', 'OPS_ADMIN', 'SYSTEM_ADMIN', 'TENANT_ADMIN', 'PRINTHOUSE_ADMIN', 'OPERATOR', 'PRINTHOUSE_OPERATOR'].includes(actorRole);
    if (!canWrite) {
        const err = new Error('FORBIDDEN_WRITE_PERMISSION_REQUIRED');
        err.statusCode = 403;
        err.code = 'FORBIDDEN_WRITE_PERMISSION_REQUIRED';
        throw err;
    }
}

/**
 * Validates that a node_id exists and belongs to the authenticated tenant and center.
 * Fails closed if node does not exist, tenant does not match, or actor lacks authorized center.
 */
async function assertNodeOwnership(nodeId, scope) {
    if (!nodeId || typeof nodeId !== 'string') {
        const err = new Error('INVALID_NODE_ID');
        err.statusCode = 400;
        err.code = 'INVALID_NODE_ID';
        throw err;
    }
    if (scope.isSuperAdmin) return;

    // A node_id sent by the client does NOT grant center authorization:
    // Actor MUST have an authorized center in scope, and node must match that center.
    if (!scope.printhouseId) {
        const err = new Error('FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS');
        err.statusCode = 403;
        err.code = 'FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS';
        throw err;
    }

    const rows = await db.query('SELECT id, tenant_id FROM printer_nodes WHERE id = ?', [nodeId]);
    const node = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0][0] : rows[0]) : null;

    if (!node) {
        const err = new Error('PRINTER_NODE_NOT_FOUND');
        err.statusCode = 404;
        err.code = 'PRINTER_NODE_NOT_FOUND';
        throw err;
    }

    if (node.tenant_id !== scope.tenantId) {
        const err = new Error('FORBIDDEN_CROSS_TENANT_NODE_ACCESS');
        err.statusCode = 403;
        err.code = 'FORBIDDEN_CROSS_TENANT_NODE_ACCESS';
        throw err;
    }

    // Fail-closed center isolation: node must match the actor's authorized printhouseId
    if (node.id !== scope.printhouseId) {
        const err = new Error('FORBIDDEN_CROSS_CENTER_NODE_ACCESS');
        err.statusCode = 403;
        err.code = 'FORBIDDEN_CROSS_CENTER_NODE_ACCESS';
        throw err;
    }
}

/**
 * POST /api/admin/materials
 * Creates a new material in the catalog and initializes base predictive inventory.
 */
router.post('/', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        assertWritePermission(scope);

        // An actor without authorized center cannot create materials
        // Sending node_id in request body does NOT grant center authorization
        if (!scope.isSuperAdmin && !scope.printhouseId) {
            const err = new Error('FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS');
            err.statusCode = 403;
            err.code = 'FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS';
            throw err;
        }

        // Do not trust client-supplied tenantId/printhouseId in body
        const payload = { ...req.body };
        delete payload.tenantId;
        delete payload.tenant_id;
        delete payload.printhouse_id;

        const targetNodeId = scope.printhouseId || payload.node_id;
        if (targetNodeId) {
            await assertNodeOwnership(targetNodeId, scope);
        }

        const effectiveCenter = scope.printhouseId || targetNodeId || null;
        payload.node_id = effectiveCenter;
        const result = await materialService.createMaterial(payload, scope.tenantId, effectiveCenter);
        res.json({ ok: true, data: result });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code || 'FORBIDDEN' });
        }
        if (err.message === 'FORBIDDEN_SUPPLIER_ACCESS_TO_PRINTHOUSE_MATERIALS') {
            return res.status(403).json({ ok: false, error: err.message, code: 'FORBIDDEN' });
        }
        console.error('[MATERIALS-API] Failed to create material:', err);
        res.status(500).json({ ok: false, error: err.message, code: 'MATERIAL_CREATE_ERROR' });
    }
});

const paperProcurementService = require('../services/paperProcurementService');

/**
 * -------------------------------------------------------------
 * ITERATIONS I4 & I5: PRINTHOUSE PAPER SOURCING & PROCUREMENT
 * -------------------------------------------------------------
 */

/**
 * GET /api/admin/materials/sourcing/offers
 * Sourcing search across visible supplier paper offers.
 */
router.get('/sourcing/offers', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        if (!scope.tenantId) {
            return res.status(401).json({ ok: false, error: 'TENANT_ID_REQUIRED' });
        }

        const result = await paperProcurementService.searchVisibleOffers(scope.tenantId, req.query);
        return res.json({ ok: true, data: result });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code || 'SOURCING_ERROR' });
        }
        console.error('[MATERIALS-API] Failed to search sourcing offers:', err);
        return res.status(500).json({ ok: false, error: err.message, code: 'SOURCING_QUERY_ERROR' });
    }
});

/**
 * POST /api/admin/materials/sourcing/orders
 * Printhouse places an order or RFQ against a paper offer.
 */
router.post('/sourcing/orders', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        assertWritePermission(scope);

        if (!scope.isSuperAdmin && !scope.printhouseId) {
            return res.status(403).json({
                ok: false,
                error: 'FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS',
                code: 'FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS'
            });
        }

        const actor = {
            tenantId: scope.tenantId,
            printhouseId: scope.printhouseId,
            userId: scope.operatorId,
            role: scope.role,
            isSuperAdmin: scope.isSuperAdmin
        };

        const result = await paperProcurementService.placeOrderOrRfq(actor, {
            ...req.body,
            printhouseId: scope.printhouseId || req.body.printhouseId
        });

        return res.status(201).json({ ok: true, data: result });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code || 'ORDER_PLACEMENT_ERROR' });
        }
        console.error('[MATERIALS-API] Failed to place sourcing order:', err);
        return res.status(500).json({ ok: false, error: err.message, code: 'ORDER_PLACEMENT_ERROR' });
    }
});

/**
 * GET /api/admin/materials/procurements/paper-orders
 * List paper procurement orders for authenticated printhouse.
 */
router.get('/procurements/paper-orders', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        const result = await paperProcurementService.listPrinthouseOrders(scope.tenantId, scope.printhouseId, req.query);
        return res.json({ ok: true, data: result });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code || 'LIST_ORDERS_ERROR' });
        }
        console.error('[MATERIALS-API] Failed to list paper orders:', err);
        return res.status(500).json({ ok: false, error: err.message, code: 'LIST_ORDERS_ERROR' });
    }
});

/**
 * GET /api/admin/materials/procurements/paper-orders/:id
 * Retrieve paper procurement order detail by ID.
 */
router.get('/procurements/paper-orders/:id', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        const order = await paperProcurementService.getPrinthouseOrderById(scope.tenantId, req.params.id);
        return res.json({ ok: true, data: order });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code || 'GET_ORDER_ERROR' });
        }
        console.error('[MATERIALS-API] Failed to get paper order:', err);
        return res.status(500).json({ ok: false, error: err.message, code: 'GET_ORDER_ERROR' });
    }
});

/**
 * POST /api/admin/materials/procurements/paper-orders/:id/accept-quote
 * Printhouse accepts supplier's RFQ quote.
 */
router.post('/procurements/paper-orders/:id/accept-quote', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        assertWritePermission(scope);

        const actor = {
            tenantId: scope.tenantId,
            printhouseId: scope.printhouseId,
            userId: scope.operatorId,
            role: scope.role
        };

        const result = await paperProcurementService.acceptRfqQuote(actor, req.params.id);
        return res.json({ ok: true, data: result });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code || 'ACCEPT_QUOTE_ERROR' });
        }
        console.error('[MATERIALS-API] Failed to accept RFQ quote:', err);
        return res.status(500).json({ ok: false, error: err.message, code: 'ACCEPT_QUOTE_ERROR' });
    }
});

/**
 * POST /api/admin/materials/procurements/paper-orders/:id/receive
 * Atomic and idempotent warehouse receipt for paper procurement order.
 */
router.post('/procurements/paper-orders/:id/receive', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        assertWritePermission(scope);

        if (!scope.isSuperAdmin && !scope.printhouseId) {
            return res.status(403).json({
                ok: false,
                error: 'FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS',
                code: 'FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS'
            });
        }

        const idempotencyKey = req.headers?.['idempotency-key'] || req.body?.idempotency_key || req.body?.idempotencyKey || null;
        if (!idempotencyKey) {
            return res.status(400).json({
                ok: false,
                error: 'IDEMPOTENCY_KEY_REQUIRED',
                code: 'IDEMPOTENCY_KEY_REQUIRED'
            });
        }

        const actor = {
            tenantId: scope.tenantId,
            printhouseId: scope.printhouseId,
            userId: scope.operatorId,
            role: scope.role,
            isSuperAdmin: scope.isSuperAdmin
        };

        const result = await paperProcurementService.receiveOrderAtomic(
            req.params.id,
            actor,
            {
                receivedQuantity: req.body?.receivedQuantity ?? req.body?.received_quantity,
                receivedSheets: req.body?.receivedSheets ?? req.body?.received_sheets,
                idempotencyKey,
                notes: req.body?.notes,
                operatorId: scope.operatorId
            }
        );

        return res.json({ ok: true, data: result });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code || 'RECEIVE_ORDER_ERROR' });
        }
        console.error('[MATERIALS-API] Failed to receive paper order:', err);
        return res.status(500).json({ ok: false, error: err.message, code: 'RECEIVE_ORDER_ERROR' });
    }
});

/**
 * GET /api/admin/materials/procurements/paper-orders/:id/document
 * Generates official Purchase Order (PO) or Delivery Receipt (Packing Slip) document.
 * Query param: ?type=po | packing_slip
 */
router.get('/procurements/paper-orders/:id/document', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        const { type = 'po' } = req.query;
        const actor = {
            tenantId: scope.tenantId,
            printhouseId: scope.printhouseId,
            userId: scope.operatorId,
            role: scope.role,
            isSuperAdmin: scope.isSuperAdmin
        };
        const doc = await paperProcurementService.generateProcurementDocument(req.params.id, type, actor);
        return res.json({ ok: true, data: doc });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code || 'DOCUMENT_ERROR' });
        }
        console.error('[MATERIALS-API] Failed to generate paper procurement document:', err);
        return res.status(500).json({ ok: false, error: err.message, code: 'DOCUMENT_ERROR' });
    }
});

/**
 * POST /api/admin/materials/sourcing/estimate-job-paper
 * Calculates physical sheets, net/gross kilograms, scrap allowance, and estimated procurement costs.
 */
router.post('/sourcing/estimate-job-paper', async (req, res) => {
    try {
        const result = paperCostIntegrationService.calculateJobPaperRequirements(req.body || {});
        return res.json({ ok: true, data: result });
    } catch (err) {
        console.error('[MATERIALS-API] Failed to estimate job paper:', err);
        return res.status(400).json({ ok: false, error: err.message, code: 'JOB_PAPER_ESTIMATION_ERROR' });
    }
});

/**
 * GET /api/admin/materials/sourcing/resolve-market-rate
 * Resolves best available market rate normalized to price_per_kg from active supplier offers.
 */
router.get('/sourcing/resolve-market-rate', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        if (!scope.tenantId) {
            return res.status(401).json({ ok: false, error: 'TENANT_ID_REQUIRED' });
        }
        const result = await paperCostIntegrationService.resolveMarketPaperRate(scope.tenantId, req.query);
        return res.json({ ok: true, data: result });
    } catch (err) {
        console.error('[MATERIALS-API] Failed to resolve market rate:', err);
        return res.status(500).json({ ok: false, error: err.message, code: 'MARKET_RATE_RESOLUTION_ERROR' });
    }
});

/**
 * POST /api/admin/materials/sourcing/bpe-rate-patch
 * Builds a BPE forward pricing candidate rate patch from active supplier paper rates.
 */
router.post('/sourcing/bpe-rate-patch', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        if (!scope.tenantId) {
            return res.status(401).json({ ok: false, error: 'TENANT_ID_REQUIRED' });
        }
        assertWritePermission(scope);
        const result = await paperCostIntegrationService.buildBpePaperPatch(scope.tenantId, req.body || {});
        return res.json({ ok: true, data: result });
    } catch (err) {
        console.error('[MATERIALS-API] Failed to build BPE paper patch:', err);
        const status = err.statusCode || 500;
        return res.status(status).json({ ok: false, error: err.message, code: err.code || 'BPE_RATE_PATCH_ERROR' });
    }
});

/**
 * POST /api/admin/materials/procurements/:id/receive
 * Marks an active supplier procurement as received, auto-incrementing stock atomically and idempotently.
 */
router.post('/procurements/:id/receive', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        assertWritePermission(scope);

        if (!scope.isSuperAdmin && !scope.printhouseId) {
            const err = new Error('FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS');
            err.statusCode = 403;
            err.code = 'FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS';
            throw err;
        }

        const idempotencyKey = req.headers?.['idempotency-key'] || req.body?.idempotency_key || null;
        const acceptedQuantity = req.body?.accepted_quantity !== undefined ? req.body.accepted_quantity : null;
        
        const result = await materialService.receiveProcurementAtomic(
            req.params.id,
            scope.operatorId,
            scope.tenantId,
            scope.printhouseId,
            scope.isSuperAdmin,
            { idempotencyKey, acceptedQuantity, requestBody: req.body }
        );
        res.json({ ok: true, ...result });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code || 'PROCUREMENT_RECEIVE_ERROR' });
        }
        if (err.message === 'FORBIDDEN_SUPPLIER_ACCESS_TO_PRINTHOUSE_MATERIALS') {
            return res.status(403).json({ ok: false, error: err.message, code: 'FORBIDDEN' });
        }
        console.error('[MATERIALS-API] Failed to receive procurement:', err);
        res.status(500).json({ ok: false, error: err.message, code: 'PROCUREMENT_RECEIVE_ERROR' });
    }
});

/**
 * GET /api/admin/materials/node/:nodeId
 * Retrieves material catalog dedicated to a target physical printing machine/node.
 */
router.get('/node/:nodeId', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        const { nodeId } = req.params;

        // Fails closed if node does not exist or fails tenant check
        await assertNodeOwnership(nodeId, scope);

        await materialService.forecastDepletion(nodeId);
        const rows = await materialService.getInventory(nodeId);
        res.json({ ok: true, data: rows });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code || 'FORBIDDEN' });
        }
        if (err.message === 'FORBIDDEN_SUPPLIER_ACCESS_TO_PRINTHOUSE_MATERIALS') {
            return res.status(403).json({ ok: false, error: err.message, code: 'FORBIDDEN' });
        }
        console.error(`[MATERIALS-API] Failed to fetch inventory for node [${req.params.nodeId}]:`, err);
        res.status(500).json({ ok: false, error: err.message, code: 'NODE_MATERIALS_FETCH_ERROR' });
    }
});

/**
 * POST /api/admin/materials/reserve
 * Legacy signature: Locks capacity units for active manufacturing dispatches.
 * Protected with tenant ownership and write permission.
 */
router.post('/reserve', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        assertWritePermission(scope);

        if (!scope.isSuperAdmin && !scope.printhouseId) {
            const err = new Error('FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS');
            err.statusCode = 403;
            err.code = 'FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS';
            throw err;
        }

        const { dispatch_id, node_id, specs } = req.body || {};
        if (!node_id || !specs) {
            return res.status(400).json({ ok: false, error: 'Missing parameters: node_id and specs are mandatory', code: 'INVALID_RESERVATION_PAYLOAD' });
        }

        // Enforce node authorization
        await assertNodeOwnership(node_id, scope);

        const result = await materialService.reserveMaterials(dispatch_id || 'manual-override', node_id, specs, scope);
        res.json({ ok: true, ...result });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code || 'FORBIDDEN' });
        }
        console.error('[MATERIALS-API] Reservation lock failed loud:', err.message);
        res.status(409).json({ ok: false, error: err.message, code: 'MATERIAL_RESERVATION_FAILED' });
    }
});

/**
 * POST /api/admin/materials/release
 * Legacy signature: Frees previously held inventory resources.
 * Protected with tenant ownership and write permission.
 */
router.post('/release', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        assertWritePermission(scope);

        if (!scope.isSuperAdmin && !scope.printhouseId) {
            const err = new Error('FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS');
            err.statusCode = 403;
            err.code = 'FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS';
            throw err;
        }

        const { dispatch_id, node_id, specs } = req.body || {};
        if (!node_id || !specs) {
            return res.status(400).json({ ok: false, error: 'Missing parameters: node_id and specs are mandatory', code: 'INVALID_RELEASE_PAYLOAD' });
        }

        // Enforce node authorization
        await assertNodeOwnership(node_id, scope);

        const result = await materialService.releaseMaterials(dispatch_id || 'manual-override', node_id, specs, scope);
        res.json({ ok: true, ...result });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code || 'FORBIDDEN' });
        }
        console.error('[MATERIALS-API] Material inventory release failed:', err.message);
        res.status(500).json({ ok: false, error: err.message, code: 'MATERIAL_RELEASE_ERROR' });
    }
});

// Helper to enforce material tenant and center ownership
async function assertMaterialAccess(id, scope) {
    const mat = await materialService.getMaterialById(id);
    if (!mat) {
        const err = new Error('MATERIAL_NOT_FOUND');
        err.statusCode = 404;
        err.code = 'MATERIAL_NOT_FOUND';
        throw err;
    }
    if (!scope.isSuperAdmin) {
        if (!mat.tenant_id || mat.tenant_id !== scope.tenantId) {
            const err = new Error('FORBIDDEN_CROSS_TENANT_MATERIAL_ACCESS');
            err.statusCode = 403;
            err.code = 'FORBIDDEN_CROSS_TENANT_MATERIAL_ACCESS';
            throw err;
        }

        // Fail-closed center isolation: Resource must have an assigned center
        const matCenter = mat.printhouse_id || mat.node_id;
        if (!matCenter) {
            const err = new Error('FORBIDDEN_UNASSIGNED_CENTER_MATERIAL_ACCESS');
            err.statusCode = 403;
            err.code = 'FORBIDDEN_UNASSIGNED_CENTER_MATERIAL_ACCESS';
            throw err;
        }

        // Fail closed: Actor MUST have an authorized center
        if (!scope.printhouseId) {
            const err = new Error('FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS');
            err.statusCode = 403;
            err.code = 'FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS';
            throw err;
        }

        if (matCenter !== scope.printhouseId) {
            const err = new Error('FORBIDDEN_CROSS_CENTER_MATERIAL_ACCESS');
            err.statusCode = 403;
            err.code = 'FORBIDDEN_CROSS_CENTER_MATERIAL_ACCESS';
            throw err;
        }
    }
    return mat;
}

/**
 * GET /api/admin/materials/:id
 * Retrieves granular state metrics for a solitary material unit.
 */
router.get('/:id', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        const mat = await assertMaterialAccess(req.params.id, scope);
        res.json({ ok: true, data: mat });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code || err.message });
        }
        console.error(`[MATERIALS-API] Failed to fetch unit [${req.params.id}]:`, err);
        res.status(500).json({ ok: false, error: err.message, code: 'MATERIAL_DETAIL_ERROR' });
    }
});

/**
 * POST /api/admin/materials/:id/intake
 * Operator workflow: Intake physical stock quantities.
 */
router.post('/:id/intake', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        assertWritePermission(scope);
        await assertMaterialAccess(req.params.id, scope);
        const { quantity, reason, supplier_batch, expected_use } = req.body || {};
        const result = await materialService.intakeStock(req.params.id, quantity, reason, supplier_batch, expected_use, scope.operatorId);
        res.json({ ok: true, data: result });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code || err.message });
        }
        res.status(400).json({ ok: false, error: err.message, code: 'INTAKE_STOCK_ERROR' });
    }
});

/**
 * POST /api/admin/materials/:id/adjust
 * Operator workflow: Manual audited physical inventory overrides.
 */
router.post('/:id/adjust', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        assertWritePermission(scope);
        await assertMaterialAccess(req.params.id, scope);
        const { quantity_delta, reason, operator_note } = req.body || {};
        const result = await materialService.adjustStock(req.params.id, quantity_delta, reason, operator_note, scope.operatorId);
        res.json({ ok: true, data: result });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code || err.message });
        }
        res.status(400).json({ ok: false, error: err.message, code: 'ADJUST_STOCK_ERROR' });
    }
});

/**
 * POST /api/admin/materials/:id/reserve
 * Operator workflow: Explicit allocation reservation lock.
 */
router.post('/:id/reserve', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        assertWritePermission(scope);
        await assertMaterialAccess(req.params.id, scope);
        const { job_id, dispatch_id, quantity, expiration } = req.body || {};
        const result = await materialService.reserveStockUnits(req.params.id, job_id, dispatch_id, quantity, expiration, scope.operatorId);
        res.json({ ok: true, data: result });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code || err.message });
        }
        res.status(400).json({ ok: false, error: err.message, code: 'RESERVE_STOCK_ERROR' });
    }
});

/**
 * POST /api/admin/materials/:id/release
 * Operator workflow: Frees explicitly allocated pool units.
 */
router.post('/:id/release', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        assertWritePermission(scope);
        const mat = await assertMaterialAccess(req.params.id, scope);
        const { quantity } = req.body || {};
        const qtyToRelease = Number(quantity || 500);
        await materialService.releaseMaterials('manual-operator-release', mat.node_id, { material_id: mat.id, units: qtyToRelease }, scope);
        const updated = await materialService.getMaterialById(mat.id);
        res.json({ ok: true, data: updated });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code || err.message });
        }
        res.status(500).json({ ok: false, error: err.message, code: 'RELEASE_STOCK_ERROR' });
    }
});

/**
 * POST /api/admin/materials/:id/consume
 * Operator workflow: Depletes stock permanently post-production execution.
 */
router.post('/:id/consume', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        assertWritePermission(scope);
        await assertMaterialAccess(req.params.id, scope);
        const { job_id, quantity_consumed, waste_units, reason } = req.body || {};
        const result = await materialService.consumeStockUnits(req.params.id, job_id, quantity_consumed, waste_units, reason, scope.operatorId);
        res.json({ ok: true, data: result });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code || err.message });
        }
        res.status(400).json({ ok: false, error: err.message, code: 'CONSUME_STOCK_ERROR' });
    }
});

/**
 * POST /api/admin/materials/:id/procurements
 * Operator workflow: Triggers a new supplier restock purchase order.
 */
router.post('/:id/procurements', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        assertWritePermission(scope);
        await assertMaterialAccess(req.params.id, scope);
        const { supplier_name, ordered_units, expected_delivery_date, risk, notes } = req.body || {};
        const result = await materialService.createProcurement(req.params.id, supplier_name, ordered_units, expected_delivery_date, risk, notes);
        res.json({ ok: true, data: result });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code || err.message });
        }
        res.status(400).json({ ok: false, error: err.message, code: 'CREATE_PROCUREMENT_ERROR' });
    }
});

/**
 * GET /api/admin/materials/:id/events
 * Retrieves chronological timeline tracking history logs.
 */
router.get('/:id/events', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        await assertMaterialAccess(req.params.id, scope);
        const timeline = await materialService.getMaterialTimeline(req.params.id);
        res.json({ ok: true, events: timeline });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.message });
        }
        res.status(500).json({ ok: false, error: err.message, code: 'EVENTS_TIMELINE_ERROR' });
    }
});

/**
 * GET /api/admin/materials/:id/procurements
 * Retrieves restock order histories for targeted item.
 */
router.get('/:id/procurements', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        await assertMaterialAccess(req.params.id, scope);
        const list = await materialService.getMaterialProcurements(req.params.id);
        res.json({ ok: true, procurements: list });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.message });
        }
        res.status(500).json({ ok: false, error: err.message, code: 'PROCUREMENTS_LIST_ERROR' });
    }
});

/**
 * GET /api/admin/materials/:id/forecast
 * Recalculates depletion projections and yields current diagnostic forecasts.
 */
router.get('/:id/forecast', async (req, res) => {
    try {
        const scope = getScopeContext(req);
        const mat = await assertMaterialAccess(req.params.id, scope);
        if (mat && mat.node_id) {
            await materialService.forecastDepletion(mat.node_id);
        }
        const updated = await materialService.getMaterialById(req.params.id);
        res.json({ ok: true, forecast: updated });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.message });
        }
        res.status(500).json({ ok: false, error: err.message, code: 'FORECAST_CALCULATION_ERROR' });
    }
});

module.exports = router;

