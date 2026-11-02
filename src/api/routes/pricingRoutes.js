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
    getTenantMaterialsCatalogAsync,
    addMaterialToCatalogAsync,
    savePricingProfileAsync,
    deletePricingProfileAsync,
    calibrateQuote,
    calculateCrossoverPoint
} = require('../services/pricing/pricingIntelligenceService');

const {
    calculateRoutingDecisions,
    forceManualRoutingDecisionAsync,
    getRoutingGovernanceRulesAsync,
    saveRoutingGovernanceRulesAsync,
    getRoutingDecisionsHistoryAsync
} = require('../services/pricing/routingDecisionEngineService');

const {
    registerSseSubscriber,
    listRecentRoutingNotifications,
    emitRoutingNotification
} = require('../services/pricing/routingNotificationService');

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
        },
        put(path, handler) {
            addRoute('put', path, handler);
        },
        delete(path, handler) {
            addRoute('delete', path, handler);
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

    // GET /api/pricing/materials
    router.get('/materials', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.query && req.query.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const data = await getTenantMaterialsCatalogAsync(tenantId);
            return res.status(200).json(data);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/pricing/materials
    router.post('/materials', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const result = await addMaterialToCatalogAsync(tenantId, req.body || {});
            return res.status(200).json(result);
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

    // POST /api/pricing/profiles/:id/save-rates
    router.post('/profiles/:id/save-rates', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const profileId = req.params && req.params.id;
            const payload = {
                ...(req.body || {}),
                id: profileId || (req.body && req.body.id)
            };
            const result = await savePricingProfileAsync(tenantId, payload);
            return res.status(200).json(result);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // DELETE /api/pricing/profiles/:id
    router.delete('/profiles/:id', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.query && req.query.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const profileId = req.params && req.params.id;
            const result = await deletePricingProfileAsync(tenantId, profileId);
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

    // GET /api/pricing/routing-decisions/rules
    router.get('/routing-decisions/rules', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.query && req.query.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const result = await getRoutingGovernanceRulesAsync(tenantId);
            return res.status(200).json(result);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // PUT /api/pricing/routing-decisions/rules
    router.put('/routing-decisions/rules', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const result = await saveRoutingGovernanceRulesAsync(tenantId, req.body || {});
            return res.status(200).json(result);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/pricing/routing-decisions/simulate
    router.post('/routing-decisions/simulate', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const result = await calculateRoutingDecisions(tenantId, req.body || {}, req.body?.options || {});
            return res.status(200).json(result);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // GET /api/pricing/routing-decisions/history
    router.get('/routing-decisions/history', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.query && req.query.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const result = await getRoutingDecisionsHistoryAsync(tenantId);
            return res.status(200).json(result);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/pricing/routing-decisions/force-manual
    router.post('/routing-decisions/force-manual', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const result = await forceManualRoutingDecisionAsync(tenantId, req.body || {});
            return res.status(200).json(result);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // GET /api/pricing/routing-decisions/notifications/stream (or /api/routing/notifications/stream)
    router.get('/routing-decisions/notifications/stream', (req, res) => {
        registerSseSubscriber(req, res, {
            tenantId:
                (req.user && req.user.tenantId) ||
                (req.query && req.query.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default',
            printhouseId:
                (req.user && req.user.printhouseId) ||
                (req.query && req.query.printhouseId) ||
                (req.headers && req.headers['x-printhouse-id']) ||
                'node-primary',
            role:
                (req.user && req.user.role) ||
                (req.query && req.query.role) ||
                (req.headers && req.headers['x-user-role']) ||
                'PRINTHOUSE_ADMIN'
        });
    });

    // GET /api/pricing/routing-decisions/notifications
    router.get('/routing-decisions/notifications', (req, res) => {
        const tenantId =
            (req.user && req.user.tenantId) ||
            (req.query && req.query.tenantId) ||
            (req.headers && req.headers['x-tenant-id']) ||
            'tenant-default';
        const limit = Number((req.query && req.query.limit) || 20);
        const list = listRecentRoutingNotifications(tenantId, limit);
        return res.status(200).json({
            ok: true,
            tenantId,
            notifications: list
        });
    });

    // POST /api/pricing/routing-decisions/notifications/emit (manual/test trigger)
    router.post('/routing-decisions/notifications/emit', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const scenario = (req.body && req.body.scenarioType) || 'ROUTING_ASSIGNED_OPTIMAL';
            const result = await emitRoutingNotification(
                scenario,
                { ...(req.body || {}), tenantId },
                (req.body && req.body.options) || {}
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

const defaultRouter = createPricingRouter();
defaultRouter.createPricingRouter = createPricingRouter;
defaultRouter.requireLogisticsControlPlaneAuth = requireLogisticsControlPlaneAuth;

module.exports = defaultRouter;
