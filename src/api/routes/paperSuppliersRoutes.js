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
 */
router.get('/me', requireSupplierScope('VIEWER'), async (req, res) => {
    try {
        const context = resolveActorContext(req);
        const supplierId = context.supplierId || context.tenantId;

        const rows = await db.query(
            'SELECT * FROM paper_suppliers WHERE id = ? OR tenant_id = ?',
            [supplierId, context.tenantId]
        ).catch(() => []);

        const supplier = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0][0] : rows[0]) : null;


        return res.json({
            ok: true,
            data: {
                userId: context.userId,
                role: context.role,
                tenantId: context.tenantId,
                supplierId: supplier ? supplier.id : supplierId,
                status: supplier ? supplier.status : 'ACTIVE',
                name: supplier ? supplier.name : 'Authorized Paper Supplier',
                currencies: supplier && supplier.metadata_json ? (typeof supplier.metadata_json === 'string' ? JSON.parse(supplier.metadata_json).currencies : supplier.metadata_json.currencies) : ['EUR']
            }
        });
    } catch (err) {
        console.error('[PAPER-SUPPLIERS][ME-ERROR]', err);
        return res.status(500).json({ ok: false, error: err.message, code: 'SUPPLIER_PROFILE_ERROR' });
    }
});

/**
 * GET /api/v1/paper-suppliers/status
 * Diagnostic status endpoint for supplier hub availability.
 */
router.get('/status', (req, res) => {
    const context = resolveActorContext(req);
    res.json({
        ok: true,
        hub: 'PAPER_SUPPLIER_HUB',
        version: '1.0.0',
        actor: {
            userId: context.userId,
            role: context.role,
            isSupplierUser: context.isSupplierUser,
            isSupplierAdmin: context.isSupplierAdmin,
            isSupplierOperator: context.isSupplierOperator
        }
    });
});

module.exports = router;
