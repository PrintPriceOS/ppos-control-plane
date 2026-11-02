const express = require('express');
const router = express.Router();
const notificationService = require('../services/controlPlaneNotificationService');
const {
    listRecentRoutingNotifications,
    markRoutingNotificationRead
} = require('../services/pricing/routingNotificationService');
const logger = require('../services/logger').child('admin-notifications-router');
const { resolveActorContext } = require('../middleware/auth');

function mapRoutingSeverityToBell(sev) {
    const s = String(sev || 'INFO').toUpperCase();
    if (s === 'CRITICAL' || s === 'ERROR') return 'error';
    if (s === 'WARNING') return 'warning';
    if (s === 'SUCCESS') return 'success';
    return 'info';
}

/**
 * GET /api/admin/notifications
 * List notifications for the current tenant/user (merged with real-time routing notifications)
 */
router.get('/', async (req, res) => {
    try {
        const { limit = 20 } = req.query;
        const context = resolveActorContext(req);
        const maxLimit = parseInt(limit) || 20;

        const dbNotifications = await notificationService
            .getMyNotifications(context.tenantId, context.userId, maxLimit)
            .catch(() => []);
        const routingMem = listRecentRoutingNotifications(context.tenantId || 'tenant-default', maxLimit).map((rn) => ({
            id: rn.id,
            user_id: context.userId || null,
            tenant_id: rn.tenantId,
            title: rn.title,
            message: rn.description,
            created_at: rn.timestamp,
            read_at: rn.read ? rn.timestamp : null,
            severity: mapRoutingSeverityToBell(rn.severity),
            action_url: rn.actionUrl || `/pricing-profiles?tab=routing&orderId=${encodeURIComponent(rn.orderId || '')}`,
            event_type: rn.eventType,
            order_id: rn.orderId,
            metadata: rn.metadata
        }));

        const byId = new Map();
        for (const item of [...routingMem, ...(dbNotifications || [])]) {
            if (item && item.id && !byId.has(item.id)) {
                byId.set(item.id, item);
            }
        }

        const merged = Array.from(byId.values())
            .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
            .slice(0, maxLimit);

        res.json({ ok: true, notifications: merged });
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
        const dbCount = await notificationService.getUnreadCount(context.tenantId, context.userId).catch(() => 0);
        const memUnread = listRecentRoutingNotifications(context.tenantId || 'tenant-default', 50).filter(
            (n) => !n.read
        ).length;
        const count = Math.max(Number(dbCount || 0), memUnread);
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
        markRoutingNotificationRead(req.params.id);
        await notificationService.markAsRead(req.params.id, context.tenantId).catch(() => {});
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
        const recent = listRecentRoutingNotifications(context.tenantId || 'tenant-default', 100);
        for (const r of recent) {
            markRoutingNotificationRead(r.id);
        }
        await notificationService.markAllAsRead(context.tenantId, context.userId).catch(() => {});
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
