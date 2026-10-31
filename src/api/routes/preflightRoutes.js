'use strict';

/**
 * src/api/routes/preflightRoutes.js
 *
 * PrintPrice OS — Phase 11A: Automated Preflight & Spine Geometry Engine (FIX IT Engine) REST API
 *
 * Exposes:
 * - POST /api/preflight/inspect
 * - POST /api/preflight/auto-fix
 * - GET  /api/preflight/inspections
 *
 * Protected by `requireLogisticsControlPlaneAuth` (multi-tenant isolation & role enforcement).
 */

const {
    PREFLIGHT_STANDARDS,
    MASTER_PAPER_CATALOG,
    inspectPreflightJob,
    executePreflightAutoFix,
    listTenantPreflightInspections,
    getPreflightInspectionById
} = require('../services/preflight/preflightEngineService');

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
            error: 'FORBIDDEN: Valid Control Plane or Printhouse role is required to access Preflight Engine APIs.'
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
            error: 'FORBIDDEN_TENANT_MISMATCH: Cross-tenant access is prohibited.'
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

function createPreflightRouter() {
    let router;
    try {
        const express = require('express');
        router = express.Router({ mergeParams: true });
    } catch (_) {
        router = createFallbackRouter();
    }

    router.use(requireLogisticsControlPlaneAuth);

    // GET /api/preflight/inspections
    router.get('/inspections', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.query && req.query.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';

            const inspections = listTenantPreflightInspections(tenantId);
            return res.status(200).json({
                ok: true,
                tenantId,
                standards: PREFLIGHT_STANDARDS,
                paperCatalog: MASTER_PAPER_CATALOG,
                inspections
            });
        } catch (err) {
            return res.status(400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // GET /api/preflight/inspections/:id
    router.get('/inspections/:id', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.query && req.query.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const inspectionId = req.params && req.params.id;
            let inspection = getPreflightInspectionById(inspectionId, tenantId);
            if (!inspection) {
                inspection = inspectPreflightJob(
                    {
                        jobId: inspectionId,
                        pageCount: 240,
                        paperGrammage: 90,
                        paperBulk: 1.3,
                        bindingType: 'SOFTCOVER_PUR',
                        innerBleedMm: 3.0,
                        declaredSpineMm: 14.54
                    },
                    { tenantId }
                );
            }
            return res.status(200).json({
                ok: true,
                tenantId,
                inspection
            });
        } catch (err) {
            return res.status(400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/preflight/inspect
    router.post('/inspect', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';

            const report = inspectPreflightJob(req.body || {}, {
                tenantId,
                actorId: (req.user && req.user.id) || 'workshop-operator'
            });

            return res.status(200).json(report);
        } catch (err) {
            return res.status(400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/preflight/auto-fix
    router.post('/auto-fix', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';

            const fixOrder = executePreflightAutoFix(req.body || {}, {
                tenantId,
                actorId: (req.user && req.user.id) || 'workshop-operator'
            });

            return res.status(200).json(fixOrder);
        } catch (err) {
            return res.status(400).json({
                ok: false,
                error: err.message
            });
        }
    });

    return router;
}

const defaultRouter = createPreflightRouter();
defaultRouter.createPreflightRouter = createPreflightRouter;
defaultRouter.requireLogisticsControlPlaneAuth = requireLogisticsControlPlaneAuth;

module.exports = defaultRouter;

