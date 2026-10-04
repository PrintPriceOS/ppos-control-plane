/**
 * Manufacturing Notification Service
 * 
 * Logic for generating and delivering operational notifications.
 */
const persistence = require('./ManufacturingPersistenceService');
const db = require('./mysqlClient');

class ManufacturingNotificationService {
  /**
   * Helper to check tenant notification preferences before creating or delivering
   */
  async checkPreference(tenantId, alertKey) {
    if (!tenantId) return true;
    try {
      const rows = await db.query('SELECT * FROM tenant_notification_preferences WHERE tenant_id = ?', [tenantId]);
      if (rows && rows.length > 0) {
        const pref = rows[0];
        if (alertKey in pref) {
          return Boolean(pref[alertKey]);
        }
      }
    } catch (e) {
      // Degrade gracefully if table/query unavailable
    }
    return true; // Default allowed
  }

  /**
   * Process a production event and generate notifications if needed
   */
  async handleEvent(event) {
    const { eventType, tenantId, metadata, message, manufacturingPackageId, productionPackageId, dispatchId } = event;
    const pkgId = manufacturingPackageId || productionPackageId;

    try {
      switch (eventType) {
        case 'PACKAGE_DISPATCHED':
          await this.notifyDispatchReceived(event);
          break;
        case 'DISPATCH_ACCEPTED':
          await this.notifyDispatchAccepted(event);
          break;
        case 'DISPATCH_REJECTED':
          await this.notifyDispatchRejected(event);
          break;
        case 'PRODUCTION_COMPLETED':
          await this.notifyProductionCompleted(event);
          break;
        case 'PREFLIGHT_FAILED':
          await this.notifyPreflightFailed(event);
          break;
        case 'SLA_WARNING':
          await this.notifySlaWarning(event);
          break;
        default:
          // For other events, we might just store them but not notify immediately
          break;
      }
    } catch (err) {
      console.error('[NOTIFICATION-SERVICE] Failed to process event:', err);
    }
  }

  async notifyPreflightFailed(event) {
    const { metadata } = event;
    const targetTenantId = metadata?.receiverTenantId || event.tenantId;
    const allowed = await this.checkPreference(targetTenantId, 'email_qc_alerts');
    if (!allowed) return;

    await persistence.createNotification({
      tenantId: targetTenantId,
      title: 'Preflight Verification Failed',
      message: event.message || `Artwork file failed preflight checks: ${metadata?.reason || 'Critical PDF/X violations detected'}.`,
      severity: 'error',
      type: 'PREFLIGHT_FAILED',
      relatedEntityType: 'PACKAGE',
      relatedEntityId: event.manufacturingPackageId || event.productionPackageId
    });
  }

  async notifySlaWarning(event) {
    const { metadata } = event;
    const targetTenantId = metadata?.receiverTenantId || event.tenantId;
    const allowed = await this.checkPreference(targetTenantId, 'email_sla_alerts');
    if (!allowed) return;

    await persistence.createNotification({
      tenantId: targetTenantId,
      title: 'SLA Cut-off Warning',
      message: event.message || `Production deadline approaching daily facility cut-off threshold.`,
      severity: 'warning',
      type: 'SLA_WARNING',
      relatedEntityType: 'PACKAGE',
      relatedEntityId: event.manufacturingPackageId || event.productionPackageId
    });
  }

  async notifyDispatchReceived(event) {
    const { metadata } = event;
    const targetTenantId = metadata.receiverTenantId;
    const allowed = await this.checkPreference(targetTenantId, 'email_order_alerts');
    if (!allowed) return;

    // Notify the receiver (printer)
    await persistence.createNotification({
      tenantId: targetTenantId,
      title: 'New Manufacturing Job Received',
      message: `You have a new incoming manufacturing job from ${metadata.senderTenantId}.`,
      severity: 'info',
      type: 'DISPATCH_RECEIVED',
      relatedEntityType: 'DISPATCH',
      relatedEntityId: event.dispatchId
    });
  }

  async notifyDispatchAccepted(event) {
    const { metadata } = event;
    const pkgId = event.manufacturingPackageId || event.productionPackageId;
    // Notify the sender (customer)
    await persistence.createNotification({
      tenantId: metadata.senderTenantId,
      title: 'Job Accepted',
      message: `Your manufacturing job ${pkgId} has been accepted by the printer.`,
      severity: 'success',
      type: 'DISPATCH_ACCEPTED',
      relatedEntityType: 'PACKAGE',
      relatedEntityId: pkgId
    });
  }

  async notifyDispatchRejected(event) {
    const { metadata } = event;
    const pkgId = event.manufacturingPackageId || event.productionPackageId;
    // Notify the sender (customer)
    await persistence.createNotification({
      tenantId: metadata.senderTenantId,
      title: 'Job Rejected',
      message: `Your manufacturing job ${pkgId} was rejected. Reason: ${metadata.reason || 'Not specified'}.`,
      severity: 'error',
      type: 'DISPATCH_REJECTED',
      relatedEntityType: 'PACKAGE',
      relatedEntityId: pkgId
    });
  }

  async notifyProductionCompleted(event) {
    const pkgId = event.manufacturingPackageId || event.productionPackageId;
    // Notify the customer
    await persistence.createNotification({
      tenantId: event.tenantId, // Original package owner
      title: 'Manufacturing Completed',
      message: `Great news! Manufacturing for package ${pkgId} is complete.`,
      severity: 'success',
      type: 'PRODUCTION_COMPLETED',
      relatedEntityType: 'PACKAGE',
      relatedEntityId: pkgId
    });
  }

  async getMyNotifications(tenantId, userId, limit = 20) {
    return persistence.listNotifications({ tenantId, userId, limit });
  }

  async markAsRead(id, tenantId) {
    return persistence.markNotificationRead(id, tenantId);
  }

  async markAllAsRead(tenantId, userId) {
    return persistence.markAllNotificationsRead(tenantId, userId);
  }
}

module.exports = new ManufacturingNotificationService();
