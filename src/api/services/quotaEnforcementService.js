/**
 * src/api/services/quotaEnforcementService.js
 * 
 * Quota Enforcement and API Guard Service.
 */
'use strict';

const db = require('./mysqlClient');
const commercialPlanService = require('./commercialPlanService');
const usageMeteringService = require('./usageMeteringService');
const logger = require('./logger').child('quota-enforcement');

class QuotaEnforcementService {

    async evaluateQuotaForAction({ tenantId, action, quantity = 1, bytes = 0, actor = {} }) {
        if (!tenantId || !action) {
            throw new Error('MISSING_PARAMETERS: tenantId and action are required');
        }

        const entitlement = await commercialPlanService.evaluateTenantEntitlement({ tenantId });
        const periodKey = usageMeteringService.getCurrentPeriodKey();
        const usage = await usageMeteringService.getTenantUsageCounters({ tenantId, periodKey });

        // 1. SYSTEM bypasses billing but NOT governance
        if (entitlement.plan_code === 'SYSTEM') {
            return this.buildQuotaDecision({ entitlement, usage, action, quantity, bytes, allowed: true });
        }

        // 2. Fail closed on missing/suspended entitlement or BLOCKED billing
        if (entitlement.plan_code === 'NONE' || entitlement.blocking_reasons.length > 0) {
            const reasons = [...entitlement.blocking_reasons];
            return {
                allowed: false,
                action,
                tenant_id: tenantId,
                plan_code: entitlement.plan_code,
                metric: 'entitlement',
                limit: 0,
                current_usage: 0,
                requested: quantity,
                remaining: 0,
                blocking_reasons: reasons,
                warnings: entitlement.warnings,
                soft_limit_warning: false,
                hard_limit_block: true,
                billing_event_required: false
            };
        }

        // 3. Evaluate action-specific rules
        let allowed = true;
        let metric = '';
        let limit = 0;
        let current_usage = 0;
        let hard_limit_block = false;
        let soft_limit_warning = false;
        let billing_event_required = false;
        const blocking_reasons = [];
        const warnings = [];

        switch (action) {
            case 'CREATE_ORDER':
                metric = 'orders_count';
                limit = entitlement.limits.max_monthly_orders || 999999;
                current_usage = usage.orders_count;
                if (limit > 0 && current_usage + quantity > limit) {
                    if (entitlement.plan_code === 'FREE' || entitlement.plan_code === 'PILOT') {
                        allowed = false;
                        hard_limit_block = true;
                        blocking_reasons.push('ORDER_LIMIT_EXCEEDED');
                    } else {
                        soft_limit_warning = true;
                        billing_event_required = true;
                        warnings.push('Monthly order limit exceeded. Overage rates will apply.');
                    }
                }
                break;

            case 'UPLOAD_FILE':
                metric = 'uploaded_bytes';
                // Check single file size
                const fileMb = bytes / (1024 * 1024);
                const maxFileMb = entitlement.limits.max_file_size_mb || 25;
                if (fileMb > maxFileMb) {
                    allowed = false;
                    hard_limit_block = true;
                    blocking_reasons.push('FILE_SIZE_LIMIT_EXCEEDED');
                }
                // Check plan allow large uploads
                if (fileMb > 25 && !entitlement.features.allow_large_uploads) {
                    allowed = false;
                    hard_limit_block = true;
                    blocking_reasons.push('LARGE_UPLOADS_NOT_ENTITLED');
                }
                // Check monthly storage limit
                const storageLimitBytes = (entitlement.limits.included_storage_gb || 0) * 1024 * 1024 * 1024;
                if (storageLimitBytes > 0 && usage.stored_bytes + bytes > storageLimitBytes) {
                    if (entitlement.plan_code === 'FREE') {
                        allowed = false;
                        hard_limit_block = true;
                        blocking_reasons.push('STORAGE_LIMIT_EXCEEDED');
                    } else {
                        soft_limit_warning = true;
                        billing_event_required = true;
                        warnings.push('Storage limit exceeded. Overage storage rates will apply.');
                    }
                }
                break;

            case 'CREATE_PREFLIGHT_JOB':
            case 'REQUEST_AUTOFIX':
                metric = 'preflight_jobs_count';
                // Fetch daily limit from DB
                let dailyCount = 0;
                try {
                    const dailyRows = await db.query(
                        'SELECT COUNT(*) as count FROM preflight_jobs WHERE tenant_id = ? AND created_at >= CURDATE()',
                        [tenantId]
                    );
                    dailyCount = Number(dailyRows[0]?.count || 0);
                } catch (e) {}

                const maxDaily = entitlement.limits.max_daily_jobs || 999999;
                if (maxDaily > 0 && dailyCount + quantity > maxDaily) {
                    allowed = false;
                    hard_limit_block = true;
                    blocking_reasons.push('DAILY_JOB_LIMIT_EXCEEDED');
                }

                // Fetch plan monthly included preflight jobs
                let includedJobs = 0;
                try {
                    const planRows = await db.query('SELECT included_preflight_jobs_monthly FROM commercial_plans WHERE plan_code = ?', [entitlement.plan_code]);
                    includedJobs = Number(planRows[0]?.included_preflight_jobs_monthly || 0);
                } catch (e) {}

                current_usage = usage.preflight_jobs_count;
                if (includedJobs > 0 && current_usage + quantity > includedJobs) {
                    if (entitlement.plan_code === 'FREE' || entitlement.plan_code === 'PILOT') {
                        allowed = false;
                        hard_limit_block = true;
                        blocking_reasons.push('MONTHLY_JOB_LIMIT_EXCEEDED');
                    } else {
                        soft_limit_warning = true;
                        billing_event_required = true;
                        warnings.push('Monthly preflight jobs limit exceeded. Overage job rates will apply.');
                    }
                }
                break;

            case 'EXPORT_AUDIT_BUNDLE':
                if (!entitlement.features.allow_audit_bundle_export) {
                    allowed = false;
                    hard_limit_block = true;
                    blocking_reasons.push('AUDIT_BUNDLE_NOT_ENTITLED');
                }
                break;

            case 'GENERATE_HANDOFF_PACKAGE':
                if (!entitlement.features.allow_commercial_handoff) {
                    allowed = false;
                    hard_limit_block = true;
                    blocking_reasons.push('COMMERCIAL_HANDOFF_NOT_ENTITLED');
                }
                break;

            case 'EVALUATE_MACHINE_ASSIGNMENT':
                // Check if plan allows machine assignment (PRO, ENTERPRISE, PILOT, FOUNDING, CUSTOM, SYSTEM)
                let allowMachine = false;
                try {
                    const planRows = await db.query('SELECT allow_machine_assignment FROM commercial_plans WHERE plan_code = ?', [entitlement.plan_code]);
                    allowMachine = planRows[0]?.allow_machine_assignment === 1;
                } catch (e) {}
                // Fallback PILOT/Enterprise
                if (entitlement.plan_code === 'PILOT' || entitlement.plan_code === 'FOUNDING_PRINTHOUSE' || entitlement.plan_code === 'ENTERPRISE') {
                    allowMachine = true;
                }
                if (!allowMachine) {
                    allowed = false;
                    hard_limit_block = true;
                    blocking_reasons.push('MACHINE_ASSIGNMENT_NOT_ENTITLED');
                }
                break;

            case 'APPROVE_UNSAFE_FIX':
                let unsafeCount = 0;
                try {
                    const rows = await db.query(
                        "SELECT COUNT(*) as count FROM usage_events WHERE tenant_id = ? AND event_type = 'UNSAFE_FIX_APPROVED' AND created_at >= CURDATE()",
                        [tenantId]
                    );
                    unsafeCount = Number(rows[0]?.count || 0);
                } catch (e) {}
                if (unsafeCount + quantity > 5) {
                    allowed = false;
                    hard_limit_block = true;
                    blocking_reasons.push('DAILY_UNSAFE_FIX_LIMIT_EXCEEDED');
                }
                break;

            case 'APPROVE_MACHINE_OVERRIDE':
                let overrideCount = 0;
                try {
                    const rows = await db.query(
                        "SELECT COUNT(*) as count FROM usage_events WHERE tenant_id = ? AND event_type = 'MACHINE_OVERRIDE_APPROVED' AND created_at >= CURDATE()",
                        [tenantId]
                    );
                    overrideCount = Number(rows[0]?.count || 0);
                } catch (e) {}
                if (overrideCount + quantity > 10) {
                    allowed = false;
                    hard_limit_block = true;
                    blocking_reasons.push('DAILY_MACHINE_OVERRIDE_LIMIT_EXCEEDED');
                }
                break;
        }

        return this.buildQuotaDecision({
            entitlement, usage, action, quantity, bytes, allowed,
            metric, limit, current_usage, hard_limit_block, soft_limit_warning,
            billing_event_required, blocking_reasons, warnings
        });
    }

    async assertQuotaAllowed({ tenantId, action, quantity = 1, bytes = 0, actor = {} }) {
        const decision = await this.evaluateQuotaForAction({ tenantId, action, quantity, bytes, actor });
        if (!decision.allowed) {
            await this.auditQuotaDecision(decision);
            const errMessage = this.sanitizeQuotaErrorForRole(decision, actor);
            const err = new Error(errMessage);
            err.code = 'QUOTA_EXCEEDED';
            err.decision = decision;
            throw err;
        }
        return decision;
    }

    buildQuotaDecision(params) {
        const {
            entitlement, usage, action, quantity = 1, bytes = 0, allowed = true,
            metric = '', limit = 0, current_usage = 0,
            hard_limit_block = false, soft_limit_warning = false, billing_event_required = false,
            blocking_reasons = [], warnings = []
        } = params;

        const remaining = Math.max(0, limit - current_usage);

        return {
            allowed,
            action,
            tenant_id: entitlement.tenant_id,
            plan_code: entitlement.plan_code,
            metric,
            limit,
            current_usage,
            requested: action === 'UPLOAD_FILE' ? bytes : quantity,
            remaining: action === 'UPLOAD_FILE' ? Math.max(0, limit - (usage.uploaded_bytes || 0)) : remaining,
            blocking_reasons,
            warnings,
            soft_limit_warning,
            hard_limit_block,
            billing_event_required
        };
    }

    async auditQuotaDecision(decision) {
        logger.warn({ event: 'quota_decision_evaluated', ...decision });
    }

    sanitizeQuotaErrorForRole(decision, actor = {}) {
        const role = actor.role || 'USER';

        if (role === 'SUPER_ADMIN' || role === 'OPS_ADMIN' || role === 'TENANT_ADMIN') {
            return `Quota blocked for action ${decision.action} on tenant ${decision.tenant_id} (${decision.plan_code}). Reasons: ${decision.blocking_reasons.join(', ')}`;
        }

        // Sanitized customer/operator boundaries (no database or internal paths leaked)
        return 'Action restricted by plan limits. Contact your administrator.';
    }
}

module.exports = new QuotaEnforcementService();
