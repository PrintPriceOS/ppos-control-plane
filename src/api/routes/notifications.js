const express = require('express');
const router = express.Router();
const notificationService = require('../services/ManufacturingNotificationService');
const logger = require('../services/logger').child('admin-notifications');

/**
 * GET /api/admin/production/notifications
 * List notifications for the current tenant/user
 */
router.get('/', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || `trace_${Date.now()}`;
  try {
    const { limit = 20 } = req.query;
    const { resolveActorContext } = require('../middleware/auth');
    const context = resolveActorContext(req);
    context.traceId = traceId;

    const notifications = await notificationService.getMyNotifications(context.tenantId, context.userId, parseInt(limit));
    res.json({ ok: true, notifications: notifications || [], source_status: "ACTIVE" });
  } catch (err) {
    logger.warn({
        event: 'NOTIFICATION_LIST_DEGRADED',
        error: err.message,
        traceId
    });
    
    // Always return honest empty/degraded payload when data source is unavailable
    return res.json({ 
        ok: true, 
        notifications: [], 
        source_status: "NOTIFICATIONS_UNAVAILABLE" 
    });
  }
});


/**
 * POST /api/admin/production/notifications/:id/read
 * Mark a notification as read
 */
router.post('/:id/read', async (req, res) => {
  try {
    const { resolveActorContext } = require('../middleware/auth');
    const context = resolveActorContext(req);
    await notificationService.markAsRead(req.params.id, context.tenantId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/admin/production/notifications/read-all
 * Mark all notifications as read
 */
router.post('/read-all', async (req, res) => {
  try {
    const { resolveActorContext } = require('../middleware/auth');
    const context = resolveActorContext(req);
    await notificationService.markAllAsRead(context.tenantId, context.userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
