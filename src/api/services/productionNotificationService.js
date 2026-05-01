/**
 * Production Notification Service
 * 
 * Logic for generating and delivering operational notifications.
 */
const persistence = require('./productionPersistenceService');

class ProductionNotificationService {
  /**
   * Process a production event and generate notifications if needed
   */
  async handleEvent(event) {
    const { eventType, tenantId, metadata, message, productionPackageId, dispatchId } = event;

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
      title: 'New Production Job Received',
      message: `You have a new incoming production job from ${metadata.senderTenantId}.`,
      severity: 'info',
      type: 'DISPATCH_RECEIVED',
      relatedEntityType: 'DISPATCH',
      relatedEntityId: event.dispatchId
    });
  }

  async notifyDispatchAccepted(event) {
    const { metadata } = event;
    // Notify the sender (customer)
    await persistence.createNotification({
      tenantId: metadata.senderTenantId,
      title: 'Job Accepted',
      message: `Your production job ${event.productionPackageId} has been accepted by the printer.`,
      severity: 'success',
      type: 'DISPATCH_ACCEPTED',
      relatedEntityType: 'PACKAGE',
      relatedEntityId: event.productionPackageId
    });
  }

  async notifyDispatchRejected(event) {
    const { metadata } = event;
    // Notify the sender (customer)
    await persistence.createNotification({
      tenantId: metadata.senderTenantId,
      title: 'Job Rejected',
      message: `Your production job ${event.productionPackageId} was rejected. Reason: ${metadata.reason || 'Not specified'}.`,
      severity: 'error',
      type: 'DISPATCH_REJECTED',
      relatedEntityType: 'PACKAGE',
      relatedEntityId: event.productionPackageId
    });
  }

  async notifyProductionCompleted(event) {
    // Notify the customer
    await persistence.createNotification({
      tenantId: event.tenantId, // Original package owner
      title: 'Production Completed',
      message: `Great news! Production for package ${event.productionPackageId} is complete.`,
      severity: 'success',
      type: 'PRODUCTION_COMPLETED',
      relatedEntityType: 'PACKAGE',
      relatedEntityId: event.productionPackageId
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

module.exports = new ProductionNotificationService();
