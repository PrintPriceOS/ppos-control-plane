/**
 * Manufacturing Event Service
 * 
 * Unified timeline system for tracking the granular history of manufacturing jobs.
 */
const persistence = require('./ManufacturingPersistenceService');

class ManufacturingEventService {
  /**
   * Record a new production event
   * @param {Object} event { tenantId, packageId, dispatchId, type, actorType, actorId, message, metadata }
   */
  async record(event) {
    const eventId = await persistence.createEvent({
      tenantId: event.tenantId,
      packageId: event.packageId,
      dispatchId: event.dispatchId,
      eventType: event.type,
      actorType: event.actorType || 'SYSTEM',
      actorId: event.actorId || 'system',
      message: event.message,
      metadata: event.metadata || {}
    });

    // Trigger Notification Engine (Async)
    // We require here to avoid circular dependencies if any
    const notificationService = require('./ManufacturingNotificationService');
    notificationService.handleEvent(event).catch(err => {
      console.error('[EVENT-SERVICE] Notification trigger failed:', err);
    });

    return eventId;
  }

  /**
   * List events for a package
   */
  async getPackageTimeline(packageId, context) {
    // 1. Fetch Package to check ownership
    const pkg = await persistence.getPackage(packageId);
    if (!pkg) throw new Error('NOT_FOUND: Package not found');

    if (pkg.tenant_id !== context.tenantId && context.role !== 'SUPER_ADMIN') {
        // Also allow the assigned printer to see events
        if (pkg.assigned_printer_tenant_id !== context.tenantId) {
            throw new Error('FORBIDDEN: Access restricted');
        }
    }

    return persistence.listEvents({ packageId });
  }

  /**
   * Global event list (RBAC applied)
   */
  async listGlobalEvents(filters, context) {
    const finalFilters = { ...filters };
    if (context.role !== 'SUPER_ADMIN') {
        finalFilters.tenantId = context.tenantId;
    }
    return persistence.listEvents(finalFilters);
  }
}

module.exports = new ManufacturingEventService();
