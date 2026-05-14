// src/api/routes/ordersAdmin.js
const express = require('express');
const {
    listOrders,
    getOrder,
    getOrderByRef,
    createOrder,
    updateOrder,
    deleteOrder,
    VALID_STATUSES
} = require('../services/ordersService');
const logger = require('../services/logger').child('admin-orders');

const { resolveActorContext } = require('../middleware/auth');

const router = express.Router();

// GET /api/admin/orders?status=pending&user_id=...&limit=50&offset=0
router.get('/', async (req, res) => {
    const traceId = req.headers['x-trace-id'] || `trace_${Date.now()}`;
    const { status, user_id, limit = 50, offset = 0 } = req.query;
    const context = resolveActorContext(req);

    if (status && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ ok: false, error: `Invalid status. Valid values: ${VALID_STATUSES.join(', ')}` });
    }

    try {
        const result = await listOrders({
            status,
            user_id,
            printhouse_id: context.isPrinthouseUser ? context.printhouseId : (req.query.printhouse_id || null),
            limit: Math.min(Number(limit), 200),
            offset: Math.max(Number(offset), 0)
        });
        res.json({ ok: true, ...result });
    } catch (err) {
        logger.error({
            event: 'ORDER_LIST_FAILED',
            error: err.message,
            tenant: req.user.tenantId,
            traceId
        });

        if (err.message.includes('ECONNREFUSED') || err.message.includes('PROTOCOL_CONNECTION_LOST')) {
            return res.status(503).json({ 
                ok: false, 
                status: 'DEGRADED', 
                error: { code: 'DATABASE_UNAVAILABLE', message: 'Order database is unreachable' } 
            });
        }

        res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
});

// GET /api/admin/orders/ref/:order_ref
router.get('/ref/:order_ref', async (req, res) => {
    try {
        const order = await getOrderByRef(req.params.order_ref);
        if (!order) return res.status(404).json({ ok: false, error: 'Order not found' });
        res.json({ ok: true, order });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// GET /api/admin/orders/:id
router.get('/:id', async (req, res) => {
    const context = resolveActorContext(req);
    try {
        const order = await getOrder(req.params.id);
        if (!order) return res.status(404).json({ ok: false, error: 'Order not found' });
        
        // Scope Check
        if (context.isPrinthouseUser && order.offer_print_house !== context.printhouseId) {
            return res.status(403).json({ ok: false, error: 'Access denied: This order belongs to another printhouse' });
        }

        res.json({ ok: true, order });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// POST /api/admin/orders
router.post('/', async (req, res) => {
    // Accommodate BPE sync payload by deriving default fallbacks for legacy required fields
    const isBpe = req.body.source === 'BPE' || req.body.source_ref != null;
    const order_ref = req.body.order_ref || req.body.source_ref || (isBpe ? `bpe_${Date.now()}` : null);
    const user_id = req.body.user_id || (isBpe ? 'bpe_system_user' : null);
    const specs = req.body.specs || (isBpe ? {} : null);
    const offer_print_house = req.body.offer_print_house || (isBpe ? 'BPE_Engine' : null);
    const offer_price = req.body.offer_price != null ? req.body.offer_price : (isBpe ? (req.body.pricing?.bpe_price || 0) : null);
    const status = req.body.status;

    if (!order_ref || !user_id || !specs || !offer_print_house || offer_price == null) {
        return res.status(400).json({
            ok: false,
            error: 'Missing required fields: order_ref, user_id, specs, offer_print_house, offer_price'
        });
    }

    if (status && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ ok: false, error: `Invalid status. Valid values: ${VALID_STATUSES.join(', ')}` });
    }

    try {
        // Pass full rich body along with resolved legacy arguments to createOrder
        const insertId = await createOrder({ 
            ...req.body,
            order_ref, 
            user_id, 
            specs, 
            offer_print_house, 
            offer_price, 
            status 
        });
        const order = await getOrder(insertId);
        
        // Include marketplace_session_id if returned/injected
        res.status(201).json({ 
            ok: true, 
            order,
            marketplace_session_id: order?.marketplace_session_id || req.marketplaceSessionId || undefined
        });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ ok: false, error: `order_ref '${order_ref}' already exists` });
        }
        if (err.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(422).json({ ok: false, error: `user_id '${user_id}' does not exist` });
        }
        res.status(500).json({ ok: false, error: err.message });
    }
});

// PUT /api/admin/orders/:id
router.put('/:id', async (req, res) => {
    try {
        const updated = await updateOrder(req.params.id, req.body);
        if (!updated) return res.status(404).json({ ok: false, error: 'Order not found or no valid fields to update' });
        const order = await getOrder(req.params.id);
        res.json({ ok: true, order });
    } catch (err) {
        if (err.message.startsWith('Invalid status')) {
            return res.status(400).json({ ok: false, error: err.message });
        }
        res.status(500).json({ ok: false, error: err.message });
    }
});

// DELETE /api/admin/orders/:id
router.delete('/:id', async (req, res) => {
    try {
        const deleted = await deleteOrder(req.params.id);
        if (!deleted) return res.status(404).json({ ok: false, error: 'Order not found' });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
