const express = require('express');
const router = express.Router();
const notificationService = require('../services/productionNotificationService');

/**
 * GET /api/admin/production/notifications
 * List notifications for the current tenant/user
 */
router.get('/', async (req, res) => {
  try {
    const { limit = 20, isRead } = req.query;
    // Note: In a real multi-user scenario, we'd use the authenticated user ID
    // For now, we use the tenant context from the middleware
    const notifications = await notificationService.getMyNotifications(req.tenantId, req.userId, parseInt(limit));
    res.json({ ok: true, notifications });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/admin/production/notifications/:id/read
 * Mark a notification as read
 */
router.post('/:id/read', async (req, res) => {
  try {
    await notificationService.markAsRead(req.params.id, req.tenantId);
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
    await notificationService.markAllAsRead(req.tenantId, req.userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
