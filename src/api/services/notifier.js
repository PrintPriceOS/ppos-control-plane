/**
 * src/api/services/notifier.js
 * 
 * Compatibility adapter for tenant notifications.
 * Exposes notifyTenantEvent and routes it to notificationDispatcherService.js.
 */

const logger = require('./logger').child('notifier-adapter');
const notificationDispatcher = require('./notificationDispatcherService');

class NotifierService {
    /**
     * Dispatch notification event for a tenant.
     * @param {object} params
     * @param {string} params.tenantId
     * @param {string} params.eventType
     * @param {object} params.payload
     * @param {string} params.dedupeKey
     */
    async notifyTenantEvent({ tenantId, eventType, payload, dedupeKey }) {
        logger.info({ event: 'tenant_notification_triggered', tenantId, eventType, dedupeKey });
        
        if (notificationDispatcher && typeof notificationDispatcher.dispatch === 'function') {
            await notificationDispatcher.dispatch(eventType, {
                tenantId,
                dedupeKey,
                ...payload
            });
        } else {
            logger.warn({ event: 'dispatcher_unavailable', message: 'notificationDispatcherService is not available' });
        }
    }
}

module.exports = new NotifierService();
