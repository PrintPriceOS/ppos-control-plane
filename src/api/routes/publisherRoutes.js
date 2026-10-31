'use strict';

/**
 * src/api/routes/publisherRoutes.js
 *
 * PrintPrice OS — Phase 11C: Publisher B2B Hub & 3D Soft-Proofing Engine REST API
 *
 * Exposes:
 * - GET  /api/publisher/orders                  -> Active & completed orders for the authenticated publisher
 * - POST /api/publisher/orders                  -> Submit a new editorial title
 * - GET  /api/publisher/orders/:id              -> Order detail & 3D Soft-Proofing geometry
 * - GET  /api/publisher/orders/:id/telemetry    -> 6-stage real-time manufacturing timeline & logistics tracking
 * - POST /api/publisher/orders/:id/proof-decision -> Formal 3D Soft-Proof approval ('APPROVED' / 'REJECTED')
 * - GET  /api/publisher/orders/:id/certificates/fsc-pefc -> FSC/PEFC Chain of Custody certificate
 *
 * Protected by `requirePublisherHubAuth` (enforcing `PUBLISHER` or `PRINTHOUSE_ADMIN`/`SUPER_ADMIN`
 * in impersonation mode, and strict `publisherTenantId` isolation).
 */

const {
    getPublisherOrders,
    getPublisherOrderDetail,
    getPublisherTimeline,
    submitProofApproval,
    createPublisherOrder
} = require('../services/publisher/publisherHubService');

function resolvePublisherTenantId(req) {
    const authUser = req.user || {};
    const role = String(
        authUser.role || (req.headers && req.headers['x-user-role']) || ''
    ).toUpperCase();

    const authTenantId =
        authUser.publisherTenantId ||
        authUser.tenantId ||
        (req.headers && req.headers['x-publisher-tenant-id']) ||
        (req.headers && req.headers['x-tenant-id']);

    const requestedTenantId =
        (req.query && (req.query.publisherTenantId || req.query.tenantId)) ||
        (req.body && (req.body.publisherTenantId || req.body.tenantId)) ||
        (req.headers && req.headers['x-target-publisher-tenant-id']);

    const canImpersonate = role === 'SUPER_ADMIN' || role === 'PRINTHOUSE_ADMIN';

    if (canImpersonate && requestedTenantId) {
        return String(requestedTenantId);
    }

    return String(authTenantId || 'tenant-publisher-penguin');
}

function requirePublisherHubAuth(req, res, next) {
    const role = String(
        (req.user && req.user.role) || (req.headers && req.headers['x-user-role']) || ''
    ).toUpperCase();

    const allowedRoles = new Set([
        'PUBLISHER',
        'PUBLISHER_ADMIN',
        'PUBLISHER_EDITOR',
        'PRINTHOUSE_ADMIN',
        'TENANT_ADMIN',
        'SUPER_ADMIN'
    ]);

    if (!role || !allowedRoles.has(role)) {
        return res.status(403).json({
            ok: false,
            error: 'FORBIDDEN_ROLE: Valid PUBLISHER (or PRINTHOUSE_ADMIN in impersonation mode) role is required.'
        });
    }

    const authTenantId =
        (req.user && (req.user.publisherTenantId || req.user.tenantId)) ||
        (req.headers && (req.headers['x-publisher-tenant-id'] || req.headers['x-tenant-id']));

    const requestedTenantId =
        (req.query && (req.query.publisherTenantId || req.query.tenantId)) ||
        (req.body && (req.body.publisherTenantId || req.body.tenantId));

    const canImpersonate = role === 'SUPER_ADMIN' || role === 'PRINTHOUSE_ADMIN';

    if (
        !canImpersonate &&
        authTenantId &&
        requestedTenantId &&
        String(authTenantId) !== String(requestedTenantId)
    ) {
        return res.status(403).json({
            ok: false,
            error: 'FORBIDDEN_CROSS_TENANT_ACCESS: Publisher users cannot query another publisherTenantId.'
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

function createPublisherRouter() {
    let router;
    try {
        const express = require('express');
        router = express.Router({ mergeParams: true });
    } catch (_) {
        router = createFallbackRouter();
    }

    router.use(requirePublisherHubAuth);

    // GET /api/publisher/orders
    router.get('/orders', async (req, res) => {
        try {
            const publisherTenantId = resolvePublisherTenantId(req);
            const role =
                (req.user && req.user.role) ||
                (req.headers && req.headers['x-user-role']) ||
                'PUBLISHER';

            const payload = getPublisherOrders({
                publisherTenantId,
                role: 'PUBLISHER' // Always enforce publisher sanitization on B2B Hub endpoints
            });
            payload.viewerRole = String(role).toUpperCase();
            return res.status(200).json(payload);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/publisher/orders
    router.post('/orders', async (req, res) => {
        try {
            const publisherTenantId = resolvePublisherTenantId(req);
            const created = createPublisherOrder(req.body || {}, {
                publisherTenantId,
                role: 'PUBLISHER'
            });
            return res.status(201).json({
                ok: true,
                publisherTenantId,
                order: created
            });
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // GET /api/publisher/orders/:id
    router.get('/orders/:id', async (req, res) => {
        try {
            const publisherTenantId = resolvePublisherTenantId(req);
            const orderId = req.params && req.params.id;
            const detail = getPublisherOrderDetail({
                orderId,
                publisherTenantId,
                role: 'PUBLISHER'
            });
            return res.status(200).json(detail);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // GET /api/publisher/orders/:id/telemetry
    router.get('/orders/:id/telemetry', async (req, res) => {
        try {
            const publisherTenantId = resolvePublisherTenantId(req);
            const orderId = req.params && req.params.id;
            const telemetry = getPublisherTimeline({
                orderId,
                publisherTenantId,
                role: 'PUBLISHER'
            });
            return res.status(200).json(telemetry);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/publisher/orders/:id/proof-decision
    router.post('/orders/:id/proof-decision', async (req, res) => {
        try {
            const publisherTenantId = resolvePublisherTenantId(req);
            const orderId = req.params && req.params.id;
            const userId =
                (req.user && req.user.id) ||
                (req.body && req.body.userId) ||
                (req.headers && req.headers['x-user-id']) ||
                'publisher-editor';

            const result = submitProofApproval({
                orderId,
                publisherTenantId,
                userId,
                role: 'PUBLISHER',
                decision: req.body && req.body.decision,
                comments: req.body && req.body.comments,
                inspectionNotes: req.body && req.body.inspectionNotes
            });

            return res.status(200).json(result);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // GET /api/publisher/orders/:id/certificates/fsc-pefc
    router.get('/orders/:id/certificates/fsc-pefc', async (req, res) => {
        try {
            const publisherTenantId = resolvePublisherTenantId(req);
            const orderId = req.params && req.params.id;
            const { order } = getPublisherOrderDetail({
                orderId,
                publisherTenantId,
                role: 'PUBLISHER'
            });
            return res.status(200).json({
                ok: true,
                certificateType: 'FSC_PEFC_CHAIN_OF_CUSTODY',
                certificateCode: order.fscCertificateCode,
                orderId: order.orderId,
                isbn: order.isbn,
                title: order.title,
                substrateVerified: order.paperSpecification,
                issuedAt: new Date().toISOString()
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

const defaultRouter = createPublisherRouter();
defaultRouter.createPublisherRouter = createPublisherRouter;
defaultRouter.requirePublisherHubAuth = requirePublisherHubAuth;

module.exports = defaultRouter;

