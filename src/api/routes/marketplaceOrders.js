/**
 * src/api/routes/marketplaceOrders.js
 * 
 * Public/Administrative intake and file governance routes for Marketplace Orders.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const marketplaceOrderService = require('../services/marketplaceOrderService');
const marketplaceOrderFileService = require('../services/marketplaceOrderFileService');
const invoicePaymentService = require('../services/marketplaceInvoicePaymentService');
const mysqlClient = require('../services/mysqlClient');
const { requireAdmin } = require('../middleware/auth');
const logger = require('../services/logger').child('marketplace-orders-router');

// Configure Multer for production PDF uploads up to 5 GB
const uploadStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const orderId = (req.params.orderId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
        const role = (req.body.role || req.body.kind || 'INTERIOR_PDF').replace(/[^a-zA-Z0-9_-]/g, '_');
        const dir = path.join(__dirname, '../../../storage/marketplace_orders', orderId, role);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}_${path.basename(file.originalname || 'production.pdf')}`);
    }
});

const uploadMiddleware = multer({
    storage: uploadStorage,
    limits: {
        fileSize: 5 * 1024 * 1024 * 1024 // 5 GB
    }
});

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

    // Check shared secret matching process.env.PPOS_MARKETPLACE_INTAKE_TOKEN or PPOS_CONTROL_TOKEN
    const pposControlToken = process.env.PPOS_CONTROL_TOKEN;
    if (pposMarketplaceIntakeToken || pposControlToken) {
        let bearerToken = '';
        if (authHeader && authHeader.startsWith('Bearer ')) {
            bearerToken = authHeader.substring(7);
        }

        if (
            (pposMarketplaceIntakeToken && ((xMarketplaceToken && xMarketplaceToken === pposMarketplaceIntakeToken) || (bearerToken && bearerToken === pposMarketplaceIntakeToken))) ||
            (pposControlToken && ((xMarketplaceToken && xMarketplaceToken === pposControlToken) || (bearerToken && bearerToken === pposControlToken)))
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

/**
 * 8. POST /api/marketplace/orders/:orderId/files/upload
 * PHASE-15: Binary PDF file upload up to 5 GB via Multer.
 */
router.post('/:orderId/files/upload', requireMarketplaceOrAdmin, uploadMiddleware.single('file'), async (req, res) => {
    const { orderId } = req.params;
    const role = req.body?.role || req.body?.kind || req.query?.role || 'INTERIOR_PDF';
    const originalName = req.body?.originalName || req.file?.originalname || `${role.toLowerCase()}.pdf`;

    try {
        const buffer = req.body?.contentBase64
            ? Buffer.from(req.body.contentBase64, 'base64')
            : (req.file?.buffer || null);

        const result = await marketplaceOrderFileService.uploadBinaryFile(orderId, {
            role,
            file: req.file || null,
            buffer,
            originalName,
            mimeType: req.file?.mimetype || req.body?.mimeType || 'application/pdf',
            actorId: req.user?.id || 'CUSTOMER'
        });

        return res.status(200).json(result);
    } catch (err) {
        logger.error({ event: 'api_file_upload_failed', orderId, error: err.message });
        const statusCode = err.statusCode || (err.message === 'ORDER_NOT_FOUND' ? 404 : 500);
        return res.status(statusCode).json({
            ok: false,
            error: err.message,
            message: err.message
        });
    }
});

/**
 * 9. POST /api/marketplace/orders/:orderId/files/external-link
 * PHASE-15: External link ingestion (WeTransfer, Dropbox, Drive, S3) with SSRF validation.
 */
router.post('/:orderId/files/external-link', requireMarketplaceOrAdmin, async (req, res) => {
    const { orderId } = req.params;
    const { role, kind, externalUrl, url, originalName, sizeBytes, checksumSha256 } = req.body || {};

    try {
        const result = await marketplaceOrderFileService.registerExternalFileLink(orderId, {
            role: role || kind || 'INTERIOR_PDF',
            externalUrl: externalUrl || url,
            originalName,
            sizeBytes,
            checksumSha256,
            actorId: req.user?.id || 'CUSTOMER'
        });

        return res.status(200).json(result);
    } catch (err) {
        logger.error({ event: 'api_external_link_failed', orderId, error: err.message });
        const statusCode = err.statusCode || (err.message === 'ORDER_NOT_FOUND' ? 404 : 400);
        return res.status(statusCode).json({
            ok: false,
            error: err.message,
            message: err.message
        });
    }
});

/**
 * 10. POST /api/marketplace/orders/:orderId/checkout/session
 * PHASE-15: Dual Checkout Session Creation (Stripe Card/SEPA or B2B Bank Transfer)
 * supporting Modality A (Escrow MoR) and Modality B (Direct Commission).
 */
router.post('/:orderId/checkout/session', requireMarketplaceOrAdmin, async (req, res) => {
    const { orderId } = req.params;
    try {
        const result = await invoicePaymentService.createMarketplaceOrderCheckoutSession(
            orderId,
            req.body || {},
            { operatorId: req.user?.id || 'CUSTOMER' }
        );
        return res.status(200).json(result);
    } catch (err) {
        logger.error({ event: 'api_checkout_session_failed', orderId, error: err.message });
        const statusCode = err.statusCode || (err.message === 'ORDER_NOT_FOUND' ? 404 : 500);
        return res.status(statusCode).json({
            ok: false,
            error: err.message,
            message: err.message
        });
    }
});

/**
 * 11. POST /api/marketplace/orders/:orderId/payment/wire-proof
 * PHASE-15: Uploads B2B Wire Transfer proof document/receipt to expedite verification & release to press.
 */
router.post('/:orderId/payment/wire-proof', requireMarketplaceOrAdmin, uploadMiddleware.single('file'), async (req, res) => {
    const { orderId } = req.params;
    try {
        let order = null;
        try {
            order = await marketplaceOrderService.getOrder(orderId);
        } catch (_) {}

        if (!order && !String(orderId).startsWith('ORD_')) {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND', message: `Order ${orderId} not found.` });
        }

        const proofId = `prf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const originalName = req.body?.originalName || req.body?.fileName || req.file?.originalname || 'wire_transfer_proof.pdf';
        const reference = req.body?.reference || req.body?.reconciliationCode || order?.payment?.bankTransferReference || `PPOS-ORD-${orderId.replace(/[^A-Za-z0-9]/g, '').slice(-8).toUpperCase()}`;
        const ibanOrigin = req.body?.ibanOrigin || null;
        const notes = req.body?.notes || '';
        const uploadedAt = new Date().toISOString();

        // Persist binary wire proof file to disk if provided via Multer or contentBase64
        let storagePath = req.file?.path || null;
        let sizeBytes = Number(req.file?.size || req.body?.sizeBytes || 0);
        let checksumSha256 = null;

        if (!storagePath && req.body?.contentBase64) {
            const proofBuffer = Buffer.from(req.body.contentBase64, 'base64');
            const proofDir = path.join(__dirname, '../../../storage/marketplace_orders', orderId.replace(/[^a-zA-Z0-9_-]/g, '_'), 'WIRE_PROOF');
            fs.mkdirSync(proofDir, { recursive: true });
            storagePath = path.join(proofDir, `${Date.now()}_${path.basename(originalName)}`);
            fs.writeFileSync(storagePath, proofBuffer);
            sizeBytes = proofBuffer.length;
            checksumSha256 = require('crypto').createHash('sha256').update(proofBuffer).digest('hex');
        } else if (storagePath && fs.existsSync(storagePath)) {
            const fileData = fs.readFileSync(storagePath);
            sizeBytes = fileData.length;
            checksumSha256 = require('crypto').createHash('sha256').update(fileData).digest('hex');
        }

        let metadata = {};
        try {
            const rows = await mysqlClient.query('SELECT metadata_json FROM marketplace_orders WHERE order_id = ?', [orderId]);
            metadata = rows && rows[0] ? safeParseJson(rows[0].metadata_json, {}) : {};
        } catch (_) {}

        metadata.payment = {
            ...(metadata.payment || {}),
            status: metadata.payment?.status === 'CONFIRMED' ? 'CONFIRMED' : 'WIRE_PROOF_UPLOADED',
            wireProof: {
                proofId,
                originalName,
                reference,
                ibanOrigin,
                notes,
                storagePath,
                sizeBytes,
                checksumSha256,
                uploadedAt,
                uploadedBy: req.user?.id || 'CUSTOMER'
            }
        };
        metadata.productionStage = metadata.productionStage || 'ON_PRESS_PRINTING';
        metadata.activeStageIndex = metadata.activeStageIndex || 2;

        try {
            await mysqlClient.query(
                `UPDATE marketplace_orders
                 SET payment_status = ?,
                     status = CASE WHEN status IN ('AWAITING_PAYMENT', 'OFFER_SELECTED', 'INVOICED', 'DRAFT') THEN 'IN_PRODUCTION' ELSE status END,
                     escrow_status = CASE WHEN escrow_status = 'UNFUNDED' THEN 'ESCROW_FUNDED' ELSE escrow_status END,
                     metadata_json = ?,
                     updated_at = NOW()
                 WHERE order_id = ?`,
                [metadata.payment.status, JSON.stringify(metadata), orderId]
            );
            await marketplaceOrderService.appendOrderEvent(orderId, {
                type: 'WIRE_TRANSFER_PROOF_UPLOADED',
                actorType: 'CUSTOMER',
                actorId: req.user?.id || 'CUSTOMER',
                payload: { proofId, originalName, reference, uploadedAt, orderStatus: 'IN_PRODUCTION' }
            });
        } catch (_) {}

        try {
            const customerPortalRoutes = require('./customerPortalRoutes');
            if (typeof customerPortalRoutes.updateCustomerOrderRuntimeState === 'function') {
                customerPortalRoutes.updateCustomerOrderRuntimeState(orderId, {
                    status: 'IN_PRODUCTION',
                    paymentStatus: metadata.payment.status,
                    escrowStatus: 'ESCROW_FUNDED',
                    productionStage: 'ON_PRESS_PRINTING',
                    activeStageIndex: 2
                });
            }
        } catch (_) {}

        return res.status(200).json({
            ok: true,
            orderId,
            proofId,
            status: 'PAYMENT_PROOF_UNDER_REVIEW',
            orderStatus: 'IN_PRODUCTION',
            reconciliationCode: reference,
            paymentStatus: metadata.payment.status,
            wireProof: metadata.payment.wireProof
        });
    } catch (err) {
        logger.error({ event: 'api_wire_proof_upload_failed', orderId, error: err.message });
        return res.status(500).json({ ok: false, error: 'WIRE_PROOF_UPLOAD_FAILED', message: err.message });
    }
});

/**
 * 12. POST /api/marketplace/orders/:orderId/payment/webhook
 * PHASE-15: Stripe Checkout / SEPA / Admin Payment Confirmation Webhook.
 * Automatically transitions order from AWAITING_PAYMENT to IN_PRODUCTION and locks Escrow funds.
 */
router.post('/:orderId/payment/webhook', requireMarketplaceOrAdmin, async (req, res) => {
    const { orderId } = req.params;
    try {
        const result = await invoicePaymentService.confirmMarketplaceOrderPayment(
            orderId,
            req.body || {},
            { operatorId: req.user?.id || 'STRIPE_WEBHOOK' }
        );
        return res.status(200).json(result);
    } catch (err) {
        logger.error({ event: 'api_payment_webhook_failed', orderId, error: err.message });
        const statusCode = err.statusCode || (err.message === 'ORDER_NOT_FOUND' ? 404 : 500);
        return res.status(statusCode).json({
            ok: false,
            error: err.message,
            message: err.message
        });
    }
});

/**
 * 13. POST /api/marketplace/orders/:orderId/preflight/callback
 * PHASE-15 / PHASE-11A: Bidirectional Preflight Engine Verdict Callback.
 * Receives structured pre-press telemetry (CMYK/FOGRA39, DPI, Fonts, TAC %, Bleed +3.0 mm, Spine mm)
 * and persists it atomically into `marketplace_orders` (`readiness_json`, `metadata_json`) and `marketplace_order_files`.
 */
router.post('/:orderId/preflight/callback', requireMarketplaceOrAdmin, async (req, res) => {
    const { orderId } = req.params;
    try {
        const result = await marketplaceOrderFileService.applyPreflightVerdictCallback(orderId, req.body || {});
        return res.status(200).json(result);
    } catch (err) {
        logger.error({ event: 'api_preflight_callback_failed', orderId, error: err.message });
        const statusCode = err.statusCode || (err.message === 'ORDER_NOT_FOUND' ? 404 : 500);
        return res.status(statusCode).json({
            ok: false,
            error: err.message,
            message: err.message
        });
    }
});

/**
 * 14. GET /api/marketplace/orders/:orderId/preflight/report
 * Returns the full structured Preflight & Spine Geometry report for an order.
 */
router.get('/:orderId/preflight/report', requireMarketplaceOrAdmin, async (req, res) => {
    const { orderId } = req.params;
    try {
        const { getPreflightInspectionById, inspectPreflightJob } = require('../services/preflight/preflightEngineService');
        let report = getPreflightInspectionById(orderId, req.query?.tenantId || 'tenant-default');
        if (!report) {
            let order = null;
            try {
                order = await marketplaceOrderService.getOrder(orderId);
            } catch (_) {}
            const specs = order?.specs || {};
            report = inspectPreflightJob({
                jobId: orderId,
                orderId,
                title: order?.title || specs.title || `Editorial Job ${orderId}`,
                isbn: order?.isbn || specs.isbn || '978-84-9066-801-6',
                pageCount: Number(specs.interior_pages || specs.pages || 240),
                paperGrammage: Number(specs.paper_weight_interior || 90),
                paperBulk: 1.3,
                paperCoating: specs.paper_type_interior || 'UNCOATED',
                bindingType: specs.binding_method || 'SOFTCOVER_PUR',
                trimWidthMm: Number(specs.trimWidthMm || 150),
                trimHeightMm: Number(specs.trimHeightMm || 230),
                innerBleedMm: 3.0,
                declaredSpineMm: specs.calculatedSpineMm || null
            });
        }
        return res.status(200).json({
            ok: true,
            orderId,
            preflightReport: report
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
