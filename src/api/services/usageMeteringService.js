/**
 * src/api/services/usageMeteringService.js
 * 
 * Usage Metering and Monthly Counters Service.
 */
'use strict';

const db = require('./mysqlClient');
const logger = require('./logger').child('usage-metering');

class UsageMeteringService {

    getCurrentPeriodKey(date = new Date()) {
        const d = (date instanceof Date) ? date : new Date(date);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    }

    async recordUsageEvent({ tenantId, eventType, resourceId = null, resourceType = null, quantity = 1, bytes = 0, metadata = null }) {
        if (!tenantId || !eventType) {
            throw new Error('MISSING_PARAMETERS: tenantId and eventType are required');
        }

        const periodKey = this.getCurrentPeriodKey();

        // 1. Idempotency Check
        if (resourceId && eventType) {
            const existing = await db.query(
                'SELECT id FROM usage_events WHERE tenant_id = ? AND event_type = ? AND resource_id = ?',
                [tenantId, eventType, resourceId]
            );
            if (existing && existing.length > 0) {
                logger.debug({ event: 'duplicate_usage_event_ignored', tenantId, eventType, resourceId });
                return { ok: true, duplicate: true, eventId: existing[0].id };
            }
        }

        // Resolve plan code
        let planCode = 'FREE';
        try {
            const entRows = await db.query('SELECT plan_code FROM tenant_commercial_entitlements WHERE tenant_id = ?', [tenantId]);
            if (entRows && entRows.length > 0) {
                planCode = entRows[0].plan_code;
            }
        } catch (e) {}

        const metadataStr = metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null;

        // 2. Insert Usage Event
        const insertRes = await db.query(`
            INSERT INTO usage_events (tenant_id, event_type, resource_id, resource_type, quantity, bytes, period_key, plan_code, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [tenantId, eventType, resourceId, resourceType, quantity, bytes, periodKey, planCode, metadataStr]);

        const eventId = insertRes.insertId;

        // 3. Map Event to Counter Metric
        await this.applyEventToCounters({ tenantId, periodKey, eventType, quantity, bytes, metadata });

        // Audit trace
        await this.auditUsageEvent({ tenantId, eventType, resourceId, quantity, bytes, periodKey });

        return { ok: true, eventId, duplicate: false };
    }

    async applyEventToCounters({ tenantId, periodKey, eventType, quantity, bytes, metadata }) {
        const updates = [];

        switch (eventType) {
            case 'ORDER_CREATED':
                updates.push({ metric: 'orders_count', quantity });
                break;
            case 'FILE_UPLOADED':
                updates.push({ metric: 'uploaded_files_count', quantity });
                if (bytes > 0) {
                    updates.push({ metric: 'uploaded_bytes', quantity: bytes });
                }
                break;
            case 'PREFLIGHT_JOB_CREATED':
                updates.push({ metric: 'preflight_jobs_count', quantity });
                break;
            case 'PREFLIGHT_JOB_COMPLETED':
                if (metadata && (metadata.status === 'FAILED' || metadata.failed)) {
                    updates.push({ metric: 'failed_jobs_count', quantity });
                }
                break;
            case 'AUTOFIX_REQUESTED':
                updates.push({ metric: 'autofix_jobs_count', quantity });
                break;
            case 'AUDIT_BUNDLE_EXPORTED':
                updates.push({ metric: 'audit_bundles_count', quantity });
                break;
            case 'HANDOFF_PACKAGE_GENERATED':
                updates.push({ metric: 'handoff_packages_count', quantity });
                break;
            case 'MACHINE_ASSIGNMENT_EVALUATED':
                updates.push({ metric: 'machine_assignments_count', quantity });
                break;
            case 'UNSAFE_FIX_APPROVED':
                updates.push({ metric: 'unsafe_fix_approvals_count', quantity });
                break;
            case 'MACHINE_OVERRIDE_APPROVED':
                updates.push({ metric: 'machine_override_approvals_count', quantity });
                break;
            case 'API_REQUEST':
                updates.push({ metric: 'api_requests_count', quantity });
                break;
            case 'DOWNLOAD':
                if (bytes > 0) {
                    updates.push({ metric: 'downloaded_bytes', quantity: bytes });
                }
                break;
            case 'STORAGE_SNAPSHOT':
                // special direct update
                await this.updateStorageMetricDirect({ tenantId, periodKey, bytes });
                break;
        }

        for (const up of updates) {
            await this.incrementUsageCounter({ tenantId, periodKey, metric: up.metric, quantity: up.quantity });
        }
    }

    async incrementUsageCounter({ tenantId, periodKey, metric, quantity }) {
        await db.query(`
            INSERT INTO tenant_usage_counters (tenant_id, period_key, ${metric})
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE ${metric} = ${metric} + VALUES(${metric})
        `, [tenantId, periodKey, quantity]);

        // Sync legacy preflight_tenant_quotas table
        if (metric === 'preflight_jobs_count') {
            try {
                await db.query(`
                    INSERT INTO preflight_tenant_quotas (tenant_id, current_month_jobs)
                    VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE current_month_jobs = current_month_jobs + VALUES(current_month_jobs)
                `, [tenantId, quantity]);
            } catch (e) {}
        }
    }

    async updateStorageMetricDirect({ tenantId, periodKey, bytes }) {
        await db.query(`
            INSERT INTO tenant_usage_counters (tenant_id, period_key, stored_bytes)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE stored_bytes = VALUES(stored_bytes)
        `, [tenantId, periodKey, bytes]);

        try {
            await db.query(`
                INSERT INTO preflight_tenant_quotas (tenant_id, current_storage_bytes)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE current_storage_bytes = VALUES(current_storage_bytes)
            `, [tenantId, bytes]);
        } catch (e) {}
    }

    async getTenantUsageCounters({ tenantId, periodKey = this.getCurrentPeriodKey() }) {
        const rows = await db.query(
            'SELECT * FROM tenant_usage_counters WHERE tenant_id = ? AND period_key = ?',
            [tenantId, periodKey]
        );

        if (rows && rows.length > 0) {
            return rows[0];
        }

        return {
            tenant_id: tenantId,
            period_key: periodKey,
            orders_count: 0,
            preflight_jobs_count: 0,
            autofix_jobs_count: 0,
            uploaded_files_count: 0,
            uploaded_bytes: 0,
            stored_bytes: 0,
            downloaded_bytes: 0,
            audit_bundles_count: 0,
            handoff_packages_count: 0,
            machine_assignments_count: 0,
            unsafe_fix_approvals_count: 0,
            machine_override_approvals_count: 0,
            api_requests_count: 0,
            failed_jobs_count: 0
        };
    }

    async getTenantUsageSummary({ tenantId, periodKey = this.getCurrentPeriodKey() }) {
        const counters = await this.getTenantUsageCounters({ tenantId, periodKey });
        return {
            tenantId,
            periodKey,
            counters
        };
    }

    async recalculateUsageFromEvents({ tenantId, periodKey }) {
        const events = await db.query(
            'SELECT event_type, SUM(quantity) as total_qty, SUM(bytes) as total_bytes FROM usage_events WHERE tenant_id = ? AND period_key = ? GROUP BY event_type',
            [tenantId, periodKey]
        );

        const counts = {
            orders_count: 0,
            preflight_jobs_count: 0,
            autofix_jobs_count: 0,
            uploaded_files_count: 0,
            uploaded_bytes: 0,
            stored_bytes: 0,
            downloaded_bytes: 0,
            audit_bundles_count: 0,
            handoff_packages_count: 0,
            machine_assignments_count: 0,
            unsafe_fix_approvals_count: 0,
            machine_override_approvals_count: 0,
            api_requests_count: 0,
            failed_jobs_count: 0
        };

        for (const ev of events) {
            const qty = Number(ev.total_qty || 0);
            const bytes = Number(ev.total_bytes || 0);

            switch (ev.event_type) {
                case 'ORDER_CREATED':
                    counts.orders_count = qty;
                    break;
                case 'FILE_UPLOADED':
                    counts.uploaded_files_count = qty;
                    counts.uploaded_bytes = bytes;
                    break;
                case 'PREFLIGHT_JOB_CREATED':
                    counts.preflight_jobs_count = qty;
                    break;
                case 'AUTOFIX_REQUESTED':
                    counts.autofix_jobs_count = qty;
                    break;
                case 'AUDIT_BUNDLE_EXPORTED':
                    counts.audit_bundles_count = qty;
                    break;
                case 'HANDOFF_PACKAGE_GENERATED':
                    counts.handoff_packages_count = qty;
                    break;
                case 'MACHINE_ASSIGNMENT_EVALUATED':
                    counts.machine_assignments_count = qty;
                    break;
                case 'UNSAFE_FIX_APPROVED':
                    counts.unsafe_fix_approvals_count = qty;
                    break;
                case 'MACHINE_OVERRIDE_APPROVED':
                    counts.machine_override_approvals_count = qty;
                    break;
                case 'API_REQUEST':
                    counts.api_requests_count = qty;
                    break;
                case 'DOWNLOAD':
                    counts.downloaded_bytes = bytes;
                    break;
            }
        }

        // Fetch failed jobs count directly from events where metadata contains failed status
        const failedEvents = await db.query(
            "SELECT COUNT(*) as count FROM usage_events WHERE tenant_id = ? AND period_key = ? AND event_type = 'PREFLIGHT_JOB_COMPLETED' AND metadata_json LIKE '%\"status\":\"FAILED\"%'",
            [tenantId, periodKey]
        );
        counts.failed_jobs_count = failedEvents[0]?.count || 0;

        // Fetch last stored_bytes snapshot
        const storageEvents = await db.query(
            "SELECT bytes FROM usage_events WHERE tenant_id = ? AND period_key = ? AND event_type = 'STORAGE_SNAPSHOT' ORDER BY created_at DESC LIMIT 1",
            [tenantId, periodKey]
        );
        counts.stored_bytes = storageEvents[0]?.bytes || 0;

        // Update DB
        await db.query(`
            INSERT INTO tenant_usage_counters (
                tenant_id, period_key, orders_count, preflight_jobs_count, autofix_jobs_count,
                uploaded_files_count, uploaded_bytes, stored_bytes, downloaded_bytes,
                audit_bundles_count, handoff_packages_count, machine_assignments_count,
                unsafe_fix_approvals_count, machine_override_approvals_count, api_requests_count, failed_jobs_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                orders_count=VALUES(orders_count), preflight_jobs_count=VALUES(preflight_jobs_count),
                autofix_jobs_count=VALUES(autofix_jobs_count), uploaded_files_count=VALUES(uploaded_files_count),
                uploaded_bytes=VALUES(uploaded_bytes), stored_bytes=VALUES(stored_bytes),
                downloaded_bytes=VALUES(downloaded_bytes), audit_bundles_count=VALUES(audit_bundles_count),
                handoff_packages_count=VALUES(handoff_packages_count), machine_assignments_count=VALUES(machine_assignments_count),
                unsafe_fix_approvals_count=VALUES(unsafe_fix_approvals_count), machine_override_approvals_count=VALUES(machine_override_approvals_count),
                api_requests_count=VALUES(api_requests_count), failed_jobs_count=VALUES(failed_jobs_count)
        `, [
            tenantId, periodKey, counts.orders_count, counts.preflight_jobs_count, counts.autofix_jobs_count,
            counts.uploaded_files_count, counts.uploaded_bytes, counts.stored_bytes, counts.downloaded_bytes,
            counts.audit_bundles_count, counts.handoff_packages_count, counts.machine_assignments_count,
            counts.unsafe_fix_approvals_count, counts.machine_override_approvals_count, counts.api_requests_count, counts.failed_jobs_count
        ]);

        return await this.getTenantUsageCounters({ tenantId, periodKey });
    }

    async createStorageSnapshot({ tenantId }) {
        let sumBytes = 0;
        try {
            const rows = await db.query(
                "SELECT SUM(size_bytes) as total FROM preflight_artifacts WHERE tenant_id = ? AND status = 'ACTIVE'",
                [tenantId]
            );
            sumBytes = Number(rows[0]?.total || 0);
        } catch (e) {
            sumBytes = 0;
        }

        await this.recordUsageEvent({
            tenantId,
            eventType: 'STORAGE_SNAPSHOT',
            bytes: sumBytes,
            resourceType: 'STORAGE_ROOT'
        });

        return sumBytes;
    }

    async auditUsageEvent(event) {
        logger.debug({ event: 'usage_event_recorded', ...event });
    }
}

module.exports = new UsageMeteringService();
