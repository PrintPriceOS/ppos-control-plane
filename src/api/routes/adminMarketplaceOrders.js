/**
 * src/api/routes/adminMarketplaceOrders.js
 * 
 * Administrative endpoints for Marketplace Order Intents (Public Intake).
 */
const express = require('express');
const router = express.Router();
const orderService = require('../services/marketplaceOrderService');

/**
 * GET /api/admin/marketplace/orders
 * Returns a list of normalized marketplace order intents.
 */
router.get('/', async (req, res) => {
    try {
        const result = await orderService.listOrders(req.query);
        return res.json(result);
    } catch (err) {
        console.error('[ADMIN-MARKETPLACE-ORDERS] Failed to list orders:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/marketplace/orders/:id
 * Returns full details for a specific order intent, including audit timeline.
 */
router.get('/:id', async (req, res) => {
    try {
        const result = await orderService.getOrderDetail(req.params.id);
        if (!result.ok) {
            return res.status(404).json(result);
        }
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to get order detail for ${req.params.id}:`, err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/acknowledge
 * Explicitly acknowledge a new marketplace order.
 */
router.post('/:id/acknowledge', async (req, res) => {
    try {
        const actorId = req.user?.id || 'ADMIN';
        const result = await orderService.acknowledgeOrder(req.params.id, actorId);
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to acknowledge order ${req.params.id}:`, err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/assign
 * Manually assign a printhouse to the marketplace order.
 */
router.post('/:id/assign', async (req, res) => {
    try {
        const { printhouseId } = req.body;
        if (!printhouseId) {
            return res.status(400).json({ ok: false, error: 'PRINTHOUSE_ID_REQUIRED' });
        }
        const actorId = req.user?.id || 'ADMIN';
        const result = await orderService.assignPrinthouse(req.params.id, printhouseId, actorId);
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to assign printhouse to order ${req.params.id}:`, err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/notes
 * Append an administrative note to the order.
 */
router.post('/:id/notes', async (req, res) => {
    try {
        const { note } = req.body;
        if (!note) {
            return res.status(400).json({ ok: false, error: 'NOTE_TEXT_REQUIRED' });
        }
        const actorId = req.user?.id || 'ADMIN';
        const result = await orderService.addNote(req.params.id, note, actorId);
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to add note to order ${req.params.id}:`, err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
