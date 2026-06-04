const express = require('express');
const router = express.Router();
const notificationService = require('../services/controlPlaneNotificationService');
const logger = require('../services/logger').child('admin-notifications-router');
const { resolveActorContext } = require('../middleware/auth');

/**
 * GET /api/admin/notifications
 * List notifications for the current tenant/user
 */
router.get('/', async (req, res) => {
    try {
        const { limit = 20 } = req.query;
        const context = resolveActorContext(req);

        const notifications = await notificationService.getMyNotifications(context.tenantId, context.userId, parseInt(limit));
        res.json({ ok: true, notifications: notifications || [] });
    } catch (err) {
        logger.warn({ event: 'NOTIFICATION_LIST_DEGRADED', error: err.message });
        return res.json({ ok: true, notifications: [] });
    }
});

/**
 * GET /api/admin/notifications/unread-count
 * Get the count of unread notifications
 */
router.get('/unread-count', async (req, res) => {
    try {
        const context = resolveActorContext(req);
        const count = await notificationService.getUnreadCount(context.tenantId, context.userId);
        res.json({ ok: true, count });
    } catch (err) {
        logger.warn({ event: 'NOTIFICATION_COUNT_DEGRADED', error: err.message });
        return res.json({ ok: true, count: 0 });
    }
});

/**
 * PATCH /api/admin/notifications/:id/read
 * Mark a notification as read
 */
router.patch('/:id/read', async (req, res) => {
    try {
        const context = resolveActorContext(req);
        await notificationService.markAsRead(req.params.id, context.tenantId);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/notifications/mark-all-read
 * Mark all notifications as read
 */
router.post('/mark-all-read', async (req, res) => {
    try {
        const context = resolveActorContext(req);
        await notificationService.markAllAsRead(context.tenantId, context.userId);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
