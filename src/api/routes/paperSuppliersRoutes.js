/**
 * src/api/routes/paperSuppliersRoutes.js
 * 
 * Canonical backend API routes for Paper Supplier Hub.
 * Handles supplier profile, memberships, and status.
 * Mounted at: /api/v1/paper-suppliers
 */
const express = require('express');
const router = express.Router();
const db = require('../services/mysqlClient');
const { requireAdmin, resolveActorContext, requireSupplierScope, requireApprovedSupplier } = require('../middleware/auth');

// Feature Flag Middleware: Default OFF
function requirePaperSupplierHubFlag(req, res, next) {
    const isEnabled = process.env.PAPER_SUPPLIER_HUB_ENABLED === 'true';
    if (!isEnabled) {
        return res.status(403).json({
            ok: false,
            error: {
                code: 'FEATURE_DISABLED',
                message: 'Paper Supplier Hub is currently disabled. Contact administrator to enable pilot access.'
            }
        });
    }
    next();
}

router.use(requirePaperSupplierHubFlag);
router.use(requireAdmin);

/**
 * GET /api/v1/paper-suppliers/me
 * Retrieves the current authenticated supplier profile and tenancy.
 * Fails closed: does not assume ACTIVE or EUR if supplier is missing or database fails.
 */
router.get('/me', requireSupplierScope('VIEWER'), async (req, res) => {
    try {
        const context = resolveActorContext(req);
        
        let supplier = null;
        if (context.supplierId) {
            const rows = await db.query(
                'SELECT id, tenant_id, name, status, contact_email, currencies_json, metadata_json FROM paper_suppliers WHERE id = ?',
                [context.supplierId]
            );
            supplier = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0][0] : rows[0]) : null;
        } else if (context.tenantId) {
            const rows = await db.query(
                'SELECT id, tenant_id, name, status, contact_email, currencies_json, metadata_json FROM paper_suppliers WHERE tenant_id = ?',
                [context.tenantId]
            );
            supplier = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0][0] : rows[0]) : null;
        }

        if (!supplier) {
            return res.status(404).json({
                ok: false,
                error: {
                    code: 'SUPPLIER_NOT_FOUND',
                    message: 'No registered paper supplier organization found for current authenticated actor.'
                }
            });
        }

        // Suspended suppliers are forbidden from operational endpoints
        if (supplier.status === 'SUSPENDED') {
            return res.status(403).json({
                ok: false,
                error: {
                    code: 'SUPPLIER_SUSPENDED',
                    message: 'Supplier organization is suspended. Operational access denied.'
                }
            });
        }

        let currencies = [];
        if (supplier.currencies_json) {
            currencies = typeof supplier.currencies_json === 'string' ? JSON.parse(supplier.currencies_json) : supplier.currencies_json;
        } else if (supplier.metadata_json) {
            const meta = typeof supplier.metadata_json === 'string' ? JSON.parse(supplier.metadata_json) : supplier.metadata_json;
            currencies = meta.currencies || [];
        }

        const effectiveRole = req.verifiedSupplierContext?.role || context.role;
        return res.json({
            ok: true,
            data: {
                userId: context.userId,
                role: effectiveRole,
                tenantId: supplier.tenant_id,
                supplierId: supplier.id,
                status: supplier.status,
                name: supplier.name,
                currencies: Array.isArray(currencies) ? currencies : []
            }
        });
    } catch (err) {
        console.error('[PAPER-SUPPLIERS][ME-ERROR]', err);
        return res.status(500).json({ ok: false, error: err.message, code: 'DATABASE_ERROR' });
    }
});

/**
 * GET /api/v1/paper-suppliers/status
 * Explicit diagnostic status endpoint for supplier hub availability.
 * Permitted to authenticated suppliers (including suspended) solely to query account status.
 */
router.get('/status', requireSupplierScope('VIEWER'), async (req, res) => {
    try {
        const context = resolveActorContext(req);
        let supplierStatus = 'UNKNOWN';
        let supplierName = null;

        if (context.supplierId) {
            const rows = await db.query('SELECT name, status FROM paper_suppliers WHERE id = ?', [context.supplierId]);
            const supplier = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0][0] : rows[0]) : null;
            if (supplier) {
                supplierStatus = supplier.status;
                supplierName = supplier.name;
            }
        }

        const effectiveRole = req.verifiedSupplierContext?.role || context.role;

        res.json({
            ok: true,
            hub: 'PAPER_SUPPLIER_HUB',
            version: '1.0.0',
            actor: {
                userId: context.userId,
                role: effectiveRole,
                supplierId: context.supplierId,
                supplierName,
                supplierStatus,
                isSuspended: supplierStatus === 'SUSPENDED',
                isSupplierUser: context.isSupplierUser,
                isSupplierAdmin: effectiveRole === 'SUPPLIER_ADMIN',
                isSupplierOperator: ['SUPPLIER_ADMIN', 'SUPPLIER_OPERATOR'].includes(effectiveRole)
            }
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'DATABASE_ERROR' });
    }
});

const paperImportService = require('../services/paperImportService');
const multer = require('multer');
const upload = multer({
    limits: { fileSize: 25 * 1024 * 1024 } // 25 MB max
});

/**
 * POST /api/v1/paper-suppliers/catalog/imports/preview
 * Parse uploaded ODS/XLSX/CSV file and generate technical validation preview.
 * Operator or Admin capability and APPROVED supplier status required.
 * DOES NOT create commercial offers or modify inventory!
 */
router.post('/catalog/imports/preview', requireSupplierScope('OPERATOR'), requireApprovedSupplier, upload.single('file'), async (req, res) => {
    try {
        const context = resolveActorContext(req);
        let fileBuffer = null;
        let fileName = 'unknown';

        if (req.file) {
            fileBuffer = req.file.buffer;
            fileName = req.file.originalname;
        } else if (req.body && req.body.fileBase64) {
            fileBuffer = Buffer.from(req.body.fileBase64, 'base64');
            fileName = req.body.fileName || 'upload.bin';
        }

        if (!fileBuffer || fileBuffer.length === 0) {
            return res.status(400).json({
                ok: false,
                error: {
                    code: 'FILE_REQUIRED',
                    message: 'A valid file buffer or fileBase64 payload is required for technical import.'
                }
            });
        }

        const targetSheetName = req.query?.sheet || null;
        const preview = await paperImportService.processImportPreview({
            buffer: fileBuffer,
            fileName,
            tenantId: context.tenantId,
            supplierId: context.supplierId,
            createdBy: context.userId,
            targetSheetName
        });

        const shouldStage = req.query?.stage !== 'false';
        let stagedInfo = null;
        if (shouldStage) {
            stagedInfo = await paperImportService.stageImportBatch(preview);
        }

        return res.json({
            ok: true,
            data: {
                batchId: preview.batchId,
                fileName: preview.fileName,
                fileSha256: preview.fileSha256,
                format: preview.format,
                normalizationRulesVersion: preview.normalizationRulesVersion,
                tenantId: preview.tenantId,
                supplierId: preview.supplierId,
                summary: preview.summary,
                staged: Boolean(stagedInfo),
                rowsPreview: preview.rows.slice(0, 50),
                totalRowsCount: preview.rows.length
            }
        });
    } catch (err) {
        console.error('[PAPER-IMPORT][PREVIEW-ERROR]', err);
        return res.status(400).json({
            ok: false,
            error: {
                code: 'IMPORT_PROCESSING_FAILED',
                message: err.message
            }
        });
    }
});

/**
 * GET /api/v1/paper-suppliers/catalog/imports/:batchId/rows
 * Full paginated query of staged rows with status and decision filters.
 */
router.get('/catalog/imports/:batchId/rows', requireSupplierScope('VIEWER'), requireApprovedSupplier, async (req, res) => {
    try {
        const context = resolveActorContext(req);
        const { batchId } = req.params;
        const page = parseInt(req.query?.page || '1', 10);
        const limit = Math.min(parseInt(req.query?.limit || '50', 10), 200);
        const status = req.query?.status || null;
        const decision = req.query?.decision || null;

        const result = await paperImportService.getImportBatchRows({
            batchId,
            tenantId: context.tenantId,
            supplierId: context.supplierId,
            page,
            limit,
            status,
            decision
        });

        return res.json({
            ok: true,
            data: result
        });
    } catch (err) {
        console.error('[PAPER-IMPORT][ROWS-ERROR]', err);
        const statusCode = err.message.startsWith('BATCH_NOT_FOUND') ? 404 : 400;
        return res.status(statusCode).json({
            ok: false,
            error: {
                code: 'IMPORT_ROWS_QUERY_FAILED',
                message: err.message
            }
        });
    }
});

/**
 * PATCH /api/v1/paper-suppliers/catalog/imports/:batchId/rows
 * Review and correct specific staged rows before confirmation.
 */
router.patch('/catalog/imports/:batchId/rows', requireSupplierScope('OPERATOR'), requireApprovedSupplier, async (req, res) => {
    try {
        const context = resolveActorContext(req);
        const { batchId } = req.params;
        const { decisions } = req.body || {};

        if (!decisions || typeof decisions !== 'object') {
            return res.status(400).json({
                ok: false,
                error: {
                    code: 'DECISIONS_REQUIRED',
                    message: 'A map of row decisions is required.'
                }
            });
        }

        const result = await paperImportService.updateImportRowDecisions({
            batchId,
            tenantId: context.tenantId,
            supplierId: context.supplierId,
            actorId: context.userId,
            decisions
        });

        return res.json({
            ok: true,
            data: result
        });
    } catch (err) {
        console.error('[PAPER-IMPORT][REVIEW-ERROR]', err);
        const isNotFound = err.message.startsWith('BATCH_NOT_FOUND');
        const statusCode = isNotFound ? 404 : 400;
        let errCode = 'IMPORT_REVIEW_UPDATE_FAILED';
        if (err.message.startsWith('INVALID_OVERRIDE_FIELD')) errCode = 'INVALID_OVERRIDE_FIELD';
        else if (err.message.startsWith('INVALID_OVERRIDE_VALUE')) errCode = 'INVALID_OVERRIDE_VALUE';
        else if (err.message.startsWith('INVALID_DECISION_STRUCTURE')) errCode = 'INVALID_DECISION_STRUCTURE';
        else if (err.message.startsWith('INVALID_DECISION')) errCode = 'INVALID_DECISION';
        else if (err.message.startsWith('ROW_NOT_FOUND')) errCode = 'ROW_NOT_FOUND';
        else if (err.message.startsWith('BATCH_ALREADY_CONFIRMED')) errCode = 'BATCH_ALREADY_CONFIRMED';
        else if (isNotFound) errCode = 'BATCH_NOT_FOUND';

        return res.status(statusCode).json({
            ok: false,
            error: {
                code: errCode,
                message: err.message
            }
        });
    }
});

/**
 * POST /api/v1/paper-suppliers/catalog/imports/:batchId/confirm
 * Confirms staged technical import batch atomically.
 * Bounded by tenant and supplier resolved in server.
 * Requires APPROVED supplier status.
 */
router.post('/catalog/imports/:batchId/confirm', requireSupplierScope('OPERATOR'), requireApprovedSupplier, async (req, res) => {
    try {
        const context = resolveActorContext(req);
        const { batchId } = req.params;
        const { decisions } = req.body || {};

        const result = await paperImportService.confirmImportBatch({
            batchId,
            tenantId: context.tenantId,
            supplierId: context.supplierId,
            actorId: context.userId,
            selectedDecisions: decisions
        });

        return res.json({
            ok: true,
            data: result
        });
    } catch (err) {
        console.error('[PAPER-IMPORT][CONFIRM-ERROR]', err);
        const isNotFound = err.message.startsWith('BATCH_NOT_FOUND');
        const statusCode = isNotFound ? 404 : 400;
        let errCode = 'IMPORT_CONFIRMATION_FAILED';
        if (err.message.startsWith('UNRESOLVED_ROWS_EXIST')) errCode = 'UNRESOLVED_ROWS_EXIST';
        else if (err.message.startsWith('INCOMPLETE_ROWS_EXIST')) errCode = 'INCOMPLETE_ROWS_EXIST';
        else if (err.message.startsWith('INVALID_DECISION_STRUCTURE')) errCode = 'INVALID_DECISION_STRUCTURE';
        else if (err.message.startsWith('INVALID_DECISION')) errCode = 'INVALID_DECISION';
        else if (isNotFound) errCode = 'BATCH_NOT_FOUND';

        return res.status(statusCode).json({
            ok: false,
            error: {
                code: errCode,
                message: err.message
            }
        });
    }
});

const paperOfferService = require('../services/paperOfferService');

/**
 * -------------------------------------------------------------
 * ITERATION I3: TECHNICAL CATALOG & COMMERCIAL OFFERS ENDPOINTS
 * -------------------------------------------------------------
 */

/**
 * GET /api/v1/paper-suppliers/catalog/products
 * Query confirmed technical products and physical variants.
 * Accessible to VIEWER, OPERATOR, ADMIN.
 */
router.get('/catalog/products', requireSupplierScope('VIEWER'), requireApprovedSupplier, async (req, res) => {
    try {
        const page = parseInt(req.query.page || '1', 10);
        const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
        const search = req.query.search || null;
        const category = req.query.category || null;
        const finish = req.query.finish || null;

        const context = resolveActorContext(req);
        const result = await paperOfferService.getTechnicalCatalog({
            page,
            limit,
            search,
            category,
            finish,
            supplierId: context.supplierId
        });

        return res.json({
            ok: true,
            data: {
                ...result,
                products: result.products || result.items,
                items: result.items
            }
        });
    } catch (err) {
        console.error('[PAPER-SUPPLIERS][CATALOG-ERROR]', err);
        return res.status(500).json({
            ok: false,
            error: {
                code: 'CATALOG_QUERY_FAILED',
                message: err.message
            }
        });
    }
});

/**
 * GET /api/v1/paper-suppliers/catalog/variants/:variantId
 * Query detailed technical variant specifications and supplier's own offers.
 */
router.get('/catalog/variants/:variantId', requireSupplierScope('VIEWER'), requireApprovedSupplier, async (req, res) => {
    try {
        const context = resolveActorContext(req);
        const { variantId } = req.params;

        const result = await paperOfferService.getTechnicalVariantDetail({
            variantId,
            tenantId: context.tenantId,
            supplierId: context.supplierId
        });

        return res.json({
            ok: true,
            data: result
        });
    } catch (err) {
        console.error('[PAPER-SUPPLIERS][VARIANT-DETAIL-ERROR]', err);
        const isNotFound = err.message.startsWith('VARIANT_NOT_FOUND');
        return res.status(isNotFound ? 404 : 500).json({
            ok: false,
            error: {
                code: isNotFound ? 'VARIANT_NOT_FOUND' : 'VARIANT_QUERY_FAILED',
                message: err.message
            }
        });
    }
});

/**
 * GET /api/v1/paper-suppliers/offers
 * List commercial offers of current supplier with filtering and pagination.
 */
router.get('/offers', requireSupplierScope('VIEWER'), requireApprovedSupplier, async (req, res) => {
    try {
        const context = resolveActorContext(req);
        const query = req.query || {};
        const page = parseInt(query.page || '1', 10);
        const limit = Math.min(parseInt(query.limit || '20', 10), 100);
        const status = query.status || null;
        const visibility = query.visibility || null;
        const search = query.search || null;

        const result = await paperOfferService.listSupplierOffers({
            tenantId: context.tenantId,
            supplierId: context.supplierId,
            page,
            limit,
            status,
            visibility,
            search
        });

        return res.json({
            ok: true,
            data: {
                ...result,
                offers: result.items
            }
        });
    } catch (err) {
        console.error('[PAPER-SUPPLIERS][LIST-OFFERS-ERROR]', err);
        return res.status(500).json({
            ok: false,
            error: {
                code: 'OFFERS_QUERY_FAILED',
                message: err.message
            }
        });
    }
});

/**
 * POST /api/v1/paper-suppliers/offers
 * Create new commercial offer bound to confirmed variant.
 * Operator or Admin capability required.
 */
router.post('/offers', requireSupplierScope('OPERATOR'), requireApprovedSupplier, async (req, res) => {
    try {
        const context = resolveActorContext(req);
        const payload = req.body || {};

        const result = await paperOfferService.createOffer({
            tenantId: context.tenantId,
            supplierId: context.supplierId,
            actorId: context.userId,
            payload
        });

        return res.status(201).json({
            ok: true,
            data: result
        });
    } catch (err) {
        console.error('[PAPER-SUPPLIERS][CREATE-OFFER-ERROR]', err);
        let statusCode = 400;
        let errCode = 'OFFER_CREATION_FAILED';

        if (err.message.startsWith('VARIANT_NOT_FOUND')) {
            statusCode = 404;
            errCode = 'VARIANT_NOT_FOUND';
        } else if (err.message.startsWith('SKU_ALREADY_EXISTS')) {
            statusCode = 409;
            errCode = 'SKU_ALREADY_EXISTS';
        } else if (err.message.startsWith('INVALID_OFFER_PAYLOAD')) {
            statusCode = 400;
            errCode = 'INVALID_OFFER_PAYLOAD';
        }

        return res.status(statusCode).json({
            ok: false,
            error: {
                code: errCode,
                message: err.message,
                validationErrors: err.validationErrors || []
            }
        });
    }
});

/**
 * GET /api/v1/paper-suppliers/offers/:offerId
 * Query offer details and revision history.
 */
router.get('/offers/:offerId', requireSupplierScope('VIEWER'), requireApprovedSupplier, async (req, res) => {
    try {
        const context = resolveActorContext(req);
        const { offerId } = req.params;

        const result = await paperOfferService.getOfferById({
            offerId,
            tenantId: context.tenantId,
            supplierId: context.supplierId
        });

        return res.json({
            ok: true,
            data: result
        });
    } catch (err) {
        console.error('[PAPER-SUPPLIERS][GET-OFFER-ERROR]', err);
        const isNotFound = err.message.startsWith('OFFER_NOT_FOUND');
        return res.status(isNotFound ? 404 : 500).json({
            ok: false,
            error: {
                code: isNotFound ? 'OFFER_NOT_FOUND' : 'OFFER_QUERY_FAILED',
                message: err.message
            }
        });
    }
});

/**
 * PUT /api/v1/paper-suppliers/offers/:offerId
 * Update commercial conditions, creating new immutable revision.
 */
router.put('/offers/:offerId', requireSupplierScope('OPERATOR'), requireApprovedSupplier, async (req, res) => {
    try {
        const context = resolveActorContext(req);
        const { offerId } = req.params;
        const payload = req.body || {};

        const result = await paperOfferService.updateOffer({
            offerId,
            tenantId: context.tenantId,
            supplierId: context.supplierId,
            actorId: context.userId,
            payload
        });

        return res.json({
            ok: true,
            data: result
        });
    } catch (err) {
        console.error('[PAPER-SUPPLIERS][UPDATE-OFFER-ERROR]', err);
        const isNotFound = err.message.startsWith('OFFER_NOT_FOUND');
        const isInvalid = err.message.startsWith('INVALID_OFFER_PAYLOAD');
        const isSkuConflict = err.message.startsWith('SKU_ALREADY_EXISTS');
        const statusCode = isNotFound ? 404 : (isSkuConflict ? 409 : (isInvalid ? 400 : 500));
        const errCode = isNotFound ? 'OFFER_NOT_FOUND' : (isSkuConflict ? 'SKU_ALREADY_EXISTS' : (isInvalid ? 'INVALID_OFFER_PAYLOAD' : 'OFFER_UPDATE_FAILED'));

        return res.status(statusCode).json({
            ok: false,
            error: {
                code: errCode,
                message: err.message,
                validationErrors: err.validationErrors || []
            }
        });
    }
});

/**
 * PATCH /api/v1/paper-suppliers/offers/:offerId/status
 * Toggle offer status (e.g. ACTIVE -> INACTIVE).
 */
router.patch('/offers/:offerId/status', requireSupplierScope('OPERATOR'), requireApprovedSupplier, async (req, res) => {
    try {
        const context = resolveActorContext(req);
        const { offerId } = req.params;
        const { status, reason } = req.body || {};

        if (!status) {
            return res.status(400).json({
                ok: false,
                error: {
                    code: 'STATUS_REQUIRED',
                    message: 'A valid status string is required.'
                }
            });
        }

        const result = await paperOfferService.updateOfferStatus({
            offerId,
            tenantId: context.tenantId,
            supplierId: context.supplierId,
            actorId: context.userId,
            status,
            reason
        });

        return res.json({
            ok: true,
            data: result
        });
    } catch (err) {
        console.error('[PAPER-SUPPLIERS][STATUS-OFFER-ERROR]', err);
        const isNotFound = err.message.startsWith('OFFER_NOT_FOUND');
        const isInvalid = err.message.startsWith('INVALID_STATUS');
        const statusCode = isNotFound ? 404 : (isInvalid ? 400 : 500);

        return res.status(statusCode).json({
            ok: false,
            error: {
                code: isNotFound ? 'OFFER_NOT_FOUND' : (isInvalid ? 'INVALID_STATUS' : 'OFFER_STATUS_UPDATE_FAILED'),
                message: err.message
            }
        });
    }
});

module.exports = router;



