/**
 * Manufacturing Notification Service
 * 
 * Logic for generating and delivering operational notifications.
 */
const persistence = require('./ManufacturingPersistenceService');

class ManufacturingNotificationService {
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
        default:
          // For other events, we might just store them but not notify immediately
          break;
      }
    } catch (err) {
      console.error('[NOTIFICATION-SERVICE] Failed to process event:', err);
    }
  }

  async notifyDispatchReceived(event) {
    const { metadata } = event;
    // Notify the receiver (printer)
    await persistence.createNotification({
      tenantId: metadata.receiverTenantId,
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
