/**
 * Incident Service
 * 
 * Manages operational incidents, degradation tracking, and RCA bundles.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('incidents');

class IncidentService {
    /**
     * Raise a new operational incident.
     */
    async raiseIncident(incidentData) {
        const { scope, severity, event, details, tenantId } = incidentData;
        const incidentId = `INC-${Date.now()}`;

        logger.error({
            event: 'incident_raised',
            id: incidentId,
            scope,
            severity,
            event_type: event,
            tenantId
        });

        // 1. Persist Incident
        await db.query(`
            INSERT INTO operational_incidents (id, tenant_id, scope, severity, event_type, details_json, status)
            VALUES (?, ?, ?, ?, ?, ?, 'OPEN')
        `, [incidentId, tenantId || null, scope, severity, event, JSON.stringify(details)]);

        // 2. Log Forensicly
        const auditLogger = require('./auditLoggerService');
        await auditLogger.log({
            type: 'OPERATIONAL_INCIDENT',
            tenantId: tenantId || 'SYSTEM',
            userId: 'SYSTEM',
            status: severity,
            metadata: { 
                scope, 
                event, 
                details,
                incidentId
            }
        });

        // 3. Trigger automated responses if needed
        if (severity === 'CRITICAL') {
            await this._handleCriticalIncident(incidentData);
        }

        return { ok: true, incidentId };
    }

    async resolveIncident(incidentId, reason) {
        logger.info({ event: 'incident_resolved', id: incidentId, reason });
        await db.query(`
            UPDATE operational_incidents 
            SET status = 'RESOLVED', remediated_at = CURRENT_TIMESTAMP, details_json = JSON_SET(details_json, '$.resolution_reason', ?)
            WHERE id = ?
        `, [reason, incidentId]);
    }

    async _handleCriticalIncident(data) {
        logger.warn({ event: 'automated_response_triggered', scope: data.scope });
        // Example: If worker failures are critical, we might pause the queue
        if (data.scope === 'worker_fleet' && data.event === 'high_failure_rate') {
            const queueOperator = require('../adapters/queueOperator');
            await queueOperator.pauseQueue();
            logger.info({ event: 'queue_paused_auto', reason: 'CRITICAL_FLEET_DEGRADATION' });
        }
    }
}

module.exports = new IncidentService();
