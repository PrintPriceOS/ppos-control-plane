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

const router = express.Router();

// GET /api/admin/orders?status=pending&user_id=...&limit=50&offset=0
router.get('/', async (req, res) => {
    const { status, user_id, limit = 50, offset = 0 } = req.query;

    if (status && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ ok: false, error: `Invalid status. Valid values: ${VALID_STATUSES.join(', ')}` });
    }

    try {
        const result = await listOrders({
            status,
            user_id,
            limit: Math.min(Number(limit), 200),
            offset: Math.max(Number(offset), 0)
        });
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[ORDERS] Error listing orders:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// GET /api/admin/orders/ref/:order_ref
router.get('/ref/:order_ref', async (req, res) => {
    try {
        const order = await getOrderByRef(req.params.order_ref);
        if (!order) return res.status(404).json({ ok: false, error: 'Order not found' });
        res.json({ ok: true, order });
    } catch (err) {
        console.error('[ORDERS] Error fetching order by ref:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// GET /api/admin/orders/:id
router.get('/:id', async (req, res) => {
    try {
        const order = await getOrder(req.params.id);
        if (!order) return res.status(404).json({ ok: false, error: 'Order not found' });
        res.json({ ok: true, order });
    } catch (err) {
        console.error('[ORDERS] Error fetching order:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// POST /api/admin/orders
router.post('/', async (req, res) => {
    const { order_ref, user_id, specs, offer_print_house, offer_price, status } = req.body;

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
        const insertId = await createOrder({ order_ref, user_id, specs, offer_print_house, offer_price, status });
        const order = await getOrder(insertId);
        res.status(201).json({ ok: true, order });
    } catch (err) {
        console.error('[ORDERS] Error creating order:', err);
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
        console.error('[ORDERS] Error updating order:', err);
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
        console.error('[ORDERS] Error deleting order:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
