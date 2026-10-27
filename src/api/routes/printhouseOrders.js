/**
 * src/api/routes/printhouseOrders.js
 * 
 * Printhouse-scoped Order & Asset Management.
 * Enforces strict isolation and forensic auditing for printer operations.
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const ordersService = require('../services/ordersService');
const dispatchGating = require('../services/MarketplaceDispatchGatingService');
const db = require('../services/mysqlClient');
const logger = require('../services/logger').child('printhouse-orders');
const { resolveActorContext, requirePrinthouseScope } = require('../middleware/auth');

// Storage root for production files
const STORAGE_ROOT = path.join(__dirname, '../../../storage/production_files');

/**
 * GET /api/printhouse/orders
 * List orders assigned to this printhouse.
 */
router.get('/', requirePrinthouseScope(), async (req, res) => {
    const context = resolveActorContext(req);
    const printhouseId = context.isSuperAdmin ? req.query.printhouse_id : context.printhouseId;

    if (!printhouseId) {
        return res.status(400).json({ ok: false, error: 'Printhouse context required' });
    }

    try {
        const result = await ordersService.listOrders({
            printhouse_id: printhouseId,
            limit: Math.min(Number(req.query.limit || 50), 200),
            offset: Math.max(Number(req.query.offset || 0), 0),
            status: req.query.status
        });
        res.json({ ok: true, ...result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/printhouse/orders/:orderRef
 * Detailed view of an assigned order.
 */
router.get('/:orderRef', requirePrinthouseScope(), async (req, res) => {
    const { orderRef } = req.params;
    const context = resolveActorContext(req);

    try {
        const order = await ordersService.getOrderByRef(orderRef);
        if (!order) return res.status(404).json({ ok: false, error: 'Order not found' });

        // Isolation Check
        if (!context.isSuperAdmin && order.offer_print_house !== context.printhouseId) {
            return res.status(403).json({ ok: false, error: 'Access denied: Order assigned to another printhouse' });
        }

        // Forensic Audit
        await db.query(`
            INSERT INTO marketplace_events (id, order_id, order_ref, event_type, metadata_json)
            VALUES (UUID(), ?, ?, 'PRINTHOUSE_ORDER_VIEWED', ?)
        `, [order.id, orderRef, JSON.stringify({ actor: context.userId, printhouse: context.printhouseId })]);

        res.json({ ok: true, order });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/printhouse/orders/:orderRef/production-files
 * List production files and their status.
 */
router.get('/:orderRef/production-files', requirePrinthouseScope(), async (req, res) => {
    const { orderRef } = req.params;
    const context = resolveActorContext(req);

    try {
        const { rows: [order] } = await db.query('SELECT offer_print_house, id FROM orders WHERE order_ref = ?', [orderRef]);
        if (!order) return res.status(404).json({ ok: false, error: 'Order not found' });

        if (!context.isSuperAdmin && order.offer_print_house !== context.printhouseId) {
            return res.status(403).json({ ok: false, error: 'Access denied' });
        }

        const { rows: files } = await db.query(`
            SELECT id, kind, source_type, original_filename, size_bytes, mime_type, 
                   checksum, ingestion_status, validation_status, created_at, updated_at
            FROM production_files 
            WHERE order_ref = ?
        `, [orderRef]);

        // Forensic Audit
        await db.query(`
            INSERT INTO production_file_events (production_file_id, order_id, order_ref, event_type, event_payload)
            VALUES (NULL, ?, ?, 'PRINTHOUSE_FILE_REPOSITORY_ACCESSED', ?)
        `, [order.id, orderRef, JSON.stringify({ actor: context.userId })]);

        // Inject secure download links
        const filesWithLinks = files.map(f => ({
            ...f,
            download_url: `/api/printhouse/orders/${orderRef}/files/${f.id}/download`
        }));

        res.json({ ok: true, files: filesWithLinks });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/printhouse/orders/:orderRef/files/:fileId/download
 * Secure download proxy for production assets.
 */
router.get('/:orderRef/files/:fileId/download', requirePrinthouseScope(), async (req, res) => {
    const { orderRef, fileId } = req.params;
    const context = resolveActorContext(req);

    try {
        const { rows: [file] } = await db.query(`
            SELECT f.*, o.offer_print_house 
            FROM production_files f
            JOIN orders o ON f.order_ref = o.order_ref
            WHERE f.id = ? AND f.order_ref = ?
        `, [fileId, orderRef]);

        if (!file) return res.status(404).json({ ok: false, error: 'File not found' });

        if (!context.isSuperAdmin && file.offer_print_house !== context.printhouseId) {
            return res.status(403).json({ ok: false, error: 'Access denied' });
        }

        const absolutePath = path.join(STORAGE_ROOT, file.storage_url);
        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ ok: false, error: 'Physical file missing from repository' });
        }

        // Forensic Audit of Download
        await db.query(`
            INSERT INTO production_file_events (production_file_id, order_id, order_ref, event_type, event_payload)
            VALUES (?, ?, ?, 'FILE_DOWNLOADED_BY_PRINTHOUSE', ?)
        `, [fileId, file.order_id, orderRef, JSON.stringify({ actor: context.userId, printhouse: context.printhouseId })]);

        res.setHeader('Content-Type', file.mime_type || 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${file.original_filename}"`);
        
        const stream = fs.createReadStream(absolutePath);
        stream.pipe(res);

    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * Dispatch a Marketplace Order to a Production Machine (MES).
 * POST /api/printhouse/orders/:orderRef/dispatch
 */
router.post('/:orderRef/dispatch', requirePrinthouseScope(), async (req, res) => {
    const { orderRef } = req.params;
    const { machine_id } = req.body;
    const context = resolveActorContext(req);

    if (!machine_id) return res.status(400).json({ ok: false, error: 'Target machine_id required' });

    try {
        const result = await dispatchGating.dispatchOrder(orderRef, machine_id, context);
        res.json(result);
    } catch (err) {
        logger.error({ event: 'MARKETPLACE_DISPATCH_FAILED', order_ref: orderRef, error: err.message });
        if (err.message.includes('DISPATCH_BLOCKED')) {
            return res.status(422).json({ ok: false, error: err.message });
        }
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────
// PHASE 196F: PRINTHOUSE PAPER DECISIONS (BUDGET-02B-01)
// ─────────────────────────────────────────────────────────────────────────

const orderPaperDecisionService = require('../services/orderPaperDecisionService');

function detectPrototypePollution(obj) {
    if (!obj || typeof obj !== 'object') return false;
    for (const key of Object.keys(obj)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') return true;
        if (typeof obj[key] === 'object' && detectPrototypePollution(obj[key])) return true;
    }
    return false;
}

/**
 * Controller handler for recording a printhouse paper decision.
 */
async function handleRecordPaperDecision(req, res) {
    // 1. Prototype Pollution Guard
    if (detectPrototypePollution(req.body)) {
        return res.status(400).json({
            ok: false,
            error: {
                code: 'PROTOTYPE_POLLUTION_DETECTED',
                message: 'Invalid payload: Dangerous property names rejected'
            }
        });
    }

    // 2. Idempotency Key Guard (Mandatory for mutating decisions)
    const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || req.body?.idempotencyKey;
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
        return res.status(400).json({
            ok: false,
            error: {
                code: 'MISSING_IDEMPOTENCY_KEY',
                message: "Header 'Idempotency-Key' is required for paper decision requests"
            }
        });
    }

    const context = resolveActorContext(req);
    const targetRef = req.params.jobId || req.params.orderRef;

    const printhouseId = context.isSuperAdmin 
        ? (req.body?.printhouse_tenant_id || req.body?.printhouseId || context.printhouseId) 
        : context.printhouseId;

    const tenantId = context.isSuperAdmin
        ? (req.body?.tenant_id || req.body?.tenantId || context.tenantId || printhouseId)
        : (context.tenantId || printhouseId);

    if (!printhouseId) {
        return res.status(403).json({
            ok: false,
            error: {
                code: 'PRINTHOUSE_CONTEXT_REQUIRED',
                message: 'Assigned printhouse context required to record paper decision'
            }
        });
    }

    const payload = {
        tenantId,
        printhouseId,
        operatorId: context.userId || 'system-operator',
        jobId: targetRef,
        externalOrderIntentId: req.body?.externalOrderIntentId || req.body?.order_intent_id || targetRef,
        paperRole: req.body?.paperRole || req.body?.paper_role || req.body?.role,
        decisionAction: req.body?.decisionAction || req.body?.decision_action || req.body?.action,
        requestedVariantId: req.body?.requestedVariantId || req.body?.requested_variant_id || req.body?.variantId,
        alternativeVariantId: req.body?.alternativeVariantId || req.body?.alternative_variant_id || null,
        estimatedCostDelta: req.body?.estimatedCostDelta ?? req.body?.estimated_cost_delta ?? 0,
        currency: req.body?.currency || 'EUR',
        technicalReason: req.body?.technicalReason || req.body?.technical_reason || req.body?.reason || null,
        printhouseNotes: req.body?.printhouseNotes || req.body?.printhouse_notes || req.body?.notes || null,
        idempotencyKey: String(idempotencyKey).trim(),
        metadata: req.body?.metadata || {}
    };

    try {
        const decision = await orderPaperDecisionService.recordDecision(payload, context);
        const statusCode = decision.idempotent_replay ? 200 : 201;
        return res.status(statusCode).json({
            ok: true,
            decision
        });
    } catch (err) {
        logger.error({
            event: 'PAPER_DECISION_FAILED',
            targetRef,
            errorCode: err.code,
            error: err.message
        });

        const statusCode = err.statusCode || (err.code === 'IDEMPOTENCY_KEY_COLLISION' ? 409 : 400);
        return res.status(statusCode).json({
            ok: false,
            error: {
                code: err.code || 'PAPER_DECISION_FAILED',
                message: err.message
            }
        });
    }
}

/**
 * Controller handler for querying historical paper decisions for an order/job.
 */
async function handleListPaperDecisions(req, res) {
    const context = resolveActorContext(req);
    const targetRef = req.params.jobId || req.params.orderRef;
    const tenantId = context.isSuperAdmin
        ? (req.query?.tenant_id || context.tenantId || context.printhouseId)
        : (context.tenantId || context.printhouseId);

    try {
        const decisions = await orderPaperDecisionService.listDecisionsForOrder(tenantId, targetRef);
        return res.json({
            ok: true,
            job_id: targetRef,
            decisions
        });
    } catch (err) {
        logger.error({ event: 'LIST_PAPER_DECISIONS_FAILED', targetRef, error: err.message });
        return res.status(500).json({
            ok: false,
            error: {
                code: 'QUERY_FAILED',
                message: err.message
            }
        });
    }
}

// Mounted routes conforming to section 5 contract proposal
router.post('/jobs/:jobId/paper-decision', requirePrinthouseScope(), handleRecordPaperDecision);
router.get('/jobs/:jobId/paper-decisions', requirePrinthouseScope(), handleListPaperDecisions);

router.post('/orders/:orderRef/paper-decision', requirePrinthouseScope(), handleRecordPaperDecision);
router.get('/orders/:orderRef/paper-decisions', requirePrinthouseScope(), handleListPaperDecisions);

router.post('/:orderRef/paper-decision', requirePrinthouseScope(), handleRecordPaperDecision);
router.get('/:orderRef/paper-decisions', requirePrinthouseScope(), handleListPaperDecisions);

// Phase 196G: Governed Order Quote Revisions & Single-Use Tokens
const quoteRevisionRoutes = require('./orderQuoteRevisionRoutes');
router.use('/', quoteRevisionRoutes);

module.exports = router;

