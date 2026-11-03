'use strict';

/**
 * src/api/routes/routingNotificationsRoutes.js
 *
 * PrintPrice OS — Phase 14E: Real-Time Routing Notifications & SSE Stream Router
 *
 * Exposes:
 * - GET  /api/routing/notifications/stream   (SSE stream with 15s heartbeat)
 * - GET  /api/routing/notifications          (Recent routing notifications list)
 * - POST /api/routing/notifications/emit     (Emit typed routing notification)
 * - PATCH /api/routing/notifications/:id/read (Mark routing notification as read)
 */

const express = require('express');
const {
    registerSseSubscriber,
    listRecentRoutingNotifications,
    emitRoutingNotification,
    markRoutingNotificationRead
} = require('../services/pricing/routingNotificationService');

const router = express.Router({ mergeParams: true });

// GET /api/routing/notifications/stream
router.get('/notifications/stream', (req, res) => {
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

// GET /api/routing/notifications
router.get('/notifications', (req, res) => {
    const tenantId =
        (req.user && req.user.tenantId) ||
        (req.query && req.query.tenantId) ||
        (req.headers && req.headers['x-tenant-id']) ||
        'tenant-default';
    const limit = Number((req.query && req.query.limit) || 20);
    const notifications = listRecentRoutingNotifications(tenantId, limit);
    return res.status(200).json({
        ok: true,
        tenantId,
        notifications
    });
});

// POST /api/routing/notifications/emit
router.post('/notifications/emit', async (req, res) => {
    try {
        const tenantId =
            (req.user && req.user.tenantId) ||
            (req.body && req.body.tenantId) ||
            (req.headers && req.headers['x-tenant-id']) ||
            'tenant-default';
        const scenarioType = (req.body && req.body.scenarioType) || 'ROUTING_ASSIGNED_OPTIMAL';
        const result = await emitRoutingNotification(
            scenarioType,
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

// PATCH /api/routing/notifications/:id/read
router.patch('/notifications/:id/read', (req, res) => {
    const id = req.params && req.params.id;
    markRoutingNotificationRead(id);
    return res.status(200).json({ ok: true, id });
});

module.exports = router;

