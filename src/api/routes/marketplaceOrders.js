/**
 * src/api/routes/marketplaceOrders.js
 * 
 * Public/Administrative intake and file governance routes for Marketplace Orders.
 */

const express = require('express');
const router = express.Router();
const marketplaceOrderService = require('../services/marketplaceOrderService');
const mysqlClient = require('../services/mysqlClient');
const { requireAdmin } = require('../middleware/auth');
const logger = require('../services/logger').child('marketplace-orders-router');

/**
 * Custom middleware: requireMarketplaceOrAdmin
 * Validates request via:
 * 1. Standard admin JWT (using requireAdmin)
 * 2. Shared secret process.env.PPOS_MARKETPLACE_INTAKE_TOKEN via X-Marketplace-Token or standard Bearer Token
 * 3. Session role check
 */
function requireMarketplaceOrAdmin(req, res, next) {
    const pposMarketplaceIntakeToken = process.env.PPOS_MARKETPLACE_INTAKE_TOKEN;
    const authHeader = req.headers['authorization'];
    const xMarketplaceToken = req.headers['x-marketplace-token'];

    // Check shared secret matching process.env.PPOS_MARKETPLACE_INTAKE_TOKEN
    if (pposMarketplaceIntakeToken) {
        let bearerToken = '';
        if (authHeader && authHeader.startsWith('Bearer ')) {
            bearerToken = authHeader.substring(7);
        }

        if (
            (xMarketplaceToken && xMarketplaceToken === pposMarketplaceIntakeToken) ||
            (bearerToken && bearerToken === pposMarketplaceIntakeToken)
        ) {
            req.user = req.user || {
                id: 'marketplace-token-actor',
                role: 'SUPER_ADMIN',
                authMode: 'MARKETPLACE'
            };
            return next();
        }
    }

    // Express session fallback
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        req.user = req.user || {
            id: req.session.user.id || 'session-actor',
            role: 'SUPER_ADMIN',
            authMode: 'SESSION'
        };
        return next();
    }

    // Admin JWT verification
    requireAdmin(req, res, next);
}

/**
 * Safe JSON parsing helper.
 */
function safeParseJson(value, fallback = {}) {
    if (typeof value === 'object' && value !== null) return value;
    if (typeof value !== 'string') return fallback;
    try {
        return JSON.parse(value);
    } catch (e) {
        return fallback;
    }
}

/**
 * 1. POST /api/marketplace/orders
 * Creates a marketplace order.
 */
router.post('/', requireMarketplaceOrAdmin, async (req, res) => {
    try {
        const { pricingSessionId, selectedOfferId, tenantId, printhouseId, customer, bookSpec } = req.body || {};
        logger.info({
            event: 'API_CREATE_ORDER_REQUEST',
            pricingSessionId,
            selectedOfferId,
            tenantId,
            printhouseId
        });
        
        // Basic validations
        if (!customer) {
            return res.status(400).json({ ok: false, error: 'CUSTOMER_REQUIRED', message: 'Customer details are required to initialize an order.' });
        }
        if (!bookSpec) {
            return res.status(400).json({ ok: false, error: 'BOOK_SPEC_REQUIRED', message: 'Book specification is required to initialize an order.' });
        }

        const order = await marketplaceOrderService.createOrder(req.body);

        return res.status(201).json({
            ok: true,
            orderId: order.orderId,
            status: order.status,
            requiredFiles: ['INTERIOR_PDF', 'COVER_PDF'],
            readiness: {
                ready: order.readiness === 'READY',
                blockers: order.blockers
            }
        });
    } catch (err) {
        logger.error({ event: 'api_create_order_failed', error: err.message });
        return res.status(500).json({ ok: false, error: 'ORDER_CREATION_FAILED', message: err.message });
    }
});

/**
 * 3. GET /api/marketplace/orders
 * List orders with filters.
 */
router.get('/', requireAdmin, async (req, res) => {
    try {
        const {
            status,
            tenantId,
            printhouseId,
            customerId,
            startDate,
            endDate,
            limit = 50,
            offset = 0
        } = req.query;

        let sql = 'SELECT * FROM marketplace_orders WHERE 1=1';
        const params = [];

        if (status) {
            sql += ' AND status = ?';
            params.push(status);
        }
        if (tenantId) {
            sql += ' AND tenant_id = ?';
            params.push(tenantId);
        }
        if (printhouseId) {
            sql += ' AND printhouse_id = ?';
            params.push(printhouseId);
        }
        if (customerId) {
            sql += ' AND customer_id = ?';
            params.push(customerId);
        }
        if (startDate) {
            sql += ' AND created_at >= ?';
            params.push(startDate);
        }
        if (endDate) {
            sql += ' AND created_at <= ?';
            params.push(endDate);
        }

        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(Number(limit), Number(offset));

        const rows = await mysqlClient.query(sql, params);

        const orders = [];
        for (const row of rows) {
            const order = await marketplaceOrderService.getOrder(row.order_id);
            if (order) orders.push(order);
        }

        return res.json({
            ok: true,
            orders
        });
    } catch (err) {
        logger.error({ event: 'api_list_orders_failed', error: err.message });
        return res.status(500).json({ ok: false, error: 'LIST_ORDERS_FAILED', message: err.message });
    }
});

/**
 * 2. GET /api/marketplace/orders/:orderId
 * Returns order details.
 */
router.get('/:orderId', requireMarketplaceOrAdmin, async (req, res) => {
    const { orderId } = req.params;
    try {
        const order = await marketplaceOrderService.getOrder(orderId);
        if (!order) {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${orderId} not found.` });
        }

        const files = await mysqlClient.query('SELECT * FROM marketplace_order_files WHERE order_id = ?', [orderId]);
        const events = await mysqlClient.query('SELECT * FROM marketplace_order_events WHERE order_id = ? ORDER BY created_at DESC', [orderId]);
        const preflightBindings = await mysqlClient.query('SELECT * FROM marketplace_order_preflight_bindings WHERE order_id = ?', [orderId]);

        return res.json({
            ok: true,
            order,
            files: files.map(f => ({
                fileId: f.file_id,
                orderId: f.order_id,
                role: f.role,
                version: f.version,
                originalName: f.original_name,
                mimeType: f.mime_type,
                sizeBytes: Number(f.size_bytes),
                checksumSha256: f.checksum_sha256,
                storagePath: f.storage_path,
                status: f.status,
                preflightJobId: f.preflight_job_id,
                preflightStatus: f.preflight_status,
                preflightOutcomeCategory: f.preflight_outcome_category,
                findingsCount: f.findings_count,
                uploadedAt: f.uploaded_at
            })),
            preflightBindings: preflightBindings.map(b => ({
                orderId: b.order_id,
                fileId: b.file_id,
                preflightJobId: b.preflight_job_id,
                role: b.role,
                status: b.status,
                outcomeCategory: b.outcome_category,
                findingsCount: b.findings_count
            })),
            events: events.map(e => ({
                eventId: e.event_id,
                orderId: e.order_id,
                fileId: e.file_id,
                type: e.type,
                actorType: e.actor_type,
                actorId: e.actor_id,
                payload: safeParseJson(e.payload_json, {}),
                createdAt: e.created_at
            })),
            readiness: {
                ready: order.readiness === 'READY',
                blockers: order.blockers
            }
        });
    } catch (err) {
        logger.error({ event: 'api_get_order_failed', orderId, error: err.message });
        return res.status(500).json({ ok: false, error: 'GET_ORDER_FAILED', message: err.message });
    }
});

/**
 * 4. POST /api/marketplace/orders/:orderId/selected-offer
 * Updates selected offer.
 */
router.post('/:orderId/selected-offer', requireMarketplaceOrAdmin, async (req, res) => {
    const { orderId } = req.params;
    const selectedOffer = req.body.selectedOffer || req.body;

    try {
        if (!selectedOffer || (!selectedOffer.offerId && !selectedOffer.id)) {
            return res.status(400).json({ ok: false, error: 'INVALID_OFFER', message: 'A valid selectedOffer payload is required.' });
        }

        const updated = await marketplaceOrderService.updateSelectedOffer(orderId, selectedOffer);
        return res.json({ ok: true, order: updated });
    } catch (err) {
        logger.error({ event: 'api_update_offer_failed', orderId, error: err.message });
        return res.status(500).json({ ok: false, error: 'UPDATE_OFFER_FAILED', message: err.message });
    }
});

/**
 * 5. POST /api/marketplace/orders/:orderId/files/register
 * Registers file metadata only.
 */
router.post('/:orderId/files/register', requireMarketplaceOrAdmin, async (req, res) => {
    const { orderId } = req.params;
    const { role, originalName, mimeType, sizeBytes, checksumSha256, storagePath, metadata } = req.body;

    try {
        if (!role || !originalName) {
            return res.status(400).json({ ok: false, error: 'MISSING_FIELDS', message: 'role and originalName are required.' });
        }

        const result = await marketplaceOrderService.registerFileMetadata(orderId, {
            role,
            originalName,
            mimeType,
            sizeBytes,
            checksumSha256,
            storagePath,
            metadata
        });

        return res.json(result);
    } catch (err) {
        logger.error({ event: 'api_register_file_failed', orderId, error: err.message });
        return res.status(err.message === 'ORDER_NOT_FOUND' ? 404 : 500).json({
            ok: false,
            error: err.message === 'ORDER_NOT_FOUND' ? 'ORDER_NOT_FOUND' : 'FILE_REGISTRATION_FAILED',
            message: err.message
        });
    }
});

/**
 * 6. POST /api/marketplace/orders/:orderId/files/:fileId/preflight-bind
 * Binds a preflightJobId to an order file.
 */
router.post('/:orderId/files/:fileId/preflight-bind', requireMarketplaceOrAdmin, async (req, res) => {
    const { orderId, fileId } = req.params;
    const { preflightJobId } = req.body;

    try {
        if (!preflightJobId) {
            return res.status(400).json({ ok: false, error: 'PREFLIGHT_JOB_ID_REQUIRED' });
        }

        const result = await marketplaceOrderService.bindPreflightJob(orderId, fileId, preflightJobId);
        return res.json(result);
    } catch (err) {
        logger.error({ event: 'api_preflight_bind_failed', orderId, fileId, error: err.message });
        const statusCode = ['ORDER_NOT_FOUND', 'FILE_SLOT_NOT_FOUND'].includes(err.message) ? 404 : 500;
        return res.status(statusCode).json({
            ok: false,
            error: err.message,
            message: err.message
        });
    }
});

/**
 * 7. POST /api/marketplace/orders/:orderId/readiness/recompute
 * Recomputes readiness.
 */
router.post('/:orderId/readiness/recompute', requireMarketplaceOrAdmin, async (req, res) => {
    const { orderId } = req.params;
    try {
        const order = await marketplaceOrderService.getOrder(orderId);
        if (!order) {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${orderId} not found.` });
        }

        const readiness = await marketplaceOrderService.computeReadiness(orderId);
        return res.json({ ok: true, readiness });
    } catch (err) {
        logger.error({ event: 'api_recompute_readiness_failed', orderId, error: err.message });
        return res.status(500).json({ ok: false, error: 'RECOMPUTE_READINESS_FAILED', message: err.message });
    }
});

module.exports = router;
