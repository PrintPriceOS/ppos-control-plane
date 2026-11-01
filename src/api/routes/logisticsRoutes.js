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
 * - POST /api/logistics/shipments/:id/labels/sscc-pdf
 * - GET  /api/logistics/shipments/:id/delivery-note/pdf
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
const {
    generateSsccLabelsPdf,
    generateDeliveryNotePdf,
    generateCarrierProtocolPdf
} = require('../services/logistics/deliveryNotePdfService');
const {
    ingestCarrierMilestone,
    listPublisherPodNotifications,
    runEpalSettlementSweep,
    startEpalSettlementScheduler,
    stopEpalSettlementScheduler,
    getEpalSettlementSchedulerStatus,
    consolidateOrderLandedCost
} = require('../services/logistics/carrierMilestoneAndEpalService');

function requireLogisticsControlPlaneAuth(req, res, next) {
    const mktToken = req.headers && req.headers['x-marketplace-token'];
    const expectedToken = process.env.PPOS_MARKETPLACE_INTAKE_TOKEN || process.env.PPOS_CONTROL_TOKEN;
    const hasValidMktToken = Boolean(mktToken && expectedToken && mktToken === expectedToken);

    const role =
        (req.user && req.user.role) ||
        (req.headers && (req.headers['x-user-role'] || req.headers['x-ppos-role'])) ||
        (hasValidMktToken ? 'CUSTOMER' : null);

    const allowedRoles = new Set([
        'PRINTHOUSE_OPERATOR',
        'PRINTHOUSE_ADMIN',
        'TENANT_ADMIN',
        'OPS_ADMIN',
        'ADMIN',
        'SUPER_ADMIN',
        'OPERATOR',
        'SYSTEM'
    ]);

    const reqPath = String(req.path || req.url || req.originalUrl || '');
    const isDocumentReadOrLabelRoute =
        reqPath.includes('/delivery-note/pdf') ||
        reqPath.includes('/labels/sscc-pdf') ||
        reqPath.includes('/carrier-protocol/pdf') ||
        reqPath.includes('/pod-notifications');

    if (isDocumentReadOrLabelRoute) {
        allowedRoles.add('CUSTOMER');
        allowedRoles.add('PUBLISHER');
        allowedRoles.add('AUTHOR');
    }

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
                quote,
                logisticsCubing: quote.logisticsCubing
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

    /**
     * POST & GET /shipments/:id/labels/sscc-pdf (mounted at /api/logistics/shipments/:id/labels/sscc-pdf)
     * Generates GS1-128 SSCC-18 pallet labels in binary PDF buffer (A6 1-page-per-pallet default, or ?format=A4_SHEET_4UP).
     */
    const handleSsccLabelsPdf = async (req, res) => {
        try {
            const shipmentId = req.params.id;
            const format = (req.query && req.query.format) || (req.body && req.body.format) || 'A6';
            const body = { ...(req.query || {}), ...(req.body || {}) };

            // Enforce tenant isolation against shipment tenantId if specified
            const authTenantId = req.user && req.user.tenantId;
            const role = String((req.user && req.user.role) || (req.headers && req.headers['x-user-role']) || '').toUpperCase();
            if (authTenantId && body.tenantId && String(authTenantId) !== String(body.tenantId) && role !== 'SUPER_ADMIN') {
                return res.status(403).json({
                    ok: false,
                    error: 'FORBIDDEN_TENANT_MISMATCH: Cross-tenant shipment label generation is prohibited.'
                });
            }

            const result = await generateSsccLabelsPdf({
                shipmentId,
                format,
                shipmentData: body
            });

            if (typeof res.setHeader === 'function') {
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader(
                    'Content-Disposition',
                    `inline; filename="sscc-labels-${shipmentId}-${result.format}.pdf"`
                );
                res.setHeader('Content-Length', String(result.buffer.length));
                res.setHeader('X-PPOS-Label-Format', result.format);
                res.setHeader('X-PPOS-Page-Count', String(result.pageCount));
            }

            return res.status(200).send(result.buffer);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    };

    router.post('/shipments/:id/labels/sscc-pdf', handleSsccLabelsPdf);
    router.get('/shipments/:id/labels/sscc-pdf', handleSsccLabelsPdf);

    /**
     * GET /shipments/:id/delivery-note/pdf (mounted at /api/logistics/shipments/:id/delivery-note/pdf)
     * Generates the official DIN A4 Delivery Note / Lieferschein / Albarán de Entrega in binary PDF buffer.
     */
    router.get('/shipments/:id/delivery-note/pdf', async (req, res) => {
        try {
            const shipmentId = req.params.id;
            const shipmentData = {
                ...(req.query || {}),
                ...(req.body || {})
            };

            const result = await generateDeliveryNotePdf({
                shipmentId,
                shipmentData
            });

            if (typeof res.setHeader === 'function') {
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader(
                    'Content-Disposition',
                    `inline; filename="delivery-note-${shipmentId}.pdf"`
                );
                res.setHeader('Content-Length', String(result.buffer.length));
                res.setHeader('X-PPOS-Page-Count', String(result.pageCount));
            }

            return res.status(200).send(result.buffer);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    /**
     * GET /carrier-protocol/pdf (mounted at /api/logistics/carrier-protocol/pdf)
     * Generates the official DIN A4 Carrier Integration Protocol & Service Conditions PDF buffer.
     */
    router.get('/carrier-protocol/pdf', async (req, res) => {
        try {
            const options = {
                ...(req.query || {}),
                ...(req.body || {})
            };

            const result = await generateCarrierProtocolPdf(options);

            if (typeof res.setHeader === 'function') {
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader(
                    'Content-Disposition',
                    'inline; filename="ppos-carrier-service-protocol-A4.pdf"'
                );
                res.setHeader('Content-Length', String(result.buffer.length));
                res.setHeader('X-PPOS-Page-Count', String(result.pageCount));
                res.setHeader('X-PPOS-Protocol-Version', result.protocolVersion);
            }

            return res.status(200).send(result.buffer);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    /**
     * POST /carrier/milestones (mounted at /api/logistics/carrier/milestones)
     * Telematic webhook for carrier scan events (GS1-128 SSCC-18), digital POD closure,
     * and immediate EPAL dock exchange reporting.
     */
    router.post('/carrier/milestones', async (req, res) => {
        try {
            const body = req.body || {};
            const authContext = {
                userId: req.user && req.user.id,
                role: (req.user && req.user.role) || (req.headers && req.headers['x-user-role']),
                tenantId: req.user && req.user.tenantId,
                printhouseId: req.user && req.user.printhouseId
            };

            const result = ingestCarrierMilestone(body, authContext);
            return res.status(200).json({
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
    });

    /**
     * POST /epal/settlement-run (mounted at /api/logistics/epal/settlement-run)
     * Runs the 14-calendar-day Euro-Pallet EPAL (Palettenschein) settlement evaluation,
     * issuing automatic 15.00 EUR / unit (+ VAT) charges for unreturned pallets.
     */
    router.post('/epal/settlement-run', async (req, res) => {
        try {
            const body = req.body || {};
            const authTenantId = req.user && req.user.tenantId;
            const role = String((req.user && req.user.role) || (req.headers && req.headers['x-user-role']) || '').toUpperCase();

            if (authTenantId && body.tenantId && String(authTenantId) !== String(body.tenantId) && role !== 'SUPER_ADMIN') {
                return res.status(403).json({
                    ok: false,
                    error: 'FORBIDDEN_TENANT_MISMATCH: Cross-tenant EPAL settlement execution is prohibited.'
                });
            }

            const result = runEpalSettlementSweep({
                evaluationDate: body.evaluationDate || new Date().toISOString(),
                tenantId: body.tenantId || authTenantId || null,
                autoSettle: body.autoSettle !== false,
                shipments: Array.isArray(body.shipments) ? body.shipments : null
            });

            return res.status(200).json({
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
    });

    /**
     * GET /epal/scheduler-status (mounted at /api/logistics/epal/scheduler-status)
     * Returns the live status of the automated daily 14-day EPAL settlement cron daemon.
     */
    router.get('/epal/scheduler-status', async (req, res) => {
        try {
            const status = getEpalSettlementSchedulerStatus();
            return res.status(200).json({
                ok: true,
                success: true,
                scheduler: status
            });
        } catch (err) {
            return res.status(err.statusCode || 500).json({
                ok: false,
                error: err.message
            });
        }
    });

    /**
     * POST /epal/scheduler-control (mounted at /api/logistics/epal/scheduler-control)
     * Starts or stops the automated daily EPAL settlement scheduler.
     */
    router.post('/epal/scheduler-control', async (req, res) => {
        try {
            const body = req.body || {};
            const action = String(body.action || 'START').trim().toUpperCase();
            let scheduler;
            if (action === 'STOP') {
                scheduler = stopEpalSettlementScheduler();
            } else {
                scheduler = startEpalSettlementScheduler({
                    intervalMs: body.intervalMs,
                    runOnBoot: Boolean(body.runImmediately)
                });
            }
            return res.status(200).json({
                ok: true,
                success: true,
                scheduler
            });
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    /**
     * GET /notifications/publisher-pod (mounted at /api/logistics/notifications/publisher-pod)
     * Lists automatic publisher POD delivery notifications & outgoing webhook dispatches.
     */
    router.get('/notifications/publisher-pod', async (req, res) => {
        try {
            const authTenantId = req.user && req.user.tenantId;
            const queryTenantId = (req.query && req.query.tenantId) || authTenantId || null;
            const shipmentId = (req.query && req.query.shipmentId) || null;

            const notifications = listPublisherPodNotifications({
                tenantId: queryTenantId,
                shipmentId
            });

            return res.status(200).json({
                ok: true,
                success: true,
                count: notifications.length,
                notifications
            });
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    /**
     * POST /landed-cost/consolidate (mounted at /api/logistics/landed-cost/consolidate)
     * Consolidates manufacturing, packaging consumables, actual vs quoted carrier freight,
     * and overdue 14-day EPAL Palettenschein settlement charges (`EPAL-SETTLE-*`) into the order balance.
     */
    router.post('/landed-cost/consolidate', async (req, res) => {
        try {
            const body = req.body || {};
            const authContext = {
                userId: req.user && req.user.id,
                role: (req.user && req.user.role) || (req.headers && req.headers['x-user-role']),
                tenantId: req.user && req.user.tenantId,
                printhouseId: req.user && req.user.printhouseId
            };

            const result = await consolidateOrderLandedCost(body, authContext);
            return res.status(200).json({
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
    });

    return router;
}

const defaultRouter = createLogisticsRouter();
defaultRouter.createLogisticsRouter = createLogisticsRouter;
defaultRouter.requireLogisticsControlPlaneAuth = requireLogisticsControlPlaneAuth;

module.exports = defaultRouter;
