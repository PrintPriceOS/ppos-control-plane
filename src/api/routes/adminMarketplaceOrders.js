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

/**
 * GET /api/admin/marketplace/orders/:id/production-unlock/status
 * Phase 37.4 — Returns production unlock status. Read-only.
 */
router.get('/:id/production-unlock/status', async (req, res) => {
    try {
        console.log('[PRODUCTION_UNLOCK_STATUS_REQUESTED]', req.params.id);
        const unlockService = require('../services/marketplaceProductionUnlockService');
        const result = await unlockService.getProductionUnlockStatus(req.params.id);
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to get production unlock status for ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        return res.status(500).json({ ok: false, error: 'PRODUCTION_UNLOCK_STATUS_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/production-unlock/evaluate
 * Phase 37.4 — Evaluates production unlock readiness. Read-only (no state mutation, just audit logs).
 */
router.post('/:id/production-unlock/evaluate', async (req, res) => {
    try {
        console.log('[PRODUCTION_UNLOCK_EVALUATE_REQUESTED]', req.params.id);
        const unlockService = require('../services/marketplaceProductionUnlockService');
        const options = {
            operatorId: req.user?.id || req.session?.userId || 'break-glass-session'
        };
        const result = await unlockService.evaluateProductionUnlock(req.params.id, options);
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to evaluate production unlock for ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        return res.status(500).json({ ok: false, error: 'PRODUCTION_UNLOCK_EVALUATE_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/production-unlock/execute
 * Phase 37.4 — Unlocks production and marks HANDOFF_READY if all conditions are met.
 * Requires PPOS_ENABLE_PHASE37_PRODUCTION_UNLOCK=true
 */
router.post('/:id/production-unlock/execute', async (req, res) => {
    if (process.env.PPOS_ENABLE_PHASE37_PRODUCTION_UNLOCK !== 'true') {
        return res.status(403).json({
            ok: false,
            error: 'PHASE37_PRODUCTION_UNLOCK_DISABLED',
            message: 'Set PPOS_ENABLE_PHASE37_PRODUCTION_UNLOCK=true to enable Phase 37.4 production unlock operations.'
        });
    }

    try {
        console.log('[PRODUCTION_UNLOCK_EXECUTE_REQUESTED]', req.params.id);
        const unlockService = require('../services/marketplaceProductionUnlockService');
        const options = {
            operatorId: req.user?.id || req.session?.userId || 'break-glass-session'
        };
        const result = await unlockService.unlockProductionAfterPayment(req.params.id, options);

        if (result.ok === false && result.error === 'PRODUCTION_UNLOCK_BLOCKED') {
            return res.status(422).json(result);
        }
        if (result.ok === false) {
            return res.status(400).json(result);
        }
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to execute production unlock for ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        return res.status(500).json({ ok: false, error: 'PRODUCTION_UNLOCK_EXECUTE_ERROR', message: err.message });
    }
});

/**
 * GET /api/admin/marketplace/orders/:id/dispatch-package/status
 * Phase 37.5 — Returns dispatch package status. Read-only.
 */
router.get('/:id/dispatch-package/status', async (req, res) => {
    try {
        console.log('[DISPATCH_PACKAGE_STATUS_REQUESTED]', req.params.id);
        const dispatchService = require('../services/marketplaceDispatchPackageService');
        const result = await dispatchService.getDispatchPackageStatus(req.params.id);
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to get dispatch package status for ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        return res.status(500).json({ ok: false, error: 'DISPATCH_PACKAGE_STATUS_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/dispatch-package/evaluate
 * Phase 37.5 — Evaluates dispatch package readiness. Read-only (no state mutation, just audit logs).
 */
router.post('/:id/dispatch-package/evaluate', async (req, res) => {
    try {
        console.log('[DISPATCH_PACKAGE_EVALUATE_REQUESTED]', req.params.id);
        const dispatchService = require('../services/marketplaceDispatchPackageService');
        const options = {
            operatorId: req.user?.id || req.session?.userId || 'break-glass-session'
        };
        const result = await dispatchService.evaluateDispatchPackageReadiness(req.params.id, options);
        // Exclude the bulky objects from the HTTP response
        const { files, metadata, currentOrder, selectedOffer, ...sanitizedResult } = result;
        return res.json(sanitizedResult);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to evaluate dispatch package for ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        return res.status(500).json({ ok: false, error: 'DISPATCH_PACKAGE_EVALUATE_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/dispatch-package/create
 * Phase 37.5 — Creates governed dispatch package and marks PRINTHOUSE_HANDOFF_READY if all conditions are met.
 * Requires PPOS_ENABLE_PHASE37_DISPATCH_PACKAGE=true
 */
router.post('/:id/dispatch-package/create', async (req, res) => {
    if (process.env.PPOS_ENABLE_PHASE37_DISPATCH_PACKAGE !== 'true') {
        return res.status(403).json({
            ok: false,
            error: 'PHASE37_DISPATCH_PACKAGE_DISABLED',
            message: 'Set PPOS_ENABLE_PHASE37_DISPATCH_PACKAGE=true to enable Phase 37.5 dispatch package operations.'
        });
    }

    try {
        console.log('[DISPATCH_PACKAGE_CREATE_REQUESTED]', req.params.id);
        const dispatchService = require('../services/marketplaceDispatchPackageService');
        const options = {
            operatorId: req.user?.id || req.session?.userId || 'break-glass-session'
        };
        const result = await dispatchService.createDispatchPackage(req.params.id, options);

        if (result.ok === false && result.error === 'DISPATCH_PACKAGE_BLOCKED') {
            return res.status(422).json(result);
        }
        if (result.ok === false) {
            return res.status(400).json(result);
        }
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to create dispatch package for ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        return res.status(500).json({ ok: false, error: 'DISPATCH_PACKAGE_CREATE_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/dispatch-package/acknowledge
 * Phase 37.5 — Marks an existing dispatch package as acknowledged.
 * Requires PPOS_ENABLE_PHASE37_DISPATCH_PACKAGE=true
 */
router.post('/:id/dispatch-package/acknowledge', async (req, res) => {
    if (process.env.PPOS_ENABLE_PHASE37_DISPATCH_PACKAGE !== 'true') {
        return res.status(403).json({
            ok: false,
            error: 'PHASE37_DISPATCH_PACKAGE_DISABLED',
            message: 'Set PPOS_ENABLE_PHASE37_DISPATCH_PACKAGE=true to enable Phase 37.5 dispatch package operations.'
        });
    }

    try {
        console.log('[DISPATCH_PACKAGE_ACKNOWLEDGE_REQUESTED]', req.params.id);
        const dispatchService = require('../services/marketplaceDispatchPackageService');
        const options = {
            operatorId: req.user?.id || req.session?.userId || 'break-glass-session'
        };
        const payload = req.body || {};
        const result = await dispatchService.markDispatchPackageAcknowledged(req.params.id, payload, options);

        if (result.ok === false) {
            return res.status(400).json(result);
        }
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to acknowledge dispatch package for ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        return res.status(500).json({ ok: false, error: 'DISPATCH_PACKAGE_ACKNOWLEDGE_ERROR', message: err.message });
    }
});

/**
 * GET /api/admin/marketplace/orders/:id/printhouse-handoff
 * Phase 38.1 — Returns full sanitized dispatch package manifest.
 */
router.get('/:id/printhouse-handoff', async (req, res) => {
    try {
        console.log('[PRINTHOUSE_HANDOFF_GET_REQUESTED]', req.params.id);
        const handoffService = require('../services/marketplacePrinthouseHandoffService');
        const result = await handoffService.getPrinthouseHandoffPackage(req.params.id);
        if (result.ok === false && result.error === 'HANDOFF_PACKAGE_NOT_FOUND') {
            return res.status(404).json(result);
        }
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to get handoff package for ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        return res.status(500).json({ ok: false, error: 'PRINTHOUSE_HANDOFF_GET_ERROR', message: err.message });
    }
});

/**
 * GET /api/admin/marketplace/orders/:id/printhouse-handoff/timeline
 * Phase 38.1 — Returns handoff/dispatch related events.
 */
router.get('/:id/printhouse-handoff/timeline', async (req, res) => {
    try {
        console.log('[PRINTHOUSE_HANDOFF_TIMELINE_REQUESTED]', req.params.id);
        const handoffService = require('../services/marketplacePrinthouseHandoffService');
        const result = await handoffService.getPrinthouseHandoffTimeline(req.params.id);
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to get handoff timeline for ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        return res.status(500).json({ ok: false, error: 'PRINTHOUSE_HANDOFF_TIMELINE_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/printhouse-handoff/accept
 * Phase 38.1 — Accepts a handoff package.
 */
router.post('/:id/printhouse-handoff/accept', async (req, res) => {
    if (process.env.PPOS_ENABLE_PHASE38_PRINTHOUSE_HANDOFF !== 'true') {
        return res.status(403).json({ ok: false, error: 'PHASE38_PRINTHOUSE_HANDOFF_DISABLED', message: 'Set PPOS_ENABLE_PHASE38_PRINTHOUSE_HANDOFF=true to enable.' });
    }
    try {
        console.log('[PRINTHOUSE_HANDOFF_ACCEPT_REQUESTED]', req.params.id);
        const handoffService = require('../services/marketplacePrinthouseHandoffService');
        const options = { operatorId: req.user?.id || req.session?.userId || 'break-glass-session' };
        const result = await handoffService.acceptPrinthouseHandoff(req.params.id, req.body || {}, options);
        if (result.ok === false) {
            return res.status(400).json(result);
        }
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to accept handoff package for ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        return res.status(500).json({ ok: false, error: 'PRINTHOUSE_HANDOFF_ACCEPT_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/printhouse-handoff/reject
 * Phase 38.1 — Rejects a handoff package (requires reason).
 */
router.post('/:id/printhouse-handoff/reject', async (req, res) => {
    if (process.env.PPOS_ENABLE_PHASE38_PRINTHOUSE_HANDOFF !== 'true') {
        return res.status(403).json({ ok: false, error: 'PHASE38_PRINTHOUSE_HANDOFF_DISABLED', message: 'Set PPOS_ENABLE_PHASE38_PRINTHOUSE_HANDOFF=true to enable.' });
    }
    try {
        console.log('[PRINTHOUSE_HANDOFF_REJECT_REQUESTED]', req.params.id);
        const handoffService = require('../services/marketplacePrinthouseHandoffService');
        const options = { operatorId: req.user?.id || req.session?.userId || 'break-glass-session' };
        const result = await handoffService.rejectPrinthouseHandoff(req.params.id, req.body || {}, options);
        if (result.ok === false) {
            return res.status(400).json(result);
        }
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to reject handoff package for ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        return res.status(500).json({ ok: false, error: 'PRINTHOUSE_HANDOFF_REJECT_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/printhouse-handoff/clarification-request
 * Phase 38.1 — Requests clarification on a handoff package (requires message).
 */
router.post('/:id/printhouse-handoff/clarification-request', async (req, res) => {
    if (process.env.PPOS_ENABLE_PHASE38_PRINTHOUSE_HANDOFF !== 'true') {
        return res.status(403).json({ ok: false, error: 'PHASE38_PRINTHOUSE_HANDOFF_DISABLED', message: 'Set PPOS_ENABLE_PHASE38_PRINTHOUSE_HANDOFF=true to enable.' });
    }
    try {
        console.log('[PRINTHOUSE_HANDOFF_CLARIFICATION_REQUESTED]', req.params.id);
        const handoffService = require('../services/marketplacePrinthouseHandoffService');
        const options = { operatorId: req.user?.id || req.session?.userId || 'break-glass-session' };
        const result = await handoffService.requestHandoffClarification(req.params.id, req.body || {}, options);
        if (result.ok === false) {
            return res.status(400).json(result);
        }
        return res.json(result);
    } catch (err) {
        console.error(`[ADMIN-MARKETPLACE-ORDERS] Failed to request clarification for handoff package ${req.params.id}:`, err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} could not be found` });
        }
        return res.status(500).json({ ok: false, error: 'PRINTHOUSE_HANDOFF_CLARIFICATION_ERROR', message: err.message });
    }
});

/**
 * GET /api/admin/marketplace/orders/:id/printhouse-handoff/files
 * Phase 38.3.1 — Read-only list of sanitized manifest files.
 */
router.get('/:id/printhouse-handoff/files', async (req, res) => {
    try {
        const fileAccessService = require('../services/marketplacePrinthouseFileAccessService');
        const files = await fileAccessService.listPackageFiles(req.params.id);
        return res.json({ ok: true, files });
    } catch (err) {
        if (err.message === 'ORDER_NOT_FOUND' || err.message === 'HANDOFF_PACKAGE_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: err.message });
        }
        return res.status(500).json({ ok: false, error: 'PRINTHOUSE_FILE_LIST_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/printhouse-handoff/files/:fileId/access-token
 * Phase 38.3.1 — Generates a short-lived file access token.
 */
router.post('/:id/printhouse-handoff/files/:fileId/access-token', async (req, res) => {
    try {
        const fileAccessService = require('../services/marketplacePrinthouseFileAccessService');
        const options = { connection: req.transactionConnection };
        const payload = { actor: req.user?.id || req.session?.userId || 'control-plane-admin', ...req.body };
        const result = await fileAccessService.createPrinthouseFileAccessToken(req.params.id, req.params.fileId, payload, options);
        return res.json(result);
    } catch (err) {
        if (err.message === 'PHASE38_SECURE_FILE_ACCESS_DISABLED') {
            return res.status(403).json({ ok: false, error: err.message });
        }
        if (err.message === 'PACKAGE_NOT_ELIGIBLE_FOR_FILE_ACCESS' || err.message === 'FILE_NOT_IN_DISPATCH_PACKAGE' || err.message === 'FILE_SUPERSEDED') {
            return res.status(400).json({ ok: false, error: err.message });
        }
        if (err.message === 'ORDER_NOT_FOUND') return res.status(404).json({ ok: false, error: err.message });
        return res.status(500).json({ ok: false, error: 'TOKEN_CREATION_ERROR', message: err.message });
    }
});

/**
 * GET /api/admin/marketplace/orders/:id/printhouse-handoff/files/:fileId/download-descriptor
 * Phase 38.3.1 — Returns a sanitized download descriptor.
 */
router.get('/:id/printhouse-handoff/files/:fileId/download-descriptor', async (req, res) => {
    try {
        const token = req.query.token;
        if (!token) return res.status(400).json({ ok: false, error: 'MISSING_TOKEN' });

        const fileAccessService = require('../services/marketplacePrinthouseFileAccessService');
        const actor = req.user?.id || req.session?.userId || 'control-plane-admin';
        const descriptor = await fileAccessService.getPrinthouseFileDownloadDescriptor(req.params.id, req.params.fileId, token, { actor });
        return res.json(descriptor);
    } catch (err) {
        if (err.message.includes('INVALID') || err.message.includes('EXPIRED') || err.message.includes('REVOKED') || err.message.includes('EXCEEDED')) {
            return res.status(403).json({ ok: false, error: err.message });
        }
        if (err.message === 'PACKAGE_NOT_ELIGIBLE_FOR_FILE_ACCESS' || err.message === 'FILE_NOT_IN_DISPATCH_PACKAGE' || err.message === 'FILE_SUPERSEDED') {
            return res.status(400).json({ ok: false, error: err.message });
        }
        return res.status(500).json({ ok: false, error: 'DESCRIPTOR_ERROR', message: err.message });
    }
});

/**
 * GET /api/admin/marketplace/orders/:id/printhouse-handoff/files/:fileId/download
 * Phase 38.3.1 — Consumes token and attempts download.
 */
router.get('/:id/printhouse-handoff/files/:fileId/download', async (req, res) => {
    try {
        const token = req.query.token;
        if (!token) return res.status(400).json({ ok: false, error: 'MISSING_TOKEN' });

        const fileAccessService = require('../services/marketplacePrinthouseFileAccessService');
        
        // Validate and consume the token
        const context = await fileAccessService.validatePrinthouseFileAccessToken(token, { consume: true });
        
        // Double check it matches the route params
        if (context.orderId !== req.params.id || context.file.fileId !== req.params.fileId) {
            await fileAccessService.recordPrinthouseFileAccessEvent(req.params.id, req.params.fileId, 'PRINTHOUSE_FILE_DOWNLOAD_DENIED', { reason: 'Order/File mismatch', tokenPreview: context.tokenData.tokenPreview });
            return res.status(403).json({ ok: false, error: 'FILE_ACCESS_TOKEN_INVALID' });
        }

        // Get descriptor to return alongside the 501 or for reference
        const descriptor = await fileAccessService.getPrinthouseFileDownloadDescriptor(req.params.id, req.params.fileId, context, { actor: 'download-agent' });
        
        // Log started
        await fileAccessService.recordPrinthouseFileAccessEvent(req.params.id, req.params.fileId, 'PRINTHOUSE_FILE_DOWNLOAD_STARTED', { tokenPreview: context.tokenData.tokenPreview });

        const fs = require('fs');
        
        try {
            const resolvedPath = await fileAccessService.resolvePrinthouseFileStorage(req.params.id, req.params.fileId, context);
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${descriptor.originalName.replace(/"/g, '')}"`);
            res.setHeader('X-PPOS-File-Access', 'governed');
            res.setHeader('Cache-Control', 'no-store');

            const stream = fs.createReadStream(resolvedPath);
            stream.pipe(res);
            
            stream.on('end', async () => {
                await fileAccessService.recordPrinthouseFileAccessEvent(req.params.id, req.params.fileId, 'PRINTHOUSE_FILE_DOWNLOAD_COMPLETED', { tokenPreview: context.tokenData.tokenPreview });
            });
            stream.on('error', async (err) => {
                await fileAccessService.recordPrinthouseFileAccessEvent(req.params.id, req.params.fileId, 'PRINTHOUSE_FILE_DOWNLOAD_DENIED', { reason: 'Stream error', tokenPreview: context.tokenData.tokenPreview });
                if (!res.headersSent) {
                    res.status(500).json({ ok: false, error: 'STREAM_ERROR' });
                }
            });
            return; // response handled by stream
            
        } catch (storageErr) {
            await fileAccessService.recordPrinthouseFileAccessEvent(req.params.id, req.params.fileId, 'PRINTHOUSE_FILE_DOWNLOAD_COMPLETED', { tokenPreview: context.tokenData.tokenPreview, simulated: true, outcome: storageErr.message });
            
            if (storageErr.message === 'FILE_STREAMING_NOT_CONFIGURED' || storageErr.message === 'FILE_NOT_FOUND_IN_STORAGE' || storageErr.message === 'FILE_STORAGE_NOT_RESOLVED') {
                return res.status(501).json({ ok: false, error: storageErr.message, orderId: req.params.id, fileId: req.params.fileId, descriptor });
            }
            throw storageErr;
        }

    } catch (err) {
        if (err.message.includes('INVALID') || err.message.includes('EXPIRED') || err.message.includes('REVOKED') || err.message.includes('EXCEEDED')) {
            const fileAccessService = require('../services/marketplacePrinthouseFileAccessService');
            // Best effort to log denial, though we might not have order/file fully trusted if token is totally invalid
            await fileAccessService.recordPrinthouseFileAccessEvent(req.params.id, req.params.fileId, 'PRINTHOUSE_FILE_DOWNLOAD_DENIED', { reason: err.message, tokenPreview: req.query.token ? `pfat_***${req.query.token.slice(-4)}` : 'missing' }).catch(() => {});
            return res.status(403).json({ ok: false, error: err.message });
        }
        if (err.message === 'PACKAGE_NOT_ELIGIBLE_FOR_FILE_ACCESS' || err.message === 'FILE_NOT_IN_DISPATCH_PACKAGE' || err.message === 'FILE_SUPERSEDED') {
            return res.status(400).json({ ok: false, error: err.message });
        }
        return res.status(500).json({ ok: false, error: 'DOWNLOAD_ERROR', message: err.message });
    }
});

/**
 * GET /api/admin/marketplace/orders/:id/production-decision/status
 * Phase 38.4 - Read-only production decision status
 */
router.get('/:id/production-decision/status', async (req, res) => {
    try {
        const productionService = require('../services/marketplacePrinthouseProductionService');
        const status = await productionService.getProductionDecisionStatus(req.params.id);
        return res.json(status);
    } catch (err) {
        if (err.message === 'ORDER_NOT_FOUND' || err.message === 'HANDOFF_PACKAGE_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: err.message });
        }
        return res.status(500).json({ ok: false, error: 'PRODUCTION_DECISION_STATUS_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/production-decision
 * Phase 38.4 - Record a production decision
 */
router.post('/:id/production-decision', async (req, res) => {
    if (process.env.PPOS_ENABLE_PHASE38_PRODUCTION_DECISION !== 'true') {
        return res.status(403).json({ ok: false, error: 'PHASE38_PRODUCTION_DECISION_DISABLED' });
    }

    try {
        const { decision, reason, payload } = req.body;
        if (!decision) {
            return res.status(400).json({ ok: false, error: 'DECISION_REQUIRED' });
        }

        const productionService = require('../services/marketplacePrinthouseProductionService');
        const options = { operatorId: req.user?.id || req.session?.userId || 'break-glass-session' };
        
        const fullPayload = { reason, ...(payload || {}) };
        const result = await productionService.recordProductionDecision(req.params.id, decision, fullPayload, options);
        
        return res.json(result);
    } catch (err) {
        if (err.message === 'ORDER_NOT_FOUND' || err.message === 'HANDOFF_PACKAGE_NOT_FOUND' || err.message === 'DISPATCH_PACKAGE_NOT_ACCEPTED') {
            return res.status(404).json({ ok: false, error: err.message });
        }
        if (err.message === 'INVALID_DECISION' || err.message === 'INVALID_ORDER_STATUS_FOR_DECISION' || err.message === 'INVALID_STATE_TRANSITION' || err.message === 'REASON_REQUIRED' || err.message === 'INVOICE_NOT_ISSUED' || err.message === 'PAYMENT_NOT_CONFIRMED' || err.message === 'PRODUCTION_NOT_UNLOCKED') {
            return res.status(400).json({ ok: false, error: err.message });
        }
        return res.status(500).json({ ok: false, error: 'PRODUCTION_DECISION_ERROR', message: err.message });
    }
});

/**
 * GET /api/admin/marketplace/orders/:id/production-queue/status
 * Phase 38.5 — Returns production queue status. Read-only.
 */
router.get('/:id/production-queue/status', async (req, res) => {
    try {
        const queueService = require('../services/marketplaceProductionQueueService');
        const status = await queueService.getProductionQueueStatus(req.params.id);
        return res.json(status);
    } catch (err) {
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: err.message });
        }
        return res.status(500).json({ ok: false, error: 'PRODUCTION_QUEUE_STATUS_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/production-queue/evaluate
 * Phase 38.5 — Evaluates production queue eligibility. Read-only.
 */
router.post('/:id/production-queue/evaluate', async (req, res) => {
    try {
        const queueService = require('../services/marketplaceProductionQueueService');
        const options = {
            machineId: req.body?.machineId || null,
            operatorId: req.user?.id || req.session?.userId || 'break-glass-session'
        };
        const result = await queueService.evaluateProductionQueueEligibility(req.params.id, options);
        return res.json(result);
    } catch (err) {
        if (err.message === 'ORDER_NOT_FOUND' || err.message === 'HANDOFF_PACKAGE_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: err.message });
        }
        return res.status(500).json({ ok: false, error: 'PRODUCTION_QUEUE_EVALUATE_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/production-queue/create
 * Phase 38.5 — Creates governed production queue entry.
 * Guarded by PPOS_ENABLE_PHASE38_PRODUCTION_QUEUE feature flag.
 */
router.post('/:id/production-queue/create', async (req, res) => {
    if (process.env.PPOS_ENABLE_PHASE38_PRODUCTION_QUEUE !== 'true') {
        return res.status(403).json({
            ok: false,
            error: 'PHASE38_PRODUCTION_QUEUE_DISABLED',
            message: 'Set PPOS_ENABLE_PHASE38_PRODUCTION_QUEUE=true to enable Phase 38.5 production queue operations.'
        });
    }

    try {
        const queueService = require('../services/marketplaceProductionQueueService');
        const options = { operatorId: req.user?.id || req.session?.userId || 'break-glass-session' };
        const result = await queueService.createProductionQueueEntry(req.params.id, req.body || {}, options);
        return res.json(result);
    } catch (err) {
        if (err.message === 'ORDER_NOT_FOUND' || err.message === 'HANDOFF_PACKAGE_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: err.message });
        }
        if (err.message === 'PRODUCTION_QUEUE_CREATION_BLOCKED' || err.message === 'INVALID_ORDER_STATUS_FOR_QUEUE' || err.message === 'DISPATCH_PACKAGE_NOT_ACCEPTED' || err.message === 'INVOICE_NOT_ISSUED' || err.message === 'PAYMENT_NOT_CONFIRMED' || err.message === 'PRODUCTION_NOT_UNLOCKED' || err.message === 'PRODUCTION_DECISION_NOT_ACCEPTED') {
            return res.status(400).json({ ok: false, error: err.message });
        }
        return res.status(500).json({ ok: false, error: 'PRODUCTION_QUEUE_CREATE_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/production-queue/assign-machine
 * Phase 38.5 — Assigns a machine to the production queue entry.
 * Guarded by PPOS_ENABLE_PHASE38_PRODUCTION_QUEUE feature flag.
 */
router.post('/:id/production-queue/assign-machine', async (req, res) => {
    if (process.env.PPOS_ENABLE_PHASE38_PRODUCTION_QUEUE !== 'true') {
        return res.status(403).json({
            ok: false,
            error: 'PHASE38_PRODUCTION_QUEUE_DISABLED',
            message: 'Set PPOS_ENABLE_PHASE38_PRODUCTION_QUEUE=true to enable Phase 38.5 production queue operations.'
        });
    }

    try {
        const { machineId, note } = req.body || {};
        if (!machineId) {
            return res.status(400).json({ ok: false, error: 'MACHINE_ID_REQUIRED' });
        }

        const queueService = require('../services/marketplaceProductionQueueService');
        const options = { operatorId: req.user?.id || req.session?.userId || 'break-glass-session' };
        const result = await queueService.assignProductionMachine(req.params.id, machineId, { note }, options);
        return res.json(result);
    } catch (err) {
        if (err.message === 'ORDER_NOT_FOUND' || err.message === 'PRODUCTION_QUEUE_ENTRY_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: err.message });
        }
        if (err.message === 'INVALID_ORDER_STATUS_FOR_ASSIGNMENT' || err.message === 'MACHINE_ID_REQUIRED') {
            return res.status(400).json({ ok: false, error: err.message });
        }
        return res.status(500).json({ ok: false, error: 'PRODUCTION_MACHINE_ASSIGN_ERROR', message: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:id/production-queue/unassign-machine
 * Phase 38.5 — Unassigns the machine, reverting status to PRODUCTION_QUEUED.
 * Guarded by PPOS_ENABLE_PHASE38_PRODUCTION_QUEUE feature flag.
 */
router.post('/:id/production-queue/unassign-machine', async (req, res) => {
    if (process.env.PPOS_ENABLE_PHASE38_PRODUCTION_QUEUE !== 'true') {
        return res.status(403).json({
            ok: false,
            error: 'PHASE38_PRODUCTION_QUEUE_DISABLED',
            message: 'Set PPOS_ENABLE_PHASE38_PRODUCTION_QUEUE=true to enable Phase 38.5 production queue operations.'
        });
    }

    try {
        const { reason } = req.body || {};
        const queueService = require('../services/marketplaceProductionQueueService');
        const options = { operatorId: req.user?.id || req.session?.userId || 'break-glass-session' };
        const result = await queueService.unassignProductionMachine(req.params.id, { reason }, options);
        return res.json(result);
    } catch (err) {
        if (err.message === 'ORDER_NOT_FOUND' || err.message === 'PRODUCTION_QUEUE_ENTRY_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: err.message });
        }
        if (err.message === 'INVALID_ORDER_STATUS_FOR_UNASSIGNMENT') {
            return res.status(400).json({ ok: false, error: err.message });
        }
        return res.status(500).json({ ok: false, error: 'PRODUCTION_MACHINE_UNASSIGN_ERROR', message: err.message });
    }
});

module.exports = router;
