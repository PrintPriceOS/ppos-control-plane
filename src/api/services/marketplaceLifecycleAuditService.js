/**
 * src/api/services/marketplaceLifecycleAuditService.js
 * 
 * Centralized audit helper for Marketplace Order Lifecycle transitions.
 * Wraps auditLoggerService to ensure canonical metadata structure is preserved.
 */

const auditLogger = require('./auditLoggerService');
const logger = require('./logger').child('marketplace-lifecycle-audit');
const { v4: uuidv4 } = require('uuid');

class MarketplaceLifecycleAuditService {

    /**
     * Internal helper to normalize and write the audit log
     */
    async _writeAudit(eventType, status, payload = {}) {
        const {
            order_id = null,
            marketplace_order_id = null,
            offer_session_id = null,
            offer_id = null,
            customer_id = null,
            tenant_id = null,
            printhouse_id = null,
            previous_status = null,
            next_status = null,
            actor = 'SYSTEM',
            actor_role = 'SYSTEM',
            source = 'CONTROL_PLANE',
            reason = null,
            blockers = [],
            warnings = [],
            file_ids = [],
            preflight_job_ids = [],
            invoice_id = null,
            payment_id = null,
            production_queue_id = null,
            machine_id = null,
            machine_name = null,
            trace_id = uuidv4(),
            request_id = null,
            occurred_at = new Date().toISOString(),
            metadata = {} // Catch-all for extra context
        } = payload;

        const effectiveOrderId = order_id || marketplace_order_id;
        const effectiveTenantId = tenant_id || printhouse_id || 'system';

        const canonicalMetadata = {
            order_id: effectiveOrderId,
            marketplace_order_id: effectiveOrderId, // Dual mapping for queries
            offer_session_id,
            offer_id,
            customer_id,
            tenant_id: effectiveTenantId,
            printhouse_id,
            previous_status,
            next_status,
            actor,
            actor_role,
            source,
            reason,
            blockers: Array.isArray(blockers) ? blockers : [],
            warnings: Array.isArray(warnings) ? warnings : [],
            file_ids: Array.isArray(file_ids) ? file_ids : [],
            preflight_job_ids: Array.isArray(preflight_job_ids) ? preflight_job_ids : [],
            invoice_id,
            payment_id,
            production_queue_id,
            machine_id,
            machine_name,
            trace_id,
            request_id,
            occurred_at,
            ...metadata
        };

        try {
            await auditLogger.log({
                type: eventType,
                tenantId: effectiveTenantId,
                userId: actor,
                status: status, // SUCCESS, WARNING, FAILURE
                metadata: canonicalMetadata,
                traceId: trace_id
            });
            logger.debug({ event: 'lifecycle_audit_written', eventType, orderId: effectiveOrderId });
        } catch (e) {
            logger.error({ event: 'lifecycle_audit_failed', error: e.message, eventType, orderId: effectiveOrderId });
        }
    }

    /**
     * Audit a general marketplace transition
     */
    async auditMarketplaceTransition(eventType, status, payload) {
        return this._writeAudit(eventType, status, payload);
    }

    /**
     * Audit a Production Queue transition
     */
    async auditProductionQueueTransition(eventType, status, payload) {
        return this._writeAudit(eventType, status, payload);
    }

    /**
     * Audit Machine Assignment
     */
    async auditMachineAssignmentTransition(eventType, status, payload) {
        return this._writeAudit(eventType, status, payload);
    }

    /**
     * Audit Production Execution
     */
    async auditProductionExecutionTransition(eventType, status, payload) {
        return this._writeAudit(eventType, status, payload);
    }

    /**
     * Audit Delivery Handoff
     */
    async auditDeliveryHandoffTransition(eventType, status, payload) {
        return this._writeAudit(eventType, status, payload);
    }
}

module.exports = new MarketplaceLifecycleAuditService();
