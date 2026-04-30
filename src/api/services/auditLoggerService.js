/**
 * src/api/services/auditLoggerService.js
 * 
 * Centralized audit logging for the Control Plane.
 * Logs are written to stdout and optionally to a database for governance compliance.
 */
const db = require('./db');

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
     */
    async log(event) {
        const entry = {
            timestamp: new Date().toISOString(),
            ...event
        };

        // 1. Console Logging (for container logs / observability)
        const logMethod = event.status === 'FAILURE' ? 'error' : event.status === 'WARNING' ? 'warn' : 'info';
        console[logMethod](`[AUDIT] ${entry.type} | Tenant: ${entry.tenantId} | User: ${entry.userId} | Status: ${entry.status}`, entry.metadata);

        // 2. Persistent Logging (MySQL)
        try {
            await db.query(
                `INSERT INTO audit_logs (event_type, tenant_id, user_id, status, metadata_json, created_at)
                 VALUES (?, ?, ?, ?, ?, NOW())`,
                [event.type, event.tenantId, event.userId, event.status, JSON.stringify(event.metadata || {})]
            );
        } catch (err) {
            console.error('[AUDIT-PERSISTENCE-FAILED]', err.message);
        }
    }
}

module.exports = new AuditLoggerService();
