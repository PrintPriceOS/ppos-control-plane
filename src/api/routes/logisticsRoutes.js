'use strict';

/**
 * src/api/routes/logisticsRoutes.js
 *
 * PrintPrice OS — Phase 198A (LOGISTICS-03): Governed Logistics, 3D Cubing & Freight Matrix REST API
 *
 * Exposes:
 * - GET  /api/logistics/warehouses
 * - GET  /api/logistics/warehouses/:code
 * - POST /api/logistics/calculate-quote
 * - GET  /api/printhouses/:id/freight-matrices
 * - PUT  /api/printhouses/:id/freight-matrices
 *
 * Also mounted under `/api/printhouse/onboarding/shipping` for seamless printhouse setup access.
 *
 * Security & Governance Invariants:
 * - Enforces Control Plane role authorization (`PRINTHOUSE_OPERATOR`, `PRINTHOUSE_ADMIN`, `ADMIN`, `SUPER_ADMIN`).
 * - Enforces tenant isolation (`tenantId` checks against cross-tenant spoofing).
 * - Preserves strict segregation between manufacturing, packaging consumables, and carrier freight costs.
 */

const { LogisticsDatabaseService } = require('../services/logistics/logisticsDatabaseService');

function requireLogisticsControlPlaneAuth(req, res, next) {
    const role = (req.user && req.user.role) || (req.headers && req.headers['x-user-role']);
    const allowedRoles = new Set([
        'PRINTHOUSE_OPERATOR',
        'PRINTHOUSE_ADMIN',
        'ADMIN',
        'SUPER_ADMIN',
        'OPERATOR'
    ]);

    if (!role || !allowedRoles.has(String(role).toUpperCase())) {
        return res.status(403).json({
            ok: false,
            error: 'FORBIDDEN: Valid Control Plane or Printhouse role is required to access Logistics APIs.'
        });
    }

    // Tenant spoofing protection when req.user.tenantId is bound
    const authTenantId = req.user && req.user.tenantId;
    const reqTenantId =
        (req.body && req.body.tenantId) ||
        (req.query && req.query.tenantId) ||
        (req.headers && req.headers['x-tenant-id']);
    if (authTenantId && reqTenantId && String(authTenantId) !== String(reqTenantId) && String(role).toUpperCase() !== 'SUPER_ADMIN') {
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
        },
        put(path, handler) {
            addRoute('put', path, handler);
        },
        delete(path, handler) {
            addRoute('delete', path, handler);
        }
    };
}

function createLogisticsRouter(options = {}) {
    let router;
    try {
        const express = require('express');
        router = express.Router({ mergeParams: true });
    } catch (_) {
        router = createFallbackRouter();
    }
    const logisticsService = options.logisticsService || new LogisticsDatabaseService(options);

    router.use(requireLogisticsControlPlaneAuth);

    /**
     * GET /warehouses (mounted at /api/logistics/warehouses)
     * Lists active editorial and fulfillment warehouse delivery profiles.
     */
    router.get('/warehouses', async (req, res) => {
        try {
            const warehouses = await logisticsService.listActiveWarehouseProfiles();
            return res.json({
                ok: true,
                success: true,
                count: warehouses.length,
                warehouses
            });
        } catch (err) {
            return res.status(err.statusCode || 500).json({
                ok: false,
                error: err.message
            });
        }
    });

    /**
     * GET /warehouses/:code (mounted at /api/logistics/warehouses/:code)
     * Returns detailed constraints and penalties for a specific warehouse profile.
     */
    router.get('/warehouses/:code', async (req, res) => {
        try {
            const warehouse = await logisticsService.getWarehouseProfileByCode(req.params.code);
            if (!warehouse) {
                return res.status(404).json({
                    ok: false,
                    error: `WAREHOUSE_PROFILE_NOT_FOUND: Profile '${req.params.code}' was not found.`
                });
            }
            return res.json({
                ok: true,
                success: true,
                warehouse
            });
        } catch (err) {
            return res.status(err.statusCode || 500).json({
                ok: false,
                error: err.message
            });
        }
    });

    /**
     * POST /calculate-quote (mounted at /api/logistics/calculate-quote)
     * Computes 3D book/carton/Euro-pallet cubing, warehouse validation,
     * full-pallet run optimization (Delta Q- / Delta Q+), and landed logistics costs.
     */
    router.post('/calculate-quote', async (req, res) => {
        try {
            const body = req.body || {};
            const trimWidthMm = Number(body.trimWidthMm || body.book_width_mm || body.widthMm || 0);
            const trimHeightMm = Number(body.trimHeightMm || body.book_height_mm || body.heightMm || 0);
            const pages = Number(body.pages || body.interior_pages || body.pageCount || 0);
            const quantity = Number(body.quantity || body.copies || 0);

            if (trimWidthMm <= 0 || trimHeightMm <= 0) {
                return res.status(400).json({
                    ok: false,
                    error: 'INVALID_BOOK_DIMENSIONS: trimWidthMm and trimHeightMm must be positive numbers.'
                });
            }

            if (quantity <= 0 && (!Array.isArray(body.segments) || body.segments.length === 0)) {
                return res.status(400).json({
                    ok: false,
                    error: 'INVALID_QUANTITY: quantity must be a positive integer.'
                });
            }

            const quoteParams = {
                ...body,
                trimWidthMm,
                trimHeightMm,
                pages: pages > 0 ? pages : undefined,
                quantity: quantity > 0 ? quantity : 1000,
                warehouseProfileCode: body.warehouseProfileCode || body.warehouse_profile_code || 'ZEITFRACHT_ERFURT',
                destCountry: body.destCountry || body.delivery_country || body.destinationCountry || 'DE',
                destPostal: body.destPostal || body.delivery_postal_code || body.destinationPostalCode || '*'
            };

            const quote = await logisticsService.calculateFullLandedLogisticsQuote(quoteParams);
            return res.json({
                ok: true,
                success: true,
                quote
            });
        } catch (err) {
            const status = err.message && err.message.startsWith('WAREHOUSE_PROFILE_NOT_FOUND')
                ? 404
                : (err.statusCode || 400);
            return res.status(status).json({
                ok: false,
                error: err.message
            });
        }
    });

    /**
     * GET /printhouses/:id/freight-matrices (or /:id/freight-matrices when mounted at /api/printhouses)
     */
    const handleGetFreightMatrices = async (req, res) => {
        try {
            const printhouseId = req.params.id || req.query.printhouseId;
            const includeDefaults = req.query.includePlatformDefaults !== 'false';
            const matrices = await logisticsService.listPrinthouseFreightMatrices(printhouseId, {
                includePlatformDefaults: includeDefaults
            });
            const consumableRates = await logisticsService.getPackagingConsumableRates(printhouseId);

            return res.json({
                ok: true,
                success: true,
                printhouseId,
                count: matrices.length,
                matrices,
                consumableRates
            });
        } catch (err) {
            return res.status(err.statusCode || 500).json({
                ok: false,
                error: err.message
            });
        }
    };

    /**
     * PUT /printhouses/:id/freight-matrices (or /:id/freight-matrices when mounted at /api/printhouses)
     */
    const handlePutFreightMatrices = async (req, res) => {
        try {
            const printhouseId = req.params.id || (req.body && req.body.printhouseId);
            const result = await logisticsService.upsertPrinthouseFreightMatrices(printhouseId, req.body || {});
            return res.json({
                ok: true,
                success: true,
                ...result
            });
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    };

    router.get('/printhouses/:id/freight-matrices', handleGetFreightMatrices);
    router.put('/printhouses/:id/freight-matrices', handlePutFreightMatrices);
    router.get('/:id/freight-matrices', handleGetFreightMatrices);
    router.put('/:id/freight-matrices', handlePutFreightMatrices);

    return router;
}

const defaultRouter = createLogisticsRouter();
defaultRouter.createLogisticsRouter = createLogisticsRouter;
defaultRouter.requireLogisticsControlPlaneAuth = requireLogisticsControlPlaneAuth;

module.exports = defaultRouter;
