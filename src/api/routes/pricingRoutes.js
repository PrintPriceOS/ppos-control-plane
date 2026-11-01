'use strict';

/**
 * src/api/routes/pricingRoutes.js
 *
 * PrintPrice OS — Phase 14B: Bidirectional MySQL Pricing Intelligence Engine & Live Calibrator REST API
 *
 * Exposes:
 * - GET  /api/pricing/profiles
 * - POST /api/pricing/profiles
 * - POST /api/pricing/calibrate
 * - GET  /api/pricing/crossover
 *
 * Protected by `requireLogisticsControlPlaneAuth` (multi-tenant isolation & RBAC).
 */

const {
    getPricingProfilesAsync,
    savePricingProfileAsync,
    calibrateQuote,
    calculateCrossoverPoint
} = require('../services/pricing/pricingIntelligenceService');

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
            error: 'FORBIDDEN: Valid Control Plane or Printhouse role is required to access Pricing Intelligence APIs.'
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
            error: 'FORBIDDEN_TENANT_MISMATCH: Cross-tenant pricing access is prohibited.'
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

function createPricingRouter() {
    let router;
    try {
        const express = require('express');
        router = express.Router({ mergeParams: true });
    } catch (_) {
        router = createFallbackRouter();
    }

    router.use(requireLogisticsControlPlaneAuth);

    // GET /api/pricing/profiles
    router.get('/profiles', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.query && req.query.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const data = await getPricingProfilesAsync(tenantId);
            return res.status(200).json(data);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/pricing/profiles
    router.post('/profiles', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const result = await savePricingProfileAsync(tenantId, req.body || {});
            return res.status(200).json(result);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/pricing/calibrate
    router.post('/calibrate', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const result = calibrateQuote(tenantId, req.body || {});
            return res.status(200).json(result);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // GET /api/pricing/crossover
    router.get('/crossover', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.query && req.query.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            await getPricingProfilesAsync(tenantId);
            const result = calculateCrossoverPoint(tenantId, req.query || {});
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

const defaultRouter = createPricingRouter();
defaultRouter.createPricingRouter = createPricingRouter;
defaultRouter.requireLogisticsControlPlaneAuth = requireLogisticsControlPlaneAuth;

module.exports = defaultRouter;
