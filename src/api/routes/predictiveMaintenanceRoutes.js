'use strict';

/**
 * src/api/routes/predictiveMaintenanceRoutes.js
 *
 * PrintPrice OS — Phase 12C: Predictive Machine Maintenance & OEE Telemetry REST API
 *
 * Exposes:
 * - GET  /api/machines/predictive-maintenance
 * - POST /api/machines/:machineId/maintenance-reset
 *
 * Protected by `requireLogisticsControlPlaneAuth`.
 */

const {
    listPredictiveMaintenanceFleet,
    scheduleMaintenanceReset
} = require('../services/machines/predictiveMaintenanceService');

function requireLogisticsControlPlaneAuth(req, res, next) {
    const role = (req.user && req.user.role) || (req.headers && req.headers['x-user-role']);
    const allowedRoles = new Set([
        'PRINTHOUSE_OPERATOR',
        'PRINTHOUSE_ADMIN',
        'TENANT_ADMIN',
        'OPS_ADMIN',
        'ADMIN',
        'SUPER_ADMIN',
        'OPERATOR'
    ]);

    if (!role || !allowedRoles.has(String(role).toUpperCase())) {
        return res.status(403).json({
            ok: false,
            error: 'FORBIDDEN: Valid Control Plane or Printhouse role is required to access Predictive Maintenance APIs.'
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

function createPredictiveMaintenanceRouter() {
    let router;
    try {
        const express = require('express');
        router = express.Router({ mergeParams: true });
    } catch (_) {
        router = createFallbackRouter();
    }

    router.use(requireLogisticsControlPlaneAuth);

    // GET /api/machines/predictive-maintenance
    router.get('/predictive-maintenance', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.query && req.query.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const data = listPredictiveMaintenanceFleet(tenantId);
            return res.status(200).json(data);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/machines/:machineId/maintenance-reset
    router.post('/:machineId/maintenance-reset', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const machineId = req.params && req.params.machineId;
            const result = scheduleMaintenanceReset({
                machineId,
                tenantId,
                technicianId: (req.user && req.user.id) || 'plant-chief-engineer'
            });
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

const defaultRouter = createPredictiveMaintenanceRouter();
defaultRouter.createPredictiveMaintenanceRouter = createPredictiveMaintenanceRouter;
defaultRouter.requireLogisticsControlPlaneAuth = requireLogisticsControlPlaneAuth;

module.exports = defaultRouter;

