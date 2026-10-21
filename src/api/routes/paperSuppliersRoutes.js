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
const { requireAdmin, resolveActorContext, requireSupplierScope } = require('../middleware/auth');

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
 * Operator or Admin capability required.
 * DOES NOT create commercial offers or modify inventory!
 */
router.post('/catalog/imports/preview', requireSupplierScope('OPERATOR'), upload.single('file'), async (req, res) => {
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

        const preview = await paperImportService.processImportPreview({
            buffer: fileBuffer,
            fileName,
            tenantId: context.tenantId,
            supplierId: context.supplierId,
            createdBy: context.userId
        });

        // Stage batch into database if stage=true query param or by default
        const shouldStage = req.query.stage !== 'false';
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
 * POST /api/v1/paper-suppliers/catalog/imports/:batchId/confirm
 * Confirms staged technical import batch.
 * Inserts validated records into paper_products and paper_variants.
 * Operator or Admin capability required.
 * STRICTLY ISOLATED: Zero commercial offer publication, zero inventory modification.
 */
router.post('/catalog/imports/:batchId/confirm', requireSupplierScope('OPERATOR'), async (req, res) => {
    try {
        const context = resolveActorContext(req);
        const { batchId } = req.params;
        const { decisions } = req.body || {};

        const result = await paperImportService.confirmImportBatch({
            batchId,
            tenantId: context.tenantId,
            actorId: context.userId,
            selectedDecisions: decisions
        });

        return res.json({
            ok: true,
            data: result
        });
    } catch (err) {
        console.error('[PAPER-IMPORT][CONFIRM-ERROR]', err);
        const statusCode = err.message.startsWith('BATCH_NOT_FOUND') ? 404 : 400;
        return res.status(statusCode).json({
            ok: false,
            error: {
                code: 'IMPORT_CONFIRMATION_FAILED',
                message: err.message
            }
        });
    }
});

module.exports = router;

