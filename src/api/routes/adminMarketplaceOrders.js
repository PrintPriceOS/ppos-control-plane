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
        console.log('[MARKETPLACE_ORDER_ACKNOWLEDGED]', req.params.id);
        const actorId = req.user?.id || req.session?.userId || 'break-glass-session';
        const result = await orderService.acknowledgeOrder(req.params.id, actorId);
        if (!result.ok) return res.status(400).json(result);
        const detail = await orderService.getOrderDetail(req.params.id);
        return res.json({ ok: true, order: detail.order });
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
        console.log('[MARKETPLACE_PRINTHOUSE_ASSIGNED]', req.params.id);
        const { printhouseId } = req.body;
        if (!printhouseId) {
            return res.status(400).json({ ok: false, error: 'PRINTHOUSE_ID_REQUIRED' });
        }
        const actorId = req.user?.id || req.session?.userId || 'break-glass-session';
        const result = await orderService.assignPrinthouse(req.params.id, printhouseId, actorId);
        if (!result.ok) return res.status(400).json(result);
        const detail = await orderService.getOrderDetail(req.params.id);
        return res.json({ ok: true, order: detail.order });
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
        console.log('[MARKETPLACE_PREFLIGHT_REQUIRED]', req.params.id);
        const actorId = req.user?.id || req.session?.userId || 'break-glass-session';
        const result = await orderService.markPreflightRequired(req.params.id, actorId);
        if (!result.ok) return res.status(400).json(result);
        const detail = await orderService.getOrderDetail(req.params.id);
        return res.json({ ok: true, order: detail.order });
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
        console.log('[MARKETPLACE_CUSTOMER_ACTION_REQUESTED]', req.params.id);
        const { actionType, message } = req.body;
        
        if (!actionType || !message) {
            return res.status(400).json({ ok: false, error: 'ACTION_TYPE_AND_MESSAGE_REQUIRED' });
        }

        const actorId = req.user?.id || req.session?.userId || 'break-glass-session';
        const result = await orderService.requestCustomerAction(req.params.id, actionType, message, actorId);
        if (!result.ok) return res.status(400).json(result);
        const detail = await orderService.getOrderDetail(req.params.id);
        return res.json({ ok: true, order: detail.order });
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
        console.log('[MARKETPLACE_NOTE_ADDED]', req.params.id);
        const { note } = req.body;
        if (!note) {
            return res.status(400).json({ ok: false, error: 'NOTE_TEXT_REQUIRED' });
        }
        const actorId = req.user?.id || req.session?.userId || 'break-glass-session';
        const result = await orderService.addNote(req.params.id, note, actorId);
        if (!result.ok) return res.status(400).json(result);
        const detail = await orderService.getOrderDetail(req.params.id);
        return res.json({ ok: true, order: detail.order });
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to add note to order ${req.params.id}:`, err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/preflight/run
 * Initiates or queues native/simulated preflight validation.
 */
router.post('/:id/preflight/run', async (req, res) => {
    try {
        console.log('[MARKETPLACE_PREFLIGHT_RUN_REQUESTED]', req.params.id);
        const actorId = req.user?.id || req.session?.userId || 'break-glass-session';
        const result = await orderService.runPreflight(req.params.id, actorId);
        if (!result.ok) {
            return res.status(400).json(result);
        }
        const detail = await orderService.getOrderDetail(req.params.id);
        return res.json({ ok: true, order: detail.order });
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to run preflight for ${req.params.id}:`, err);
        return res.status(500).json({ ok: false, error: 'PREFLIGHT_RUN_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/preflight/mark-required
 * Flag the order as requiring preflight validation.
 */
router.post('/:id/preflight/mark-required', async (req, res) => {
    try {
        console.log('[MARKETPLACE_PREFLIGHT_REQUIRED]', req.params.id);
        const actorId = req.user?.id || req.session?.userId || 'break-glass-session';
        const result = await orderService.markPreflightRequired(req.params.id, actorId);
        if (!result.ok) {
            return res.status(400).json(result);
        }
        const detail = await orderService.getOrderDetail(req.params.id);
        return res.json({ ok: true, order: detail.order });
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to mark preflight required for ${req.params.id}:`, err);
        return res.status(500).json({ ok: false, error: 'PREFLIGHT_MARK_REQUIRED_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/preflight/mark-passed
 * Map to manual review override.
 */
router.post('/:id/preflight/mark-passed', async (req, res) => {
    try {
        console.log('[MARKETPLACE_PREFLIGHT_PASSED_MAP_TO_OVERRIDE]', req.params.id);
        const actorId = req.user?.id || req.session?.userId || 'break-glass-session';
        const result = await orderService.manualReviewOverride(req.params.id, actorId);
        if (!result.ok) {
            return res.status(400).json(result);
        }
        const detail = await orderService.getOrderDetail(req.params.id);
        return res.json({ ok: true, order: detail.order });
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to pass preflight for ${req.params.id}:`, err);
        return res.status(500).json({ ok: false, error: 'PREFLIGHT_MARK_PASSED_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/preflight/mark-failed
 * Map to manual review override.
 */
router.post('/:id/preflight/mark-failed', async (req, res) => {
    try {
        console.log('[MARKETPLACE_PREFLIGHT_FAILED_MAP_TO_OVERRIDE]', req.params.id);
        const actorId = req.user?.id || req.session?.userId || 'break-glass-session';
        const result = await orderService.manualReviewOverride(req.params.id, actorId);
        if (!result.ok) {
            return res.status(400).json(result);
        }
        const detail = await orderService.getOrderDetail(req.params.id);
        return res.json({ ok: true, order: detail.order });
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to fail preflight for ${req.params.id}:`, err);
        return res.status(500).json({ ok: false, error: 'PREFLIGHT_MARK_FAILED_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/preflight/manual-override
 * Explicit manual review override.
 */
router.post('/:id/preflight/manual-override', async (req, res) => {
    try {
        console.log('[MARKETPLACE_PREFLIGHT_MANUAL_OVERRIDE]', req.params.id);
        const actorId = req.user?.id || req.session?.userId || 'break-glass-session';
        const result = await orderService.manualReviewOverride(req.params.id, actorId);
        if (!result.ok) {
            return res.status(400).json(result);
        }
        const detail = await orderService.getOrderDetail(req.params.id);
        return res.json({ ok: true, order: detail.order });
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to override preflight for ${req.params.id}:`, err);
        return res.status(500).json({ ok: false, error: 'PREFLIGHT_MANUAL_OVERRIDE_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/payment/mark-ready
 * Flag payment readiness state.
 */
router.post('/:id/payment/mark-ready', async (req, res) => {
    if (process.env.PPOS_ENABLE_PHASE37_PAYMENT !== 'true') {
        return res.status(501).json({
            ok: false,
            error: 'PHASE_NOT_ENABLED',
            message: 'Phase 37.1 Marketplace Payment Integration is not enabled.'
        });
    }
    try {
        console.log('[MARKETPLACE_PAYMENT_READY]', req.params.id);
        const actorId = req.user?.id || req.session?.userId || 'break-glass-session';
        const result = await orderService.markPaymentReady(req.params.id, actorId);
        if (!result.ok) {
            return res.status(400).json(result);
        }
        const detail = await orderService.getOrderDetail(req.params.id);
        return res.json({ ok: true, order: detail.order });
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to mark payment ready for ${req.params.id}:`, err);
        return res.status(500).json({ ok: false, error: 'PAYMENT_READY_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/payment/mark-blocked
 * Block payment gate state.
 */
router.post('/:id/payment/mark-blocked', async (req, res) => {
    if (process.env.PPOS_ENABLE_PHASE37_PAYMENT !== 'true') {
        return res.status(501).json({
            ok: false,
            error: 'PHASE_NOT_ENABLED',
            message: 'Phase 37.1 Marketplace Payment Integration is not enabled.'
        });
    }
    try {
        console.log('[MARKETPLACE_PAYMENT_BLOCKED]', req.params.id);
        const actorId = req.user?.id || req.session?.userId || 'break-glass-session';
        
        // Enforce body validation: requires reason
        const { reason } = req.body || {};
        if (!reason) {
            return res.status(400).json({ ok: false, error: 'REASON_REQUIRED', message: 'Payment block override requires a blocking reason.' });
        }
        
        const result = await orderService.markPaymentBlocked(req.params.id, reason, actorId);
        if (!result.ok) {
            return res.status(400).json(result);
        }
        const detail = await orderService.getOrderDetail(req.params.id);
        return res.json({ ok: true, order: detail.order });
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to block payment gate for ${req.params.id}:`, err);
        return res.status(500).json({ ok: false, error: 'PAYMENT_BLOCKED_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/handoff/prepare
 * Compile production bundle files.
 */
router.post('/:id/handoff/prepare', async (req, res) => {
    if (process.env.PPOS_ENABLE_PHASE38_HANDOFF !== 'true') {
        return res.status(501).json({
            ok: false,
            error: 'PHASE_NOT_ENABLED',
            message: 'Phase 38.1 Printhouse Handoff and MES Dispatch Integration is not enabled.'
        });
    }
    try {
        console.log('[MARKETPLACE_HANDOFF_PREPARED]', req.params.id);
        const actorId = req.user?.id || req.session?.userId || 'break-glass-session';
        const result = await orderService.prepareHandoff(req.params.id, actorId);
        if (!result.ok) {
            return res.status(400).json(result);
        }
        const detail = await orderService.getOrderDetail(req.params.id);
        return res.json({ ok: true, order: detail.order });
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to prepare handoff for ${req.params.id}:`, err);
        return res.status(500).json({ ok: false, error: 'HANDOFF_PREPARE_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/handoff/mark-ready
 * Flag handoff state as ready for printhouse.
 */
router.post('/:id/handoff/mark-ready', async (req, res) => {
    if (process.env.PPOS_ENABLE_PHASE38_HANDOFF !== 'true') {
        return res.status(501).json({
            ok: false,
            error: 'PHASE_NOT_ENABLED',
            message: 'Phase 38.1 Printhouse Handoff and MES Dispatch Integration is not enabled.'
        });
    }
    try {
        console.log('[MARKETPLACE_HANDOFF_READY]', req.params.id);
        const actorId = req.user?.id || req.session?.userId || 'break-glass-session';
        const result = await orderService.markHandoffReady(req.params.id, actorId);
        if (!result.ok) {
            return res.status(400).json(result);
        }
        const detail = await orderService.getOrderDetail(req.params.id);
        return res.json({ ok: true, order: detail.order });
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to mark handoff ready for ${req.params.id}:`, err);
        return res.status(500).json({ ok: false, error: 'HANDOFF_READY_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/preflight/bind
 * Resolves uploaded marketplace files, runs preflight analysis, and binds the jobs.
 */
router.post('/:id/preflight/bind', async (req, res) => {
    try {
        console.log('[MARKETPLACE_PREFLIGHT_BIND_REQUESTED]', req.params.id);
        const bindingService = require('../services/marketplacePreflightBindingService');
        
        const options = {
            policy: req.body?.policy || req.query?.policy || '',
            operatorId: req.user?.id || req.session?.userId || 'break-glass-session',
            traceId: req.headers['x-trace-id'] || req.body?.traceId || '',
            requestId: req.headers['x-request-id'] || req.body?.requestId || ''
        };

        const result = await bindingService.bindPreflightFromMarketplaceFiles(req.params.id, options);
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to bind preflight files for ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        return res.status(500).json({ ok: false, error: 'PREFLIGHT_BIND_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/invoice/evaluate
 * Evaluates the marketplace invoice gate based on preflight outcome state.
 */
router.post('/:id/invoice/evaluate', async (req, res) => {
    try {
        console.log('[MARKETPLACE_INVOICE_EVALUATE_REQUESTED]', req.params.id);
        const invoiceGateService = require('../services/marketplaceInvoiceGateService');
        const options = {
            evaluatedBy: req.user?.id || req.session?.userId || 'break-glass-session'
        };
        const result = await invoiceGateService.evaluateMarketplaceInvoiceGate(req.params.id, options);
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to evaluate invoice gate for ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        return res.status(500).json({ ok: false, error: 'INVOICE_EVALUATE_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/invoice/generate
 * Phase 37.1 — Evaluates invoice gate, issues invoice, and creates bank-transfer
 * payment instructions in one atomic call.
 *
 * Replaces the Phase 36.5 stub.  Requires PPOS_ENABLE_PHASE37_PAYMENT=true.
 *
 * Returns HTTP 422 INVOICE_BLOCKED if the order is not ready.
 */
router.post('/:id/invoice/generate', async (req, res) => {
    try {
        console.log('[MARKETPLACE_INVOICE_GENERATE_REQUESTED]', req.params.id);
        const invoicePaymentService = require('../services/marketplaceInvoicePaymentService');
        const options = {
            issuedBy: req.user?.id || req.session?.userId || 'break-glass-session',
            operatorId: req.user?.id || req.session?.userId || 'break-glass-session'
        };
        // generateMarketplaceInvoice + requestMarketplacePaymentLink chained
        const result = await invoicePaymentService.requestMarketplacePaymentLink(req.params.id, options);

        if (result.ok === false && result.error === 'INVOICE_BLOCKED') {
            return res.status(422).json(result);
        }
        if (result.ok === false) {
            return res.status(400).json(result);
        }
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to generate invoice for ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        if (err.code === 'PHASE37_PAYMENT_DISABLED' || err.message === 'PHASE37_PAYMENT_DISABLED') {
            return res.status(403).json({ ok: false, error: 'PHASE37_PAYMENT_DISABLED', message: 'Set PPOS_ENABLE_PHASE37_PAYMENT=true to enable Phase 37.1 invoice/payment operations.' });
        }
        return res.status(500).json({ ok: false, error: 'INVOICE_GENERATE_ERROR', message: err.message });
    }
});

/**
 * GET /api/admin/marketplace/orders/:id/invoice/status
 * Phase 37.1 — Returns sanitized invoice + payment state.
 * Read access; does NOT require PPOS_ENABLE_PHASE37_PAYMENT flag.
 */
router.get('/:id/invoice/status', async (req, res) => {
    try {
        console.log('[MARKETPLACE_INVOICE_STATUS_REQUESTED]', req.params.id);
        const invoicePaymentService = require('../services/marketplaceInvoicePaymentService');
        const result = await invoicePaymentService.getMarketplaceInvoicePaymentStatus(req.params.id);
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to get invoice status for ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        return res.status(500).json({ ok: false, error: 'INVOICE_STATUS_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/payment/request-link
 * Phase 37.1 — Idempotently creates or returns bank-transfer payment instructions.
 * Requires PPOS_ENABLE_PHASE37_PAYMENT=true.
 */
router.post('/:id/payment/request-link', async (req, res) => {
    try {
        console.log('[MARKETPLACE_PAYMENT_LINK_REQUESTED]', req.params.id);
        const invoicePaymentService = require('../services/marketplaceInvoicePaymentService');
        const options = {
            requestedBy: req.user?.id || req.session?.userId || 'break-glass-session',
            operatorId: req.user?.id || req.session?.userId || 'break-glass-session'
        };
        const result = await invoicePaymentService.requestMarketplacePaymentLink(req.params.id, options);
        if (result.ok === false && result.error === 'INVOICE_BLOCKED') {
            return res.status(422).json(result);
        }
        if (result.ok === false) {
            return res.status(400).json(result);
        }
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to request payment link for ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        if (err.code === 'PHASE37_PAYMENT_DISABLED' || err.message === 'PHASE37_PAYMENT_DISABLED') {
            return res.status(403).json({ ok: false, error: 'PHASE37_PAYMENT_DISABLED', message: 'Set PPOS_ENABLE_PHASE37_PAYMENT=true to enable Phase 37.1 invoice/payment operations.' });
        }
        return res.status(500).json({ ok: false, error: 'PAYMENT_LINK_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/payment/mark-confirmed
 * Phase 37.1 — Manual/admin confirmation of bank transfer payment.
 * Requires PPOS_ENABLE_PHASE37_PAYMENT=true.
 */
router.post('/:id/payment/mark-confirmed', async (req, res) => {
    try {
        console.log('[MARKETPLACE_PAYMENT_CONFIRM_REQUESTED]', req.params.id);
        const invoicePaymentService = require('../services/marketplaceInvoicePaymentService');
        const payload = {
            providerReference: req.body?.providerReference || req.body?.provider_reference || null,
            confirmedBy: req.user?.id || req.session?.userId || 'break-glass-session'
        };
        const options = {
            operatorId: req.user?.id || req.session?.userId || 'break-glass-session'
        };
        const result = await invoicePaymentService.markMarketplacePaymentConfirmed(req.params.id, payload, options);
        if (result.ok === false) {
            return res.status(400).json(result);
        }
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to confirm payment for ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        if (err.code === 'PHASE37_PAYMENT_DISABLED' || err.message === 'PHASE37_PAYMENT_DISABLED') {
            return res.status(403).json({ ok: false, error: 'PHASE37_PAYMENT_DISABLED', message: 'Set PPOS_ENABLE_PHASE37_PAYMENT=true to enable Phase 37.1 invoice/payment operations.' });
        }
        return res.status(500).json({ ok: false, error: 'PAYMENT_CONFIRM_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/remediation/request
 * Initiates remediation request for the order intent.
 */
router.post('/:id/remediation/request', async (req, res) => {
    try {
        console.log('[MARKETPLACE_REMEDIATION_REQUESTED]', req.params.id);
        const remediationService = require('../services/marketplaceRemediationService');
        const payload = req.body || {};
        const options = {
            operatorId: req.user?.id || req.session?.userId || 'break-glass-session',
            traceId: req.headers['x-trace-id'] || req.headers['trace-id'] || '',
            requestId: req.headers['x-request-id'] || req.headers['request-id'] || ''
        };
        const result = await remediationService.requestRemediation(req.params.id, payload, options);
        if (result.ok === false) {
            if (result.error === 'REMEDIATION_NOT_REQUIRED') {
                return res.status(422).json(result);
            }
            return res.status(400).json(result);
        }
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to request remediation for ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        return res.status(500).json({ ok: false, error: 'REMEDIATION_REQUEST_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/remediation/reupload
 * Registers a metadata reupload for remediation.
 */
router.post('/:id/remediation/reupload', async (req, res) => {
    try {
        console.log('[MARKETPLACE_REMEDIATION_REUPLOAD_REGISTERED]', req.params.id);
        const remediationService = require('../services/marketplaceRemediationService');
        const payload = req.body || {};
        const options = {
            operatorId: req.user?.id || req.session?.userId || 'break-glass-session',
            traceId: req.headers['x-trace-id'] || req.headers['trace-id'] || '',
            requestId: req.headers['x-request-id'] || req.headers['request-id'] || ''
        };
        const result = await remediationService.registerRemediationUpload(req.params.id, payload, options);
        if (result.ok === false) {
            return res.status(400).json(result);
        }
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to register remediation reupload for ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        return res.status(500).json({ ok: false, error: 'REMEDIATION_REUPLOAD_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/remediation/run
 * Runs preflight binding and invoice gate cycle to resolve remediation.
 */
router.post('/:id/remediation/run', async (req, res) => {
    try {
        console.log('[MARKETPLACE_REMEDIATION_CYCLE_RUN]', req.params.id);
        const remediationService = require('../services/marketplaceRemediationService');
        const options = {
            operatorId: req.user?.id || req.session?.userId || 'break-glass-session',
            traceId: req.headers['x-trace-id'] || req.headers['trace-id'] || '',
            requestId: req.headers['x-request-id'] || req.headers['request-id'] || ''
        };
        const result = await remediationService.runRemediationCycle(req.params.id, options);
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to run remediation cycle for ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        return res.status(500).json({ ok: false, error: 'REMEDIATION_CYCLE_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/customer-action/create
 * Creates a customer action for remediation-blocked orders (Phase 36.7).
 */
router.post('/:id/customer-action/create', async (req, res) => {
    try {
        console.log('[MARKETPLACE_CUSTOMER_ACTION_CREATE]', req.params.id);
        const customerActionService = require('../services/marketplaceCustomerActionService');
        const payload = req.body || {};
        const options = {
            operatorId: req.user?.id || req.session?.userId || 'break-glass-session',
            traceId: req.headers['x-trace-id'] || req.headers['trace-id'] || '',
            requestId: req.headers['x-request-id'] || req.headers['request-id'] || ''
        };
        const result = await customerActionService.createCustomerAction(req.params.id, payload, options);
        if (result.ok === false) {
            return res.status(422).json(result);
        }
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to create customer action for ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        return res.status(500).json({ ok: false, error: 'CUSTOMER_ACTION_CREATE_ERROR', message: err.message });
    }
});

/**
 * GET /api/admin/marketplace/orders/:id/customer-action
 * Returns the current customer action state for an order (Phase 36.7).
 */
router.get('/:id/customer-action', async (req, res) => {
    try {
        console.log('[MARKETPLACE_CUSTOMER_ACTION_GET]', req.params.id);
        const customerActionService = require('../services/marketplaceCustomerActionService');
        const result = await customerActionService.getCustomerAction(req.params.id);
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to get customer action for ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        return res.status(500).json({ ok: false, error: 'CUSTOMER_ACTION_GET_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/customer-action/mark-notified
 * Marks the customer action as notified (Phase 36.7).
 */
router.post('/:id/customer-action/mark-notified', async (req, res) => {
    try {
        console.log('[MARKETPLACE_CUSTOMER_ACTION_MARK_NOTIFIED]', req.params.id);
        const customerActionService = require('../services/marketplaceCustomerActionService');
        const options = {
            operatorId: req.user?.id || req.session?.userId || 'break-glass-session'
        };
        const result = await customerActionService.markCustomerActionNotified(req.params.id, options);
        if (result.ok === false) {
            return res.status(422).json(result);
        }
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to mark customer action notified for ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        return res.status(500).json({ ok: false, error: 'CUSTOMER_ACTION_NOTIFY_ERROR', message: err.message });
    }
});

module.exports = router;

