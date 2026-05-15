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

module.exports = router;
