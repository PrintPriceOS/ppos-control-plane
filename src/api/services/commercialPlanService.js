/**
 * src/api/services/commercialPlanService.js
 * 
 * Commercial Plan and Entitlement Governance Service.
 */
'use strict';

const db = require('./mysqlClient');
const logger = require('./logger').child('commercial-plan');

class CommercialPlanService {

    async createOrUpdateCommercialPlan(payload, actor = {}) {
        const {
            plan_code,
            plan_name,
            status = 'ACTIVE',
            billing_mode = 'FREE',
            base_currency = 'EUR',
            monthly_base_price_cents = 0,
            included_jobs_monthly = 0,
            included_preflight_jobs_monthly = 0,
            included_autofix_jobs_monthly = 0,
            included_storage_gb = 0,
            included_bandwidth_gb = 0,
            max_file_size_mb = 25,
            max_job_file_size_mb = 50,
            max_monthly_orders = 0,
            max_daily_jobs = 0,
            max_concurrent_jobs = 0,
            max_team_users = 0,
            max_printhouses = 0,
            allow_large_uploads = 0,
            allow_api_access = 0,
            allow_white_label = 0,
            allow_priority_queue = 0,
            allow_machine_assignment = 0,
            allow_audit_bundle_export = 0,
            allow_partner_onboarding = 0,
            allow_commercial_handoff = 0,
            overage_policy_json = null,
            feature_flags_json = null,
            metadata_json = null
        } = payload;

        if (!plan_code || !plan_name) {
            throw new Error('INVALID_PLAN: plan_code and plan_name are required');
        }

        const overageStr = overage_policy_json ? (typeof overage_policy_json === 'string' ? overage_policy_json : JSON.stringify(overage_policy_json)) : null;
        const featuresStr = feature_flags_json ? (typeof feature_flags_json === 'string' ? feature_flags_json : JSON.stringify(feature_flags_json)) : null;
        const metadataStr = metadata_json ? (typeof metadata_json === 'string' ? metadata_json : JSON.stringify(metadata_json)) : null;

        await db.query(`
            INSERT INTO commercial_plans (
                plan_code, plan_name, status, billing_mode, base_currency, monthly_base_price_cents,
                included_jobs_monthly, included_preflight_jobs_monthly, included_autofix_jobs_monthly,
                included_storage_gb, included_bandwidth_gb, max_file_size_mb, max_job_file_size_mb,
                max_monthly_orders, max_daily_jobs, max_concurrent_jobs, max_team_users, max_printhouses,
                allow_large_uploads, allow_api_access, allow_white_label, allow_priority_queue,
                allow_machine_assignment, allow_audit_bundle_export, allow_partner_onboarding, allow_commercial_handoff,
                overage_policy_json, feature_flags_json, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                plan_name=VALUES(plan_name), status=VALUES(status), billing_mode=VALUES(billing_mode),
                monthly_base_price_cents=VALUES(monthly_base_price_cents), included_preflight_jobs_monthly=VALUES(included_preflight_jobs_monthly),
                included_storage_gb=VALUES(included_storage_gb), max_file_size_mb=VALUES(max_file_size_mb),
                max_monthly_orders=VALUES(max_monthly_orders), max_daily_jobs=VALUES(max_daily_jobs),
                allow_large_uploads=VALUES(allow_large_uploads), allow_audit_bundle_export=VALUES(allow_audit_bundle_export),
                allow_partner_onboarding=VALUES(allow_partner_onboarding), allow_commercial_handoff=VALUES(allow_commercial_handoff),
                overage_policy_json=VALUES(overage_policy_json), feature_flags_json=VALUES(feature_flags_json),
                metadata_json=VALUES(metadata_json)
        `, [
            plan_code, plan_name, status, billing_mode, base_currency, monthly_base_price_cents,
            included_jobs_monthly, included_preflight_jobs_monthly, included_autofix_jobs_monthly,
            included_storage_gb, included_bandwidth_gb, max_file_size_mb, max_job_file_size_mb,
            max_monthly_orders, max_daily_jobs, max_concurrent_jobs, max_team_users, max_printhouses,
            allow_large_uploads ? 1 : 0, allow_api_access ? 1 : 0, allow_white_label ? 1 : 0, allow_priority_queue ? 1 : 0,
            allow_machine_assignment ? 1 : 0, allow_audit_bundle_export ? 1 : 0, allow_partner_onboarding ? 1 : 0, allow_commercial_handoff ? 1 : 0,
            overageStr, featuresStr, metadataStr
        ]);

        return { ok: true, plan_code };
    }

    async listCommercialPlans(filters = {}) {
        let sql = 'SELECT * FROM commercial_plans WHERE 1=1';
        const params = [];
        if (filters.status) {
            sql += ' AND status = ?';
            params.push(filters.status);
        }
        return await db.query(sql, params);
    }

    async getCommercialPlan(planCode) {
        const rows = await db.query('SELECT * FROM commercial_plans WHERE plan_code = ?', [planCode]);
        return rows[0] || null;
    }

    async assignPlanToTenant({ tenantId, planCode, status = null, actor = {} }) {
        if (!tenantId || !planCode) {
            throw new Error('MISSING_PARAMETERS: tenantId and planCode are required');
        }

        const plan = await this.getCommercialPlan(planCode);
        if (!plan) {
            throw new Error(`PLAN_NOT_FOUND: Plan with code ${planCode} does not exist`);
        }

        // Fetch current entitlement for audit log before update
        const beforeRows = await db.query('SELECT * FROM tenant_commercial_entitlements WHERE tenant_id = ?', [tenantId]);
        const beforeJson = beforeRows[0] || null;

        const entStatus = status || (planCode === 'PILOT' ? 'PILOT' : 'ACTIVE');
        const billingStatus = (planCode === 'FREE' || planCode === 'PILOT' || planCode === 'SYSTEM') ? 'NOT_REQUIRED' : 'ACTIVE';

        const now = new Date();
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        await db.query(`
            INSERT INTO tenant_commercial_entitlements (
                tenant_id, plan_code, plan_id, entitlement_status, billing_status,
                current_period_start, current_period_end, usage_enforcement_enabled,
                overage_enabled, hard_limit_enforcement, soft_limit_warnings
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 1, 1)
            ON DUPLICATE KEY UPDATE
                plan_code=VALUES(plan_code), plan_id=VALUES(plan_id),
                entitlement_status=VALUES(entitlement_status), billing_status=VALUES(billing_status),
                current_period_start=VALUES(current_period_start), current_period_end=VALUES(current_period_end)
        `, [
            tenantId, planCode, plan.id, entStatus, billingStatus,
            now, nextMonth,
            (planCode === 'FREE' || planCode === 'SYSTEM') ? 0 : 1
        ]);

        const afterRows = await db.query('SELECT * FROM tenant_commercial_entitlements WHERE tenant_id = ?', [tenantId]);
        const afterJson = afterRows[0] || null;

        // Audit plan changes
        await this.auditTenantPlanEvent({
            tenant_id: tenantId,
            event_type: beforeJson ? 'PLAN_CHANGED' : 'PLAN_ASSIGNED',
            actor_user_id: actor.userId || 'system',
            actor_role: actor.role || 'SYSTEM_ADMIN',
            before_json: beforeJson,
            after_json: afterJson
        });

        // Sync legacy tenants table plan columns
        let legacyPlan = planCode;
        if (planCode === 'FOUNDING_PRINTHOUSE' || planCode === 'CUSTOM') {
            legacyPlan = 'ENTERPRISE';
        }
        try {
            await db.query('UPDATE tenants SET plan_code = ?, plan = ?, commercial_status = ? WHERE id = ?', [
                planCode, legacyPlan, entStatus, tenantId
            ]);
        } catch (e) {
            // tenants table may not have all columns in tests if not fully migrated
        }

        return { ok: true, tenantId, planCode };
    }

    async getTenantEntitlement({ tenantId }) {
        const rows = await db.query('SELECT * FROM tenant_commercial_entitlements WHERE tenant_id = ?', [tenantId]);
        return rows[0] || null;
    }

    async evaluateTenantEntitlement({ tenantId }) {
        const entitlement = await this.getTenantEntitlement({ tenantId });
        let plan = null;

        if (!entitlement) {
            // Check if SYSTEM/internal tenant bypass
            let isSystem = false;
            try {
                const tenantRows = await db.query('SELECT * FROM tenants WHERE id = ?', [tenantId]);
                const tenant = tenantRows[0];
                if (tenantId === 'system' || (tenant && (tenant.plan_code === 'SYSTEM' || tenant.plan === 'SYSTEM'))) {
                    isSystem = true;
                }
            } catch (err) {
                if (tenantId === 'system') isSystem = true;
            }

            if (isSystem) {
                plan = await this.getCommercialPlan('SYSTEM');
                const defaultSystemEnt = {
                    tenant_id: tenantId,
                    plan_code: 'SYSTEM',
                    entitlement_status: 'ACTIVE',
                    billing_status: 'NOT_REQUIRED',
                    usage_enforcement_enabled: 0,
                    commercial_live_enabled: 0,
                    overage_enabled: 0,
                    hard_limit_enforcement: 0,
                    soft_limit_warnings: 0
                };
                return {
                    tenant_id: tenantId,
                    plan_code: 'SYSTEM',
                    entitlement_status: 'ACTIVE',
                    billing_status: 'NOT_REQUIRED',
                    usage_enforcement_enabled: false,
                    commercial_live_enabled: false,
                    limits: {
                        max_file_size_mb: plan?.max_file_size_mb || 5120,
                        max_monthly_orders: 999999,
                        max_daily_jobs: 999999,
                        max_concurrent_jobs: 999,
                        included_storage_gb: 99999
                    },
                    features: {
                        allow_large_uploads: true,
                        allow_api_access: true,
                        allow_audit_bundle_export: true,
                        allow_commercial_handoff: true
                    },
                    blocking_reasons: [],
                    warnings: []
                };
            }

            // Fail closed
            return {
                tenant_id: tenantId,
                plan_code: 'NONE',
                entitlement_status: 'NONE',
                billing_status: 'BLOCKED',
                usage_enforcement_enabled: true,
                commercial_live_enabled: false,
                limits: {
                    max_file_size_mb: 0,
                    max_monthly_orders: 0,
                    max_daily_jobs: 0,
                    max_concurrent_jobs: 0,
                    included_storage_gb: 0
                },
                features: {
                    allow_large_uploads: false,
                    allow_api_access: false,
                    allow_audit_bundle_export: false,
                    allow_commercial_handoff: false
                },
                blocking_reasons: ['MISSING_ENTITLEMENT'],
                warnings: ['Tenant has no active commercial plan assignment']
            };
        }

        plan = await this.getCommercialPlan(entitlement.plan_code);
        if (!plan) {
            throw new Error(`PLAN_NOT_FOUND: Plan ${entitlement.plan_code} in entitlement does not exist`);
        }

        // Build limits with custom overrides
        let customLimits = {};
        if (entitlement.custom_limits_json) {
            try {
                customLimits = typeof entitlement.custom_limits_json === 'string' ? JSON.parse(entitlement.custom_limits_json) : entitlement.custom_limits_json;
            } catch (e) {}
        }

        const limits = {
            max_file_size_mb: customLimits.max_file_size_mb !== undefined ? customLimits.max_file_size_mb : plan.max_file_size_mb,
            max_monthly_orders: customLimits.max_monthly_orders !== undefined ? customLimits.max_monthly_orders : plan.max_monthly_orders,
            max_daily_jobs: customLimits.max_daily_jobs !== undefined ? customLimits.max_daily_jobs : plan.max_daily_jobs,
            max_concurrent_jobs: customLimits.max_concurrent_jobs !== undefined ? customLimits.max_concurrent_jobs : plan.max_concurrent_jobs,
            included_storage_gb: customLimits.included_storage_gb !== undefined ? customLimits.included_storage_gb : plan.included_storage_gb
        };

        const features = {
            allow_large_uploads: plan.allow_large_uploads === 1,
            allow_api_access: plan.allow_api_access === 1,
            allow_audit_bundle_export: plan.allow_audit_bundle_export === 1,
            allow_commercial_handoff: plan.allow_commercial_handoff === 1
        };

        const blocking_reasons = [];
        const warnings = [];

        if (entitlement.entitlement_status === 'SUSPENDED' || entitlement.entitlement_status === 'CANCELLED') {
            blocking_reasons.push(`ENTITLEMENT_${entitlement.entitlement_status}`);
        }

        if (entitlement.billing_status === 'BLOCKED' || entitlement.billing_status === 'PAST_DUE') {
            blocking_reasons.push(`BILLING_${entitlement.billing_status}`);
            warnings.push(`Billing status is ${entitlement.billing_status}. Usage is restricted.`);
        }

        return {
            tenant_id: tenantId,
            plan_code: entitlement.plan_code,
            entitlement_status: entitlement.entitlement_status,
            billing_status: entitlement.billing_status,
            usage_enforcement_enabled: entitlement.usage_enforcement_enabled === 1,
            commercial_live_enabled: entitlement.commercial_live_enabled === 1,
            limits,
            features,
            blocking_reasons,
            warnings
        };
    }

    async createEntitlementSnapshot({ tenantId }) {
        const evaluation = await this.evaluateTenantEntitlement({ tenantId });
        await db.query(
            'UPDATE tenant_commercial_entitlements SET entitlement_snapshot_json = ? WHERE tenant_id = ?',
            [JSON.stringify(evaluation), tenantId]
        );
        return evaluation;
    }

    async updateTenantBillingStatus({ tenantId, billingStatus, actor = {} }) {
        if (!tenantId || !billingStatus) {
            throw new Error('MISSING_PARAMETERS: tenantId and billingStatus are required');
        }

        const entitlement = await this.getTenantEntitlement({ tenantId });
        if (!entitlement) {
            throw new Error('ENTITLEMENT_NOT_FOUND');
        }

        const beforeJson = { ...entitlement };
        await db.query(
            'UPDATE tenant_commercial_entitlements SET billing_status = ? WHERE tenant_id = ?',
            [billingStatus, tenantId]
        );

        const updated = await this.getTenantEntitlement({ tenantId });

        await this.auditTenantPlanEvent({
            tenant_id: tenantId,
            event_type: 'BILLING_STATUS_CHANGED',
            actor_user_id: actor.userId || 'system',
            actor_role: actor.role || 'SYSTEM_ADMIN',
            before_json: beforeJson,
            after_json: updated
        });

        return { ok: true, tenantId, billingStatus };
    }

    async auditTenantPlanEvent(event) {
        try {
            await db.query(`
                INSERT INTO tenant_plan_audit (tenant_id, event_type, actor_user_id, actor_role, before_json, after_json)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                event.tenant_id,
                event.event_type,
                event.actor_user_id || 'system',
                event.actor_role || 'SYSTEM_ADMIN',
                event.before_json ? JSON.stringify(event.before_json) : null,
                event.after_json ? JSON.stringify(event.after_json) : null
            ]);
        } catch (err) {
            logger.warn({ event: 'audit_tenant_plan_event_failed', error: err.message });
        }
    }
}

module.exports = new CommercialPlanService();
