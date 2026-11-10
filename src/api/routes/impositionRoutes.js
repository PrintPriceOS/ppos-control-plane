'use strict';

/**
 * src/api/routes/impositionRoutes.js
 *
 * PrintPrice OS — Phase 11B: Dynamic Imposition & Gang-Run Dispatcher Engine REST API
 *
 * Exposes:
 * - POST /api/manufacturing/imposition/plan
 * - POST /api/manufacturing/imposition/dispatch-queue
 * - GET  /api/manufacturing/imposition/queue
 *
 * Protected by `requireLogisticsControlPlaneAuth` (multi-tenant isolation & role enforcement).
 */

const {
    IMPOSITION_STANDARDS,
    MACHINE_SHEET_FORMATS,
    resolveMasterCatalogVariant,
    planImpositionJob,
    dispatchImpositionJob,
    listDispatchedImpositionQueue
} = require('../services/manufacturing/impositionEngineService');
const {
    generateJdfJobTicketXml,
    processJmfTelemetrySignal,
    simulateJmfTelemetryBurst
} = require('../services/manufacturing/jdfConnectorService');

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
            error: 'FORBIDDEN: Valid Control Plane or Printhouse role is required to access Imposition & Manufacturing Queue APIs.'
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

function createImpositionRouter() {
    let router;
    try {
        const express = require('express');
        router = express.Router({ mergeParams: true });
    } catch (_) {
        router = createFallbackRouter();
    }

    router.use(requireLogisticsControlPlaneAuth);

    // GET /api/manufacturing/imposition/queue
    router.get('/queue', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.query && req.query.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';

            const dispatches = listDispatchedImpositionQueue(tenantId);
            return res.status(200).json({
                ok: true,
                tenantId,
                standards: IMPOSITION_STANDARDS,
                machineFormats: MACHINE_SHEET_FORMATS,
                dispatches
            });
        } catch (err) {
            return res.status(400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // Helper to enrich payload with master catalog substrate attributes when variantId is supplied
    async function enrichPayloadWithCatalogVariant(rawPayload = {}) {
        const payload = { ...rawPayload };
        const varId = payload.variantId || payload.variant_id;
        if (varId) {
            const dbVariant = await resolveMasterCatalogVariant(varId);
            if (dbVariant) {
                if (!payload.caliperUm && !payload.caliper_um && dbVariant.caliper_um) {
                    payload.caliperUm = Number(dbVariant.caliper_um);
                }
                if (!payload.paperGrammage && !payload.gsm && dbVariant.gsm) {
                    payload.paperGrammage = Number(dbVariant.gsm);
                }
                if (!payload.paperBulk && !payload.bulkFactor && dbVariant.bulk_factor) {
                    payload.paperBulk = Number(dbVariant.bulk_factor);
                }
                if (!payload.grainDirection && !payload.grain_direction && dbVariant.grain_direction) {
                    payload.grainDirection = dbVariant.grain_direction;
                }
            }
        }
        return payload;
    }

    // POST /api/manufacturing/imposition/plan
    router.post('/plan', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';

            const enrichedBody = await enrichPayloadWithCatalogVariant(req.body || {});
            const plan = planImpositionJob(enrichedBody, {
                tenantId,
                actorId: (req.user && req.user.id) || 'workshop-operator'
            });

            return res.status(200).json(plan);
        } catch (err) {
            return res.status(400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/manufacturing/imposition/dispatch-queue
    router.post('/dispatch-queue', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';

            const enrichedBody = await enrichPayloadWithCatalogVariant(req.body || {});
            const dispatchRecord = dispatchImpositionJob(enrichedBody, {
                tenantId,
                actorId: (req.user && req.user.id) || 'workshop-operator'
            });

            return res.status(200).json(dispatchRecord);
        } catch (err) {
            return res.status(400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // GET /api/manufacturing/imposition/:jobId/jdf-ticket.xml
    router.get('/:jobId/jdf-ticket.xml', async (req, res) => {
        try {
            const jobId = req.params && req.params.jobId;
            const enrichedQuery = await enrichPayloadWithCatalogVariant({
                ...(req.query || {}),
                jobId
            });
            const ticket = generateJdfJobTicketXml(enrichedQuery);
            if (typeof res.setHeader === 'function') {
                res.setHeader('Content-Type', 'application/vnd.cip4-jdf+xml; charset=utf-8');
            }
            return res.status(200).json(ticket);
        } catch (err) {
            return res.status(400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/manufacturing/imposition/jmf/signal
    router.post('/jmf/signal', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const result = processJmfTelemetrySignal(req.body || {}, { tenantId });
            return res.status(200).json(result);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/manufacturing/imposition/jmf/simulate-burst
    router.post('/jmf/simulate-burst', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const burst = simulateJmfTelemetryBurst(req.body || {}, { tenantId });
            return res.status(200).json(burst);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    return router;
}

const defaultRouter = createImpositionRouter();
defaultRouter.createImpositionRouter = createImpositionRouter;
defaultRouter.requireLogisticsControlPlaneAuth = requireLogisticsControlPlaneAuth;

module.exports = defaultRouter;

