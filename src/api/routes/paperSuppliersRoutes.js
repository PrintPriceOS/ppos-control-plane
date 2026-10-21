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

module.exports = router;


