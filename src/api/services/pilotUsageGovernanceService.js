/**
 * src/api/services/pilotUsageGovernanceService.js
 * 
 * Enforces pilot plan limits and usage quotas.
 */
'use strict';

const db = require('./mysqlClient');
const auditLogger = require('./auditLoggerService');

const DEFAULT_LIMITS = {
    max_pilot_orders: 50,
    max_pilot_jobs_per_day: 25,
    max_pilot_file_size_mb: 2048,
    max_pilot_storage_gb: 50,
    max_daily_machine_overrides: 10,
    max_daily_unsafe_fix_approvals: 5
};

class PilotUsageGovernanceService {
    
    async getPilotLimits({ tenantId, printhouseId }) {
        let rows = [];
        try {
            if (tenantId && printhouseId) {
                rows = await db.query(
                    'SELECT max_pilot_orders, max_pilot_jobs_per_day, max_pilot_file_size_mb, max_pilot_storage_gb FROM tenant_pilot_readiness WHERE tenant_id = ? AND printhouse_id = ?',
                    [tenantId, printhouseId]
                );
            } else if (tenantId) {
                rows = await db.query(
                    'SELECT max_pilot_orders, max_pilot_jobs_per_day, max_pilot_file_size_mb, max_pilot_storage_gb FROM tenant_pilot_readiness WHERE tenant_id = ? LIMIT 1',
                    [tenantId]
                );
            }
        } catch (e) {
            // ignore
        }

        const dbLimits = rows[0] || {};
        return {
            max_pilot_orders: dbLimits.max_pilot_orders !== undefined && dbLimits.max_pilot_orders !== null ? dbLimits.max_pilot_orders : DEFAULT_LIMITS.max_pilot_orders,
            max_pilot_jobs_per_day: dbLimits.max_pilot_jobs_per_day !== undefined && dbLimits.max_pilot_jobs_per_day !== null ? dbLimits.max_pilot_jobs_per_day : DEFAULT_LIMITS.max_pilot_jobs_per_day,
            max_pilot_file_size_mb: dbLimits.max_pilot_file_size_mb !== undefined && dbLimits.max_pilot_file_size_mb !== null ? dbLimits.max_pilot_file_size_mb : DEFAULT_LIMITS.max_pilot_file_size_mb,
            max_pilot_storage_gb: dbLimits.max_pilot_storage_gb !== undefined && dbLimits.max_pilot_storage_gb !== null ? dbLimits.max_pilot_storage_gb : DEFAULT_LIMITS.max_pilot_storage_gb,
            max_daily_machine_overrides: DEFAULT_LIMITS.max_daily_machine_overrides,
            max_daily_unsafe_fix_approvals: DEFAULT_LIMITS.max_daily_unsafe_fix_approvals
        };
    }

    async evaluatePilotOrderLimit({ tenantId }) {
        const limits = await this.getPilotLimits({ tenantId });
        let count = 0;
        try {
            const rows = await db.query(
                `SELECT COUNT(*) as count FROM (
                    SELECT id FROM marketplace_orders WHERE tenant_id = ?
                    UNION ALL
                    SELECT id FROM orders WHERE tenant_id = ?
                 ) t`,
                [tenantId, tenantId]
            );
            count = rows[0]?.count || 0;
        } catch (e) {
            // fallback for mock in test
            count = 0;
        }

        if (count >= limits.max_pilot_orders) {
            await this.emitPilotUsageAuditEvent({
                eventType: 'TENANT_PILOT_LIMIT_EXCEEDED',
                tenantId,
                reason: `Order limit exceeded: ${count}/${limits.max_pilot_orders}`
            });
            return { allowed: false, count, limit: limits.max_pilot_orders };
        }
        return { allowed: true, count, limit: limits.max_pilot_orders };
    }

    async evaluatePilotJobLimit({ tenantId }) {
        const limits = await this.getPilotLimits({ tenantId });
        let count = 0;
        try {
            const rows = await db.query(
                `SELECT COUNT(*) as count FROM (
                    SELECT id FROM jobs WHERE tenant_id = ? AND created_at >= CURDATE()
                    UNION ALL
                    SELECT job_id FROM preflight_job_registry WHERE tenant_id = ? AND created_at >= CURDATE()
                 ) t`,
                [tenantId, tenantId]
            );
            count = rows[0]?.count || 0;
        } catch (e) {
            count = 0;
        }

        if (count >= limits.max_pilot_jobs_per_day) {
            await this.emitPilotUsageAuditEvent({
                eventType: 'TENANT_PILOT_LIMIT_EXCEEDED',
                tenantId,
                reason: `Daily jobs limit exceeded: ${count}/${limits.max_pilot_jobs_per_day}`
            });
            return { allowed: false, count, limit: limits.max_pilot_jobs_per_day };
        }
        return { allowed: true, count, limit: limits.max_pilot_jobs_per_day };
    }

    async evaluatePilotFileSizeLimit({ tenantId, fileSizeBytes }) {
        const limits = await this.getPilotLimits({ tenantId });
        const maxBytes = limits.max_pilot_file_size_mb * 1024 * 1024;
        
        if (fileSizeBytes > maxBytes) {
            await this.emitPilotUsageAuditEvent({
                eventType: 'TENANT_PILOT_LIMIT_EXCEEDED',
                tenantId,
                reason: `File size ${fileSizeBytes} bytes exceeds limit of ${limits.max_pilot_file_size_mb} MB`
            });
            return { allowed: false, actualMb: fileSizeBytes / (1024*1024), limitMb: limits.max_pilot_file_size_mb };
        }
        return { allowed: true, limitMb: limits.max_pilot_file_size_mb };
    }

    async evaluatePilotStorageLimit({ tenantId }) {
        const limits = await this.getPilotLimits({ tenantId });
        const maxBytes = limits.max_pilot_storage_gb * 1024 * 1024 * 1024;
        let currentStorageBytes = 0;

        try {
            const rows = await db.query(
                'SELECT current_storage_bytes FROM preflight_tenant_quotas WHERE tenant_id = ?',
                [tenantId]
            );
            currentStorageBytes = rows[0]?.current_storage_bytes || 0;
        } catch (e) {
            currentStorageBytes = 0;
        }

        if (currentStorageBytes >= maxBytes) {
            await this.emitPilotUsageAuditEvent({
                eventType: 'TENANT_PILOT_LIMIT_EXCEEDED',
                tenantId,
                reason: `Storage limit exceeded: ${currentStorageBytes}/${maxBytes} bytes`
            });
            return { allowed: false, currentGb: currentStorageBytes / (1024*1024*1024), limitGb: limits.max_pilot_storage_gb };
        }
        return { allowed: true, limitGb: limits.max_pilot_storage_gb };
    }

    async evaluatePilotOverrideLimit({ tenantId, actor }) {
        const limits = await this.getPilotLimits({ tenantId });
        let count = 0;
        try {
            const rows = await db.query(
                `SELECT COUNT(*) as count FROM printhouse_capability_audit 
                 WHERE tenant_id = ? AND event_type = 'MACHINE_COMPATIBILITY_OVERRIDE_APPROVED' AND created_at >= CURDATE()`,
                [tenantId]
            );
            count = rows[0]?.count || 0;
        } catch (e) {
            count = 0;
        }

        if (count >= limits.max_daily_machine_overrides) {
            await this.emitPilotUsageAuditEvent({
                eventType: 'TENANT_PILOT_LIMIT_EXCEEDED',
                tenantId,
                reason: `Daily machine override limit exceeded: ${count}/${limits.max_daily_machine_overrides}`
            });
            return { allowed: false, count, limit: limits.max_daily_machine_overrides };
        }
        return { allowed: true, count, limit: limits.max_daily_machine_overrides };
    }

    async incrementPilotUsageCounter(event) {
        // Increment preflight jobs counters if relevant
        try {
            if (event.type === 'PREFLIGHT_RUN') {
                await db.query(
                    `INSERT INTO preflight_tenant_quotas (tenant_id, current_month_jobs) 
                     VALUES (?, 1) ON DUPLICATE KEY UPDATE current_month_jobs = current_month_jobs + 1`,
                    [event.tenantId]
                );
            }
        } catch (e) {
            // ignore
        }
    }

    async resetPilotDailyUsageIfNeeded(tenantId) {
        // Daily resets happen automatically by database DATE tracking, but this is a lifecycle hook
        return { ok: true };
    }

    async emitPilotUsageAuditEvent({ eventType, tenantId, reason }) {
        try {
            await auditLogger.log({
                type: eventType,
                tenantId: tenantId || 'system',
                userId: 'system-limits-guard',
                status: 'WARNING',
                metadata: {
                    reason,
                    warning: 'PILOT_LIMIT_GOVERNANCE_WARNING'
                }
            });
        } catch (err) {
            // ignore
        }
    }
}

module.exports = new PilotUsageGovernanceService();
