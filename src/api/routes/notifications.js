const express = require('express');
const router = express.Router();
const notificationService = require('../services/productionNotificationService');
const logger = require('../services/logger').child('admin-notifications');

/**
 * GET /api/admin/production/notifications
 * List notifications for the current tenant/user
 */
router.get('/', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || `trace_${Date.now()}`;
  try {
    const { limit = 20 } = req.query;
    const context = {
        userId: req.user.id,
        tenantId: req.user.tenantId || 'system',
        traceId
    };

    const notifications = await notificationService.getMyNotifications(context.tenantId, context.userId, parseInt(limit));
    res.json({ ok: true, notifications });
  } catch (err) {
    logger.error({
        event: 'NOTIFICATION_LIST_FAILED',
        error: err.message,
        tenant: req.user.tenantId,
        traceId
    });
    
    // Check if it's a service unavailability issue
    if (err.message.includes('UNAVAILABLE') || err.message.includes('ECONNREFUSED')) {
        return res.status(503).json({ 
            ok: false, 
            status: 'DEGRADED', 
            error: { code: 'SERVICE_UNAVAILABLE', message: 'Notification service is currently unreachable' } 
        });
    }

    res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

/**
 * POST /api/admin/production/notifications/:id/read
 * Mark a notification as read
 */
router.post('/:id/read', async (req, res) => {
  try {
    await notificationService.markAsRead(req.params.id, req.user.tenantId);
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
    await notificationService.markAllAsRead(req.user.tenantId, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
