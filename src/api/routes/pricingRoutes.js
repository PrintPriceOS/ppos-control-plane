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

const industrialMaterialsService = require('../services/materials/industrialMaterialsCatalogService');

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
        'PUBLISHER',
        'DEVELOPER_SANDBOX'
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
            const data = await getTenantMaterialsCatalogAsync(tenantId, undefined, req.query || {});
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

    // PUT /api/pricing/materials/:id
    router.put('/materials/:id', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const updated = await industrialMaterialsService.upsertIndustrialMaterial(
                { ...(req.body || {}), id: req.params.id },
                { tenantId },
                undefined,
                true
            );
            const result = await addMaterialToCatalogAsync(tenantId, updated);
            return res.status(200).json({ ok: true, material: updated, materials: result.materials });
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // DELETE /api/pricing/materials/:id
    router.delete('/materials/:id', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.query && req.query.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const archived = await industrialMaterialsService.archiveIndustrialMaterial(req.params.id, { tenantId });
            return res.status(200).json(archived);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/pricing/materials/sync-master
    router.post('/materials/sync-master', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const synced = await industrialMaterialsService.syncMasterIndustrialCatalog({ tenantId });
            for (const item of synced.materials) {
                await addMaterialToCatalogAsync(tenantId, item).catch(() => {});
            }
            return res.status(200).json(synced);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/pricing/materials/bulk-activate
    router.post('/materials/bulk-activate', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const printhouseId =
                (req.user && req.user.printhouseId) ||
                (req.body && req.body.printhouseId) ||
                (req.headers && req.headers['x-printhouse-id']) ||
                'GLOBAL_MASTER';
            const { variantIds, ratePerKgEur } = req.body || {};
            const result = await industrialMaterialsService.bulkActivateMasterVariants({
                variantIds: Array.isArray(variantIds) ? variantIds : [],
                ratePerKgEur: Number(ratePerKgEur) || 1.34,
                scope: { tenantId, printhouseId }
            });
            for (const item of result.materials) {
                await addMaterialToCatalogAsync(tenantId, item).catch(() => {});
            }
            return res.status(200).json(result);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/pricing/materials/import-rate-card-csv
    router.post('/materials/import-rate-card-csv', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const printhouseId =
                (req.user && req.user.printhouseId) ||
                (req.body && req.body.printhouseId) ||
                (req.headers && req.headers['x-printhouse-id']) ||
                'GLOBAL_MASTER';
            const { csvText } = req.body || {};
            if (!csvText) {
                return res.status(400).json({ ok: false, error: 'CSV_TEXT_REQUIRED' });
            }
            const result = await industrialMaterialsService.importPaperRateCardCsv({
                csvText,
                scope: { tenantId, printhouseId }
            });
            for (const item of result.materials) {
                await addMaterialToCatalogAsync(tenantId, item).catch(() => {});
            }
            return res.status(200).json(result);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/pricing/materials/validate-compatibility
    router.post('/materials/validate-compatibility', async (req, res) => {
        try {
            const { machine, substrate } = req.body || {};
            if (!machine || !substrate) {
                return res.status(400).json({
                    ok: false,
                    error: 'MISSING_PAYLOAD: machine and substrate objects are both required.'
                });
            }
            const validation = industrialMaterialsService.validateMachineSubstrateCompatibility(machine, substrate);
            return res.status(200).json({ ok: true, ...validation });
        } catch (err) {
            return res.status(500).json({
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

    // POST /api/pricing/book-estimate — Phase 199C Interactive Developer Console & BPE Real-Time Calculator
    router.post('/book-estimate', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';

            const body = req.body || {};
            const copies = Math.max(1, Number(body.printRunCopies || body.copies || 1000));
            const pageCount = Math.max(4, Number(body.pageCount || body.interior_pages || 240));
            const trimWidthMm = Number(body.trimWidthMm || 148);
            const trimHeightMm = Number(body.trimHeightMm || 210);
            const interiorPaperGsm = Number(body.interiorPaperGsm || 90);
            const bindingType = String(body.bindingType || body.binding_method || 'SOFTCOVER_PUR');

            const calibrated = calibrateQuote(tenantId, {
                ...body,
                copies,
                pageCount,
                trimWidthMm,
                trimHeightMm,
                interiorPaperGsm,
                bindingType
            });

            const crossover = calculateCrossoverPoint(tenantId, {
                pageCount,
                trimWidthMm,
                trimHeightMm,
                interiorPaperGsm
            });

            return res.status(200).json({
                ok: true,
                success: true,
                tenantId,
                engine: 'PPOS_5AXIS_BPE_V2',
                input: {
                    trimWidthMm,
                    trimHeightMm,
                    pageCount,
                    printRunCopies: copies,
                    interiorPaperGsm,
                    bindingType
                },
                estimate: calibrated.calibration || calibrated,
                crossover: {
                    qStarCopies: crossover?.crossoverQuantity || 750,
                    recommendedTechnology: copies >= (crossover?.crossoverQuantity || 750) ? 'SHEETFED_OFFSET' : 'HIGH_SPEED_INKJET_DIGITAL'
                },
                timestamp: new Date().toISOString()
            });
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
