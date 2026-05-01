const db = require('./db');
const logger = require('./logger').child('audit-logger');

class AuditLoggerService {
    /**
     * Log a security or operational event.
     * 
     * @param {Object} event
     * @param {string} event.type UPLOAD, JOB_CREATE, JOB_RETRY, ARTIFACT_DOWNLOAD, ARTIFACT_DELETE, QUOTA_EXCEEDED, UPSTREAM_FAILURE
     * @param {string} event.tenantId
     * @param {string} event.userId
     * @param {Object} event.metadata
     * @param {string} event.status SUCCESS, FAILURE, WARNING
     * @param {string} event.traceId
     */
    async log(event) {
        const entry = {
            timestamp: new Date().toISOString(),
            ...event
        };

        // 1. Structured Industrial Logging
        const severity = event.status === 'FAILURE' ? 'ERROR' : event.status === 'WARNING' ? 'WARN' : 'INFO';
        logger._log(severity, {
            event: `audit_${event.type.toLowerCase()}`,
            tenantId: event.tenantId,
            userId: event.userId,
            traceId: event.traceId || 'audit-internal',
            metadata: event.metadata,
            message: `[AUDIT] ${entry.type} | Status: ${entry.status}`
        });

        // 2. Persistent Logging (MySQL)
        try {
            await db.query(
                `INSERT INTO audit_logs (event_type, tenant_id, user_id, status, metadata_json, created_at)
                 VALUES (?, ?, ?, ?, ?, NOW())`,
                [event.type, event.tenantId, event.userId, event.status, JSON.stringify(event.metadata || {})]
            );
        } catch (err) {
            logger.error({
                event: 'audit_persistence_failed',
                message: 'Failed to persist audit log to MySQL',
                metadata: { error: err.message }
            });
        }
    }
}

module.exports = new AuditLoggerService();
