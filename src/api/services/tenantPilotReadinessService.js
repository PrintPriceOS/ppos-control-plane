/**
 * src/api/services/tenantPilotReadinessService.js
 * 
 * Central service for Tenant Pilot Status and Commercial Readiness.
 */
'use strict';

const db = require('./mysqlClient');
const printhouseCapabilityService = require('./printhouseCapabilityService');
const auditLogger = require('./auditLoggerService');
const logger = require('./logger').child('tenant-pilot-readiness');
const crypto = require('crypto');

class TenantPilotReadinessService {
    generateId(prefix) {
        return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
    }

    async auditTenantPilotEvent({ eventType, tenantId, printhouseId, actor, status, reason, metadata = {} }) {
        try {
            await auditLogger.log({
                type: eventType,
                tenantId: tenantId || 'system',
                userId: actor?.userId || actor?.id || 'system',
                status: status || 'SUCCESS',
                metadata: {
                    printhouse_id: printhouseId,
                    reason,
                    ...metadata
                }
            });
        } catch (err) {
            logger.error({ event: 'audit_failed', error: err.message });
        }
    }

    async getTenantPilotReadiness({ tenantId, printhouseId }) {
        const rows = await db.query(
            'SELECT * FROM tenant_pilot_readiness WHERE tenant_id = ? AND printhouse_id = ?',
            [tenantId, printhouseId]
        );
        return rows[0] || null;
    }

    async createOrUpdateTenantPilotReadiness({ tenantId, printhouseId, payload = {}, actor }) {
        const existing = await this.getTenantPilotReadiness({ tenantId, printhouseId });
        
        const maxOrders = payload.max_pilot_orders !== undefined ? payload.max_pilot_orders : 50;
        const maxJobsPerDay = payload.max_pilot_jobs_per_day !== undefined ? payload.max_pilot_jobs_per_day : 25;
        const maxFileSize = payload.max_pilot_file_size_mb !== undefined ? payload.max_pilot_file_size_mb : 2048;
        const maxStorage = payload.max_pilot_storage_gb !== undefined ? payload.max_pilot_storage_gb : 50;
        const orderTypes = payload.allowed_order_types_json ? JSON.stringify(payload.allowed_order_types_json) : null;
        const printhouses = payload.allowed_printhouse_ids_json ? JSON.stringify(payload.allowed_printhouse_ids_json) : null;
        const machines = payload.allowed_machine_ids_json ? JSON.stringify(payload.allowed_machine_ids_json) : null;
        
        if (existing) {
            await db.query(
                `UPDATE tenant_pilot_readiness 
                 SET pilot_status = COALESCE(?, pilot_status),
                     commercial_status = COALESCE(?, commercial_status),
                     live_production_enabled = COALESCE(?, live_production_enabled),
                     pilot_access_enabled = COALESCE(?, pilot_access_enabled),
                     partner_access_enabled = COALESCE(?, partner_access_enabled),
                     customer_access_enabled = COALESCE(?, customer_access_enabled),
                     max_pilot_orders = COALESCE(?, max_pilot_orders),
                     max_pilot_jobs_per_day = COALESCE(?, max_pilot_jobs_per_day),
                     max_pilot_file_size_mb = COALESCE(?, max_pilot_file_size_mb),
                     max_pilot_storage_gb = COALESCE(?, max_pilot_storage_gb),
                     allowed_order_types_json = COALESCE(?, allowed_order_types_json),
                     allowed_printhouse_ids_json = COALESCE(?, allowed_printhouse_ids_json),
                     allowed_machine_ids_json = COALESCE(?, allowed_machine_ids_json),
                     blocked_reason = COALESCE(?, blocked_reason),
                     readiness_snapshot_json = COALESCE(?, readiness_snapshot_json)
                 WHERE tenant_id = ? AND printhouse_id = ?`,
                [
                    payload.pilot_status || null,
                    payload.commercial_status || null,
                    payload.live_production_enabled !== undefined ? (payload.live_production_enabled ? 1 : 0) : null,
                    payload.pilot_access_enabled !== undefined ? (payload.pilot_access_enabled ? 1 : 0) : null,
                    payload.partner_access_enabled !== undefined ? (payload.partner_access_enabled ? 1 : 0) : null,
                    payload.customer_access_enabled !== undefined ? (payload.customer_access_enabled ? 1 : 0) : null,
                    maxOrders,
                    maxJobsPerDay,
                    maxFileSize,
                    maxStorage,
                    orderTypes,
                    printhouses,
                    machines,
                    payload.blocked_reason || null,
                    payload.readiness_snapshot_json ? JSON.stringify(payload.readiness_snapshot_json) : null,
                    tenantId,
                    printhouseId
                ]
            );

            const updated = await this.getTenantPilotReadiness({ tenantId, printhouseId });
            await this.auditTenantPilotEvent({
                eventType: 'TENANT_PILOT_READINESS_UPDATED',
                tenantId,
                printhouseId,
                actor,
                status: 'SUCCESS',
                metadata: { payload }
            });
            return updated;
        } else {
            const id = this.generateId('pilot');
            await db.query(
                `INSERT INTO tenant_pilot_readiness 
                 (id, tenant_id, printhouse_id, pilot_status, commercial_status, live_production_enabled, 
                  pilot_access_enabled, partner_access_enabled, customer_access_enabled, 
                  max_pilot_orders, max_pilot_jobs_per_day, max_pilot_file_size_mb, max_pilot_storage_gb,
                  allowed_order_types_json, allowed_printhouse_ids_json, allowed_machine_ids_json, blocked_reason)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id,
                    tenantId,
                    printhouseId,
                    payload.pilot_status || 'NOT_CONFIGURED',
                    payload.commercial_status || 'NOT_STARTED',
                    payload.live_production_enabled ? 1 : 0,
                    payload.pilot_access_enabled ? 1 : 0,
                    payload.partner_access_enabled ? 1 : 0,
                    payload.customer_access_enabled ? 1 : 0,
                    maxOrders,
                    maxJobsPerDay,
                    maxFileSize,
                    maxStorage,
                    orderTypes,
                    printhouses,
                    machines,
                    payload.blocked_reason || null
                ]
            );

            const created = await this.getTenantPilotReadiness({ tenantId, printhouseId });
            await this.auditTenantPilotEvent({
                eventType: 'TENANT_PILOT_READINESS_CREATED',
                tenantId,
                printhouseId,
                actor,
                status: 'SUCCESS',
                metadata: { payload }
            });
            return created;
        }
    }

    async evaluateTenantPilotReadiness({ tenantId, printhouseId }) {
        const readinessRecord = await this.getTenantPilotReadiness({ tenantId, printhouseId });

        const blockingReasons = [];
        const warnings = [];
        const readinessDomains = {
            printhouse: 'FAILED',
            capabilities: 'FAILED',
            users: 'PENDING',
            limits: 'FAILED',
            workspace_isolation: 'PENDING',
            auditability: 'PASSED',
            live_production: 'BLOCKED_BY_DESIGN'
        };

        // 1. Check Printhouse
        let ph = null;
        try {
            ph = await printhouseCapabilityService.getPrinthouse(printhouseId);
        } catch (e) {}

        if (!ph) {
            blockingReasons.push('PRINTHOUSE_NOT_FOUND');
        } else if (ph.onboarding_status !== 'READY_FOR_PILOT') {
            blockingReasons.push('PRINTHOUSE_NOT_READY_FOR_PILOT');
        } else {
            readinessDomains.printhouse = 'PASSED';
        }

        // 2. Check Capabilities
        let machines = [], media = [], policies = [], sla = [];
        try {
            machines = await printhouseCapabilityService.listMachines(printhouseId);
            media = await printhouseCapabilityService.listMedia(printhouseId);
            policies = await printhouseCapabilityService.listPolicyProfiles(printhouseId);
            sla = await printhouseCapabilityService.listSlaProfiles(printhouseId);
        } catch (e) {}

        const activeMachines = machines.filter(m => m.status === 'ACTIVE' || m.status === 'active');
        const activeMedia = media.filter(m => m.status === 'ACTIVE' || m.status === 'active');

        if (activeMachines.length === 0) {
            blockingReasons.push('NO_ACTIVE_MACHINES');
        }
        if (activeMedia.length === 0) {
            blockingReasons.push('NO_ACTIVE_MEDIA');
        }
        if (policies.length === 0) {
            blockingReasons.push('NO_POLICY_PROFILES');
        }
        if (sla.length === 0) {
            blockingReasons.push('NO_SLA_PROFILES');
        }

        if (activeMachines.length > 0 && activeMedia.length > 0 && policies.length > 0 && sla.length > 0) {
            readinessDomains.capabilities = 'PASSED';
        }

        // 3. Check Tenant Governance
        const tenants = await db.query('SELECT * FROM tenants WHERE id = ?', [tenantId]);
        if (tenants.length === 0) {
            blockingReasons.push('MISSING_TENANT_GOVERNANCE');
        }

        // 4. Check Resource Limits
        const resourceLimits = await db.query('SELECT * FROM tenant_resource_limits WHERE tenant_id = ?', [tenantId]);
        if (resourceLimits.length === 0) {
            blockingReasons.push('MISSING_RESOURCE_LIMITS');
        } else {
            readinessDomains.limits = 'PASSED';
        }

        // 5. Check Users
        const users = await db.query('SELECT id FROM control_users WHERE tenant_id = ? LIMIT 1', [tenantId]);
        if (users.length > 0) {
            readinessDomains.users = 'PASSED';
        } else {
            warnings.push('NO_TENANT_USERS_CONFIGURED');
        }

        // 6. Check Workspace Isolation (Mode must be set)
        if (tenants.length > 0 && tenants[0].isolation_mode) {
            readinessDomains.workspace_isolation = 'PASSED';
        }

        // Pilot limit checks from readiness record
        if (!readinessRecord || readinessRecord.max_pilot_orders === null || readinessRecord.max_pilot_jobs_per_day === null) {
            blockingReasons.push('MISSING_PILOT_LIMITS');
        }

        const pilotAccessEnabled = readinessRecord ? !!readinessRecord.pilot_access_enabled : false;
        const partnerAccessEnabled = readinessRecord ? !!readinessRecord.partner_access_enabled : false;
        const customerAccessEnabled = readinessRecord ? !!readinessRecord.customer_access_enabled : false;
        const liveProductionEnabled = readinessRecord ? !!readinessRecord.live_production_enabled : false;

        const readyForPartnerPilot = blockingReasons.length === 0 && (readinessRecord && readinessRecord.pilot_status !== 'BLOCKED');
        const readyForLive = false; // Blocked by design under Phase 77

        if (liveProductionEnabled) {
            blockingReasons.push('LIVE_PRODUCTION_ENABLED_IN_PILOT');
            readinessDomains.live_production = 'FAILED';
        }

        return {
            tenant_id: tenantId,
            printhouse_id: printhouseId,
            pilot_status: readinessRecord ? readinessRecord.pilot_status : 'NOT_CONFIGURED',
            commercial_status: readinessRecord ? readinessRecord.commercial_status : 'NOT_STARTED',
            pilot_access_enabled: pilotAccessEnabled,
            partner_access_enabled: partnerAccessEnabled,
            customer_access_enabled: customerAccessEnabled,
            live_production_enabled: liveProductionEnabled,
            ready_for_partner_pilot: readyForPartnerPilot,
            ready_for_live: readyForLive,
            blocking_reasons: blockingReasons,
            warnings: warnings,
            readiness_domains: readinessDomains
        };
    }

    async enablePilotAccess({ tenantId, printhouseId, actor }) {
        const readiness = await this.evaluateTenantPilotReadiness({ tenantId, printhouseId });
        if (!readiness.ready_for_partner_pilot && readiness.pilot_status !== 'READY_FOR_PARTNER_TEST') {
            throw new Error('TENANT_NOT_READY_FOR_PILOT');
        }

        await db.query(
            `UPDATE tenant_pilot_readiness 
             SET pilot_access_enabled = 1, pilot_status = 'PILOT_ACTIVE', pilot_started_at = CURRENT_TIMESTAMP
             WHERE tenant_id = ? AND printhouse_id = ?`,
            [tenantId, printhouseId]
        );

        await this.auditTenantPilotEvent({
            eventType: 'TENANT_PILOT_ACCESS_ENABLED',
            tenantId,
            printhouseId,
            actor,
            status: 'SUCCESS'
        });

        await this.auditTenantPilotEvent({
            eventType: 'TENANT_PILOT_STATUS_CHANGED',
            tenantId,
            printhouseId,
            actor,
            status: 'SUCCESS',
            metadata: { new_status: 'PILOT_ACTIVE' }
        });

        return await this.getTenantPilotReadiness({ tenantId, printhouseId });
    }

    async disablePilotAccess({ tenantId, printhouseId, actor, reason }) {
        await db.query(
            `UPDATE tenant_pilot_readiness 
             SET pilot_access_enabled = 0, pilot_status = 'PILOT_PAUSED', blocked_reason = ?
             WHERE tenant_id = ? AND printhouse_id = ?`,
            [reason || 'Paused by admin', tenantId, printhouseId]
        );

        await this.auditTenantPilotEvent({
            eventType: 'TENANT_PILOT_ACCESS_DISABLED',
            tenantId,
            printhouseId,
            actor,
            status: 'SUCCESS',
            reason
        });

        await this.auditTenantPilotEvent({
            eventType: 'TENANT_PILOT_STATUS_CHANGED',
            tenantId,
            printhouseId,
            actor,
            status: 'SUCCESS',
            metadata: { new_status: 'PILOT_PAUSED' }
        });

        return await this.getTenantPilotReadiness({ tenantId, printhouseId });
    }

    async enablePartnerAccess({ tenantId, printhouseId, actor }) {
        await db.query(
            `UPDATE tenant_pilot_readiness 
             SET partner_access_enabled = 1
             WHERE tenant_id = ? AND printhouse_id = ?`,
            [tenantId, printhouseId]
        );

        await this.auditTenantPilotEvent({
            eventType: 'TENANT_PARTNER_ACCESS_ENABLED',
            tenantId,
            printhouseId,
            actor,
            status: 'SUCCESS'
        });

        return await this.getTenantPilotReadiness({ tenantId, printhouseId });
    }

    async disablePartnerAccess({ tenantId, printhouseId, actor, reason }) {
        await db.query(
            `UPDATE tenant_pilot_readiness 
             SET partner_access_enabled = 0
             WHERE tenant_id = ? AND printhouse_id = ?`,
            [tenantId, printhouseId]
        );

        await this.auditTenantPilotEvent({
            eventType: 'TENANT_PARTNER_ACCESS_DISABLED',
            tenantId,
            printhouseId,
            actor,
            status: 'SUCCESS',
            reason
        });

        return await this.getTenantPilotReadiness({ tenantId, printhouseId });
    }

    async requestLiveProductionEnablement({ tenantId, printhouseId, actor }) {
        // Enforce rule: LIVE production remains disabled and blocked
        await this.auditTenantPilotEvent({
            eventType: 'TENANT_LIVE_PRODUCTION_ENABLE_ATTEMPTED',
            tenantId,
            printhouseId,
            actor,
            status: 'FAILURE',
            reason: 'Live production enablement requested but blocked by Phase 77 pilot limits.'
        });

        await this.auditTenantPilotEvent({
            eventType: 'TENANT_LIVE_PRODUCTION_BLOCKED',
            tenantId,
            printhouseId,
            actor,
            status: 'SUCCESS',
            reason: 'BLOCKED_BY_DESIGN: Live production is forbidden in pilot phase.'
        });

        throw new Error('LIVE_PRODUCTION_BLOCKED_BY_DESIGN');
    }

    async blockLiveProductionEnablement({ tenantId, printhouseId, reason, actor }) {
        await db.query(
            `UPDATE tenant_pilot_readiness 
             SET live_production_enabled = 0, commercial_status = 'PILOT_ONLY', blocked_reason = ?
             WHERE tenant_id = ? AND printhouse_id = ?`,
            [reason || 'Blocked by design', tenantId, printhouseId]
        );

        await this.auditTenantPilotEvent({
            eventType: 'TENANT_LIVE_PRODUCTION_BLOCKED',
            tenantId,
            printhouseId,
            actor,
            status: 'SUCCESS',
            reason
        });

        return await this.getTenantPilotReadiness({ tenantId, printhouseId });
    }
}

module.exports = new TenantPilotReadinessService();
