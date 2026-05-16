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
        console.log('[MARKETPLACE_ORDERS_LIST_REQUEST]', req.query);
        const result = await orderService.listOrders(req.query);
        return res.json(result);
    } catch (err) {
        console.error('[ADMIN-MARKETPLACE-ORDERS] Failed to list orders:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/marketplace/orders/audit
 * Returns a list of marketplace audit events.
 * Mounted under /orders so full path is /api/admin/marketplace/orders/audit
 */
router.get('/audit', async (req, res) => {
    try {
        const result = await orderService.listAuditEvents(req.query);
        return res.json(result);
    } catch (err) {
        console.error('[ADMIN-MARKETPLACE-ORDERS] Failed to list audit events:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/marketplace/orders/:id
 * Returns full details for a specific order intent, including audit timeline.
 */
router.get('/:id', async (req, res) => {
    try {
        console.log('[MARKETPLACE_ORDER_DETAIL_REQUEST]', req.params.id);
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
        console.log('[MARKETPLACE_ORDER_ACTION]', 'ACKNOWLEDGE', req.params.id);
        const actorId = req.user?.id || 'ADMIN';
        const result = await orderService.acknowledgeOrder(req.params.id, actorId);
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to acknowledge order ${req.params.id}:`, err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/assign-printhouse
 * Manually assign a printhouse to the marketplace order.
 */
router.post('/:id/assign-printhouse', async (req, res) => {
    try {
        console.log('[MARKETPLACE_ORDER_ACTION]', 'ASSIGN_PRINTHOUSE', req.params.id);
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
 * POST /api/admin/marketplace/orders/:id/mark-preflight-required
 * Flag the order as requiring preflight validation.
 */
router.post('/:id/mark-preflight-required', async (req, res) => {
    try {
        console.log('[MARKETPLACE_ORDER_ACTION]', 'MARK_PREFLIGHT_REQUIRED', req.params.id);
        const actorId = req.user?.id || 'ADMIN';
        const result = await orderService.markPreflightRequired(req.params.id, actorId);
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to mark preflight required for ${req.params.id}:`, err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/request-customer-action
 * Trigger a request for customer intervention (e.g., file re-upload).
 */
router.post('/:id/request-customer-action', async (req, res) => {
    try {
        console.log('[MARKETPLACE_ORDER_ACTION]', 'REQUEST_CUSTOMER_ACTION', req.params.id);
        const { actionType, message } = req.body;
        
        if (!actionType || !message) {
            return res.status(400).json({ ok: false, error: 'ACTION_TYPE_AND_MESSAGE_REQUIRED' });
        }

        const actorId = req.user?.id || 'ADMIN';
        const result = await orderService.requestCustomerAction(req.params.id, actionType, message, actorId);
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to request customer action for ${req.params.id}:`, err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/internal-note
 * Append an administrative note to the order.
 */
router.post('/:id/internal-note', async (req, res) => {
    try {
        console.log('[MARKETPLACE_ORDER_ACTION]', 'INTERNAL_NOTE', req.params.id);
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
