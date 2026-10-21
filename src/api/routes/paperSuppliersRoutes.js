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

module.exports = router;
