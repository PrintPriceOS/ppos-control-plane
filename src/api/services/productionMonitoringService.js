/**
 * src/api/services/productionMonitoringService.js
 * 
 * Production Monitoring and Snapshot Service.
 */
'use strict';

const db = require('./mysqlClient');
const logger = require('./logger').child('production-monitoring');

class ProductionMonitoringService {

    async createOrUpdateMonitoringSnapshot({ tenantId, printhouseId, orderId, jobId, payload = {}, actor = {} }) {
        if (!tenantId || !printhouseId || !orderId) {
            throw new Error('MISSING_PARAMETERS: tenantId, printhouseId, and orderId are required');
        }

        // Hard rule: enforce tenant scoping on write
        if (actor.tenantId && actor.tenantId !== 'system-tenant' && actor.tenantId !== tenantId) {
            throw new Error('UNAUTHORIZED_TENANT_ACCESS');
        }

        // Fetch existing snapshot first to merge payload
        const existing = await this.getMonitoringSnapshot({ orderId, jobId });
        const merged = existing ? { ...existing } : {};

        // Merge payload fields
        for (const [key, val] of Object.entries(payload)) {
            if (val !== undefined) {
                merged[key] = val;
            }
        }

        const blockingJson = merged.blocking_reasons_json ? (typeof merged.blocking_reasons_json === 'string' ? merged.blocking_reasons_json : JSON.stringify(merged.blocking_reasons_json)) : null;
        const warningJson = merged.warning_reasons_json ? (typeof merged.warning_reasons_json === 'string' ? merged.warning_reasons_json : JSON.stringify(merged.warning_reasons_json)) : null;
        const govJson = merged.governance_snapshot_json ? (typeof merged.governance_snapshot_json === 'string' ? merged.governance_snapshot_json : JSON.stringify(merged.governance_snapshot_json)) : null;
        const monitorJson = merged.monitoring_snapshot_json ? (typeof merged.monitoring_snapshot_json === 'string' ? merged.monitoring_snapshot_json : JSON.stringify(merged.monitoring_snapshot_json)) : null;

        await db.query(`
            INSERT INTO production_monitoring_snapshots (
                tenant_id, printhouse_id, order_id, job_id, queue_entry_id, machine_id,
                production_status, sla_status, sla_started_at, sla_due_at, estimated_completion_at,
                actual_completed_at, remaining_minutes, risk_score, blocking_reasons_json,
                warning_reasons_json, governance_snapshot_json, monitoring_snapshot_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                job_id=VALUES(job_id), queue_entry_id=VALUES(queue_entry_id), machine_id=VALUES(machine_id),
                production_status=VALUES(production_status), sla_status=VALUES(sla_status),
                sla_started_at=VALUES(sla_started_at), sla_due_at=VALUES(sla_due_at),
                estimated_completion_at=VALUES(estimated_completion_at), actual_completed_at=VALUES(actual_completed_at),
                remaining_minutes=VALUES(remaining_minutes), risk_score=VALUES(risk_score),
                blocking_reasons_json=VALUES(blocking_reasons_json), warning_reasons_json=VALUES(warning_reasons_json),
                governance_snapshot_json=VALUES(governance_snapshot_json), monitoring_snapshot_json=VALUES(monitoring_snapshot_json)
        `, [
            tenantId, printhouseId, orderId, jobId || null, merged.queue_entry_id || null, merged.machine_id || null,
            merged.production_status || 'NOT_STARTED', merged.sla_status || 'NOT_APPLICABLE',
            merged.sla_started_at || null, merged.sla_due_at || null, merged.estimated_completion_at || null,
            merged.actual_completed_at || null, merged.remaining_minutes || null, merged.risk_score || 0,
            blockingJson, warningJson, govJson, monitorJson
        ]);

        return await this.getMonitoringSnapshot({ orderId, jobId });
    }

    async getMonitoringSnapshot({ orderId, jobId = null }) {
        let sql = 'SELECT * FROM production_monitoring_snapshots WHERE order_id = ?';
        const params = [orderId];
        if (jobId) {
            sql += ' AND job_id = ?';
            params.push(jobId);
        }
        const rows = await db.query(sql, params);
        return rows[0] || null;
    }

    async listMonitoringSnapshots(filters = {}, actor = {}) {
        let sql = 'SELECT * FROM production_monitoring_snapshots WHERE 1=1';
        const params = [];

        // Hard rule: tenant-scoped listing
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
        if (filters.production_status) {
            sql += ' AND production_status = ?';
            params.push(filters.production_status);
        }
        if (filters.sla_status) {
            sql += ' AND sla_status = ?';
            params.push(filters.sla_status);
        }

        return await db.query(sql, params);
    }

    async createProductionTimelineEvent(event, actor = {}) {
        const { tenant_id, printhouse_id, order_id, job_id, event_type, event_status = 'INFO', message, metadata_json = null } = event;
        if (!tenant_id || !printhouse_id || !order_id || !event_type || !message) {
            throw new Error('MISSING_PARAMETERS: tenant_id, printhouse_id, order_id, event_type, and message are required');
        }

        // Hard rule: enforce tenant isolation
        if (actor.tenantId && actor.tenantId !== 'system-tenant' && actor.tenantId !== tenant_id) {
            throw new Error('UNAUTHORIZED_TENANT_ACCESS');
        }

        const metadataStr = metadata_json ? (typeof metadata_json === 'string' ? metadata_json : JSON.stringify(metadata_json)) : null;

        await db.query(`
            INSERT INTO production_timeline_events (
                tenant_id, printhouse_id, order_id, job_id, event_type, event_status,
                actor_user_id, actor_role, message, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            tenant_id, printhouse_id, order_id, job_id || null, event_type, event_status,
            actor.userId || 'system', actor.role || 'SYSTEM_ADMIN', message, metadataStr
        ]);

        return { ok: true };
    }

    async getProductionTimeline({ orderId, jobId = null }, actor = {}) {
        let sql = 'SELECT * FROM production_timeline_events WHERE order_id = ?';
        const params = [orderId];
        if (jobId) {
            sql += ' AND job_id = ?';
            params.push(jobId);
        }

        // Hard rule: tenant scoping
        if (actor.tenantId && actor.tenantId !== 'system-tenant') {
            sql += ' AND tenant_id = ?';
            params.push(actor.tenantId);
        }

        sql += ' ORDER BY created_at ASC';
        return await db.query(sql, params);
    }

    async evaluateProductionMonitoringState({ orderId, jobId = null }, actor = {}) {
        // Build governance state from queue eligibility checks
        const gov = await this.buildGovernanceSnapshot({ orderId, jobId });
        const snapshot = await this.getMonitoringSnapshot({ orderId, jobId });

        if (!snapshot) {
            throw new Error('MONITORING_SNAPSHOT_NOT_FOUND');
        }

        // Hard rule: enforce tenant scoping on evaluate
        if (actor.tenantId && actor.tenantId !== 'system-tenant' && actor.tenantId !== snapshot.tenant_id) {
            throw new Error('UNAUTHORIZED_TENANT_ACCESS');
        }

        const slaRiskService = require('./slaRiskService');
        const slaEval = await slaRiskService.evaluateSlaRisk({ orderId, jobId });

        const updatedPayload = {
            production_status: gov.orderStatus,
            sla_status: slaEval.sla_status,
            remaining_minutes: slaEval.remaining_minutes,
            risk_score: slaEval.risk_score,
            blocking_reasons_json: gov.blockers,
            warning_reasons_json: gov.warnings,
            governance_snapshot_json: gov.governance_domains,
            monitoring_snapshot_json: {
                evaluated_at: new Date().toISOString(),
                ...gov.metadata
            }
        };

        return await this.createOrUpdateMonitoringSnapshot({
            tenantId: snapshot.tenant_id,
            printhouseId: snapshot.printhouse_id,
            orderId,
            jobId,
            payload: updatedPayload,
            actor
        });
    }

    async buildGovernanceSnapshot({ orderId, jobId = null }) {
        try {
            const queueService = require('./marketplaceProductionQueueService');
            // Check eligibility (this handles preflight, payment, proof, machine compat, and handoff)
            const evalResult = await queueService.evaluateProductionQueueEligibility(orderId, { ignoreOrderStatus: true });
            
            // Phase 78 Integration: Add quota/plan blockers from entitlements checks
            const commercialPlanService = require('./commercialPlanService');
            const orders = await db.query('SELECT tenant_id FROM marketplace_orders WHERE order_id = ?', [orderId]);
            if (orders && orders.length > 0) {
                const tenantId = orders[0].tenant_id;
                const ent = await commercialPlanService.evaluateTenantEntitlement({ tenantId });
                if (ent.blocking_reasons && ent.blocking_reasons.length > 0) {
                    evalResult.blockers.push(...ent.blocking_reasons);
                    evalResult.governance_domains.quota = 'BLOCKED';
                } else {
                    evalResult.governance_domains.quota = 'PASSED';
                }
            }

            return evalResult;
        } catch (e) {
            // Fail-safe default governance snapshot
            return {
                orderStatus: 'NOT_STARTED',
                eligible: false,
                blockers: ['GOVERNANCE_EVALUATION_CRASHED'],
                warnings: [e.message],
                governance_domains: {
                    artifact_trust: 'BLOCKED',
                    policy_profile: 'BLOCKED',
                    machine_compatibility: 'BLOCKED',
                    proof: 'BLOCKED',
                    payment: 'BLOCKED',
                    handoff: 'BLOCKED',
                    quota: 'BLOCKED'
                },
                metadata: {}
            };
        }
    }

    sanitizeMonitoringPayloadForRole(payload, actor = {}) {
        const role = actor.role || 'USER';
        if (role === 'SUPER_ADMIN' || role === 'OPS_ADMIN') {
            return payload; // Admins get full detail
        }

        // Sanitized customer/operator boundary checks
        // Remove operator internal notes, full DB schema references, or file paths
        const sanitized = { ...payload };
        
        // Remove internal details from timeline/snapshot metadata
        if (sanitized.monitoring_snapshot_json) {
            const m = { ...sanitized.monitoring_snapshot_json };
            delete m.operator_note;
            delete m.internal_logs;
            delete m.physical_path;
            sanitized.monitoring_snapshot_json = m;
        }

        if (sanitized.governance_snapshot_json) {
            const g = { ...sanitized.governance_snapshot_json };
            // customer is safe but sees basic pass/fail states
            sanitized.governance_snapshot_json = g;
        }

        return sanitized;
    }
}

module.exports = new ProductionMonitoringService();
