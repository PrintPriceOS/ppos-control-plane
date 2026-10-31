'use strict';

/**
 * src/api/routes/escrowRoutes.js
 *
 * PrintPrice OS — Phase 12A: Commercial Escrow & Split-Payout Settlement REST API
 *
 * Exposes:
 * - GET  /api/financials/escrow/ledger
 * - POST /api/financials/escrow/lock
 * - POST /api/financials/escrow/:orderId/settle-on-pod
 *
 * Protected by `requireLogisticsControlPlaneAuth` (multi-tenant isolation & RBAC).
 */

const {
    lockEscrowFundsOnProofApproval,
    settleEscrowOnSignedPod,
    listEscrowLedger
} = require('../services/financials/escrowSettlementService');

function requireLogisticsControlPlaneAuth(req, res, next) {
    const role = (req.user && req.user.role) || (req.headers && req.headers['x-user-role']);
    const allowedRoles = new Set([
        'PRINTHOUSE_OPERATOR',
        'PRINTHOUSE_ADMIN',
        'TENANT_ADMIN',
        'OPS_ADMIN',
        'ADMIN',
        'SUPER_ADMIN',
        'OPERATOR',
        'PUBLISHER'
    ]);

    if (!role || !allowedRoles.has(String(role).toUpperCase())) {
        return res.status(403).json({
            ok: false,
            error: 'FORBIDDEN: Valid Control Plane role is required to access Escrow & Settlement APIs.'
        });
    }

    const authTenantId = req.user && req.user.tenantId;
    const reqTenantId =
        (req.body && req.body.tenantId) ||
        (req.query && req.query.tenantId) ||
        (req.headers && req.headers['x-tenant-id']);

    if (
        authTenantId &&
        reqTenantId &&
        String(authTenantId) !== String(reqTenantId) &&
        String(role).toUpperCase() !== 'SUPER_ADMIN'
    ) {
        return res.status(403).json({
            ok: false,
            error: 'FORBIDDEN_TENANT_MISMATCH: Cross-tenant escrow access is prohibited.'
        });
    }

    if (typeof next === 'function') {
        next();
    }
}

function createFallbackRouter() {
    const stack = [];
    const middlewares = [];
    const addRoute = (method, path, handler) => {
        stack.push({
            route: {
                path,
                methods: { [method]: true },
                stack: [{ handle: handler }]
            }
        });
    };
    return {
        stack,
        middlewares,
        use(fn) {
            middlewares.push(fn);
        },
        get(path, handler) {
            addRoute('get', path, handler);
        },
        post(path, handler) {
            addRoute('post', path, handler);
        }
    };
}

function createEscrowRouter() {
    let router;
    try {
        const express = require('express');
        router = express.Router({ mergeParams: true });
    } catch (_) {
        router = createFallbackRouter();
    }

    router.use(requireLogisticsControlPlaneAuth);

    // GET /api/financials/escrow/ledger
    router.get('/ledger', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.query && req.query.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const ledger = listEscrowLedger(tenantId);
            return res.status(200).json(ledger);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/financials/escrow/lock
    router.post('/lock', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const result = lockEscrowFundsOnProofApproval(req.body || {}, { tenantId });
            return res.status(201).json(result);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/financials/escrow/:orderId/settle-on-pod
    router.post('/:orderId/settle-on-pod', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const orderId = req.params && req.params.orderId;
            const result = settleEscrowOnSignedPod(
                { ...(req.body || {}), orderId },
                { tenantId }
            );
            return res.status(200).json(result);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    return router;
}

const defaultRouter = createEscrowRouter();
defaultRouter.createEscrowRouter = createEscrowRouter;
defaultRouter.requireLogisticsControlPlaneAuth = requireLogisticsControlPlaneAuth;

module.exports = defaultRouter;

