/**
 * src/api/services/productionIncidentService.js
 * 
 * Production Incident and Operational Alerts Service.
 */
'use strict';

const db = require('./mysqlClient');
const logger = require('./logger').child('production-incidents');

class ProductionIncidentService {

    async createIncident(payload, actor = {}) {
        const { tenantId, printhouseId, orderId, jobId = null, incidentType, severity = 'MEDIUM', title, description, metadata = null } = payload;
        if (!tenantId || !printhouseId || !orderId || !incidentType || !title || !description) {
            throw new Error('MISSING_PARAMETERS: tenantId, printhouseId, orderId, incidentType, title, and description are required');
        }

        // Hard rule: enforce tenant isolation
        if (actor.tenantId && actor.tenantId !== 'system-tenant' && actor.tenantId !== tenantId) {
            throw new Error('UNAUTHORIZED_TENANT_ACCESS');
        }

        const metadataStr = metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null;

        const insertRes = await db.query(`
            INSERT INTO production_incidents (
                tenant_id, printhouse_id, order_id, job_id, incident_type, severity,
                status, title, description, metadata_json, opened_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, NOW())
        `, [
            tenantId, printhouseId, orderId, jobId || null, incidentType, severity,
            title, description, metadataStr
        ]);

        const incidentId = insertRes.insertId;

        // Timeline alert event log
        const productionMonitoringService = require('./productionMonitoringService');
        await productionMonitoringService.createProductionTimelineEvent({
            tenant_id: tenantId,
            printhouse_id: printhouseId,
            order_id: orderId,
            job_id: jobId,
            event_type: 'INCIDENT_CREATED',
            event_status: severity === 'CRITICAL' ? 'BLOCKER' : 'WARNING',
            message: `[Incident Raised - ${severity}] ${title}: ${description}`,
            metadata_json: { incidentId, incidentType }
        }, actor);

        // Note: incident creation must not automatically change any production gate state

        return await this.getIncident(incidentId);
    }

    async getIncident(incidentId) {
        const rows = await db.query('SELECT * FROM production_incidents WHERE id = ?', [incidentId]);
        return rows[0] || null;
    }

    async acknowledgeIncident({ incidentId, actor = {} }) {
        const incident = await this.getIncident(incidentId);
        if (!incident) {
            throw new Error('INCIDENT_NOT_FOUND');
        }

        // Role restriction: only admins/operators can manage incidents
        if (actor.role === 'CUSTOMER_USER' || actor.role === 'VIEWER') {
            throw new Error('UNAUTHORIZED_INCIDENT_ACTION');
        }

        // Enforce tenant scoping
        if (actor.tenantId && actor.tenantId !== 'system-tenant' && actor.tenantId !== incident.tenant_id) {
            throw new Error('UNAUTHORIZED_TENANT_ACCESS');
        }

        await db.query(
            "UPDATE production_incidents SET status = 'ACKNOWLEDGED', acknowledged_at = NOW(), assigned_to_user_id = ? WHERE id = ?",
            [actor.userId || 'system', incidentId]
        );

        const productionMonitoringService = require('./productionMonitoringService');
        await productionMonitoringService.createProductionTimelineEvent({
            tenant_id: incident.tenant_id,
            printhouse_id: incident.printhouse_id,
            order_id: incident.order_id,
            job_id: incident.job_id,
            event_type: 'INCIDENT_ACKNOWLEDGED',
            message: `Incident #${incidentId} acknowledged by ${actor.userId || 'operator'}.`
        }, actor);

        return await this.getIncident(incidentId);
    }

    async resolveIncident({ incidentId, resolutionNotes, actor = {} }) {
        const incident = await this.getIncident(incidentId);
        if (!incident) {
            throw new Error('INCIDENT_NOT_FOUND');
        }

        if (actor.role === 'CUSTOMER_USER' || actor.role === 'VIEWER') {
            throw new Error('UNAUTHORIZED_INCIDENT_ACTION');
        }

        if (actor.tenantId && actor.tenantId !== 'system-tenant' && actor.tenantId !== incident.tenant_id) {
            throw new Error('UNAUTHORIZED_TENANT_ACCESS');
        }

        await db.query(
            "UPDATE production_incidents SET status = 'RESOLVED', resolved_at = NOW(), resolution_notes = ? WHERE id = ?",
            [resolutionNotes || 'Resolved.', incidentId]
        );

        const productionMonitoringService = require('./productionMonitoringService');
        await productionMonitoringService.createProductionTimelineEvent({
            tenant_id: incident.tenant_id,
            printhouse_id: incident.printhouse_id,
            order_id: incident.order_id,
            job_id: incident.job_id,
            event_type: 'INCIDENT_RESOLVED',
            message: `Incident #${incidentId} resolved. Notes: ${resolutionNotes || 'None'}`
        }, actor);

        // Note: incident resolution must not automatically mutate validator/production gates

        return await this.getIncident(incidentId);
    }

    async dismissIncident({ incidentId, reason, actor = {} }) {
        const incident = await this.getIncident(incidentId);
        if (!incident) {
            throw new Error('INCIDENT_NOT_FOUND');
        }

        if (actor.role === 'CUSTOMER_USER' || actor.role === 'VIEWER') {
            throw new Error('UNAUTHORIZED_INCIDENT_ACTION');
        }

        if (actor.tenantId && actor.tenantId !== 'system-tenant' && actor.tenantId !== incident.tenant_id) {
            throw new Error('UNAUTHORIZED_TENANT_ACCESS');
        }

        await db.query(
            "UPDATE production_incidents SET status = 'DISMISSED', resolved_at = NOW(), resolution_notes = ? WHERE id = ?",
            [reason || 'Dismissed.', incidentId]
        );

        const productionMonitoringService = require('./productionMonitoringService');
        await productionMonitoringService.createProductionTimelineEvent({
            tenant_id: incident.tenant_id,
            printhouse_id: incident.printhouse_id,
            order_id: incident.order_id,
            job_id: incident.job_id,
            event_type: 'INCIDENT_DISMISSED',
            message: `Incident #${incidentId} dismissed. Reason: ${reason || 'None'}`
        }, actor);

        return await this.getIncident(incidentId);
    }

    async listIncidents(filters = {}, actor = {}) {
        let sql = 'SELECT * FROM production_incidents WHERE 1=1';
        const params = [];

        // Tenant-scoped querying
        if (actor.tenantId && actor.tenantId !== 'system-tenant') {
            sql += ' AND tenant_id = ?';
            params.push(actor.tenantId);
        } else if (filters.tenantId) {
            sql += ' AND tenant_id = ?';
            params.push(filters.tenantId);
        }

        if (filters.printhouseId) {
            sql += ' AND printhouse_id = ?';
            params.push(filters.printhouseId);
        }
        if (filters.status) {
            sql += ' AND status = ?';
            params.push(filters.status);
        }
        if (filters.severity) {
            sql += ' AND severity = ?';
            params.push(filters.severity);
        }

        return await db.query(sql, params);
    }

    async auditIncidentEvent(event) {
        logger.debug({ event: 'incident_event', ...event });
    }
}

module.exports = new ProductionIncidentService();
