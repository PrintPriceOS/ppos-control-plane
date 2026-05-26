/**
 * src/api/services/tenantPlanGovernanceService.js
 * 
 * Centralized Tenant Plan Governance Service for PPOS Control Plane.
 * Manages commercial entitlements, limits, actions, and grace periods.
 */

const db = require('./mysqlClient');
const logger = require('./logger').child('tenant-governance');
const matrix = require('./tenantEntitlementMatrix');

class TenantPlanGovernanceService {
    /**
     * Resolves tenant state, falling back to defaults if not configured in DB.
     */
    async getTenantState(tenantId) {
        try {
            const rows = await db.query(
                `SELECT plan, plan_code, status, commercial_status, access_level,
                        grace_started_at, grace_ends_at, grace_extended_until,
                        limits_json, entitlements_json, module_access_json, governance_notes_json
                 FROM tenants WHERE id = ?`,
                [tenantId]
            );

            if (!rows || rows.length === 0) {
                // Fallback to default FREE tenant
                return {
                    id: tenantId,
                    plan_code: matrix.PLANS.FREE,
                    plan: 'FREE',
                    commercial_status: matrix.COMMERCIAL_STATUSES.ACTIVE,
                    status: 'ACTIVE',
                    access_level: matrix.ACCESS_LEVELS.BASIC,
                    limits: matrix.DEFAULT_LIMITS[matrix.PLANS.FREE],
                    modules: matrix.DEFAULT_MODULES[matrix.PLANS.FREE]
                };
            }

            const row = rows[0];
            const planCode = matrix.normalizePlan(row.plan_code || row.plan);
            const commercialStatus = matrix.normalizeStatus(row.commercial_status || (row.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'));
            const accessLevel = row.access_level || matrix.PLAN_ACCESS_LEVELS[planCode] || matrix.ACCESS_LEVELS.BASIC;

            let limits = {};
            try {
                limits = typeof row.limits_json === 'string' ? JSON.parse(row.limits_json) : (row.limits_json || {});
            } catch (e) {}
            limits = { ...matrix.DEFAULT_LIMITS[planCode], ...limits };

            let modules = {};
            try {
                modules = typeof row.module_access_json === 'string' ? JSON.parse(row.module_access_json) : (row.module_access_json || {});
            } catch (e) {}
            modules = { ...matrix.DEFAULT_MODULES[planCode], ...modules };

            return {
                id: tenantId,
                plan_code: planCode,
                plan: row.plan || 'FREE',
                commercial_status: commercialStatus,
                status: row.status || 'ACTIVE',
                access_level: accessLevel,
                grace_started_at: row.grace_started_at,
                grace_ends_at: row.grace_ends_at,
                grace_extended_until: row.grace_extended_until,
                limits,
                modules,
                governance_notes: row.governance_notes_json
            };
        } catch (err) {
            logger.warn({ event: 'resolve_tenant_fallback', tenantId, error: err.message });
            return {
                id: tenantId,
                plan_code: matrix.PLANS.FREE,
                plan: 'FREE',
                commercial_status: matrix.COMMERCIAL_STATUSES.ACTIVE,
                status: 'ACTIVE',
                access_level: matrix.ACCESS_LEVELS.BASIC,
                limits: matrix.DEFAULT_LIMITS[matrix.PLANS.FREE],
                modules: matrix.DEFAULT_MODULES[matrix.PLANS.FREE]
            };
        }
    }

    /**
     * Resolves all entitlements, limits, modules and grace details.
     */
    async getTenantEntitlements(tenantId, actorContext = {}) {
        const tenant = await this.getTenantState(tenantId);
        
        // Calculate grace details
        let graceActive = false;
        let graceExpired = false;
        let daysRemaining = 0;

        const effectiveGraceEnds = tenant.grace_extended_until 
            ? new Date(tenant.grace_extended_until) 
            : (tenant.grace_ends_at ? new Date(tenant.grace_ends_at) : null);

        if (tenant.plan_code === matrix.PLANS.FOUNDING_PRINTHOUSE && effectiveGraceEnds) {
            const now = new Date();
            const timeDiff = effectiveGraceEnds.getTime() - now.getTime();
            daysRemaining = Math.max(0, Math.ceil(timeDiff / (1000 * 60 * 60 * 24)));
            
            if (tenant.commercial_status === matrix.COMMERCIAL_STATUSES.GRACE) {
                if (now < effectiveGraceEnds) {
                    graceActive = true;
                } else {
                    graceExpired = true;
                }
            } else if (tenant.commercial_status === matrix.COMMERCIAL_STATUSES.GRACE_EXPIRED) {
                graceExpired = true;
            }
        }

        // Generate allowed actions mapping
        const actions = {};
        const actionCodes = [
            'VIEW_CONTROL_PLANE', 'VIEW_MARKETPLACE_ORDERS', 'CREATE_MARKETPLACE_ORDER',
            'UPLOAD_PRODUCTION_FILE', 'RUN_PREFLIGHT', 'PREPARE_PRINTHOUSE_HANDOFF',
            'MARK_PRODUCTION_READY', 'QUEUE_PRODUCTION', 'ASSIGN_MACHINE', 'START_PRODUCTION',
            'PAUSE_PRODUCTION', 'RESUME_PRODUCTION', 'COMPLETE_PRODUCTION',
            'PREPARE_DELIVERY_HANDOFF', 'ACCESS_API', 'VIEW_FEDERATION', 'EXPORT_REPORTS',
            'VIEW_HISTORY', 'LOGIN'
        ];

        const blockers = [];
        const warnings = [];

        // Check if grace is expired
        if (graceExpired && tenant.commercial_status !== matrix.COMMERCIAL_STATUSES.GRACE_EXPIRED) {
            // Auto-trigger freeze if detected passively
            await this.freezeExpiredGraceTenant(tenantId, { userId: 'system-grace-monitor' }).catch(() => {});
            tenant.commercial_status = matrix.COMMERCIAL_STATUSES.GRACE_EXPIRED;
        }

        for (const action of actionCodes) {
            const evaluation = this.evaluateActionLocal(tenant, action);
            actions[action] = evaluation.allowed;
        }

        if (tenant.commercial_status === matrix.COMMERCIAL_STATUSES.GRACE_EXPIRED) {
            blockers.push({ code: 'TENANT_ACCESS_FROZEN', message: 'Grace period has expired. Operational mutations are frozen.' });
        } else if (tenant.commercial_status === matrix.COMMERCIAL_STATUSES.SUSPENDED) {
            blockers.push({ code: 'TENANT_SUSPENDED', message: 'Tenant is suspended.' });
        }

        return {
            ok: true,
            tenantId,
            planCode: tenant.plan_code,
            commercialStatus: tenant.commercial_status,
            accessLevel: tenant.access_level,
            grace: {
                active: graceActive,
                expired: graceExpired,
                startedAt: tenant.grace_started_at,
                endsAt: tenant.grace_ends_at,
                extendedUntil: tenant.grace_extended_until,
                daysRemaining
            },
            limits: tenant.limits,
            modules: tenant.modules,
            actions,
            blockers,
            warnings,
            source: 'CONTROL_PLANE',
            phase: '39.0'
        };
    }

    /**
     * Internal action checker.
     */
    evaluateActionLocal(tenant, actionCode) {
        const status = tenant.commercial_status;
        const modules = tenant.modules;

        // Grace Expired allows read-only
        if (status === matrix.COMMERCIAL_STATUSES.GRACE_EXPIRED) {
            const allowedInGraceExpired = ['LOGIN', 'VIEW_CONTROL_PLANE', 'VIEW_HISTORY', 'VIEW_MARKETPLACE_ORDERS', 'VIEW_FEDERATION'];
            if (!allowedInGraceExpired.includes(actionCode)) {
                return {
                    allowed: false,
                    blockers: [{ code: 'TENANT_ACCESS_FROZEN', message: 'Grace period expired. Production modifications are frozen.' }]
                };
            }
        }

        if (status === matrix.COMMERCIAL_STATUSES.SUSPENDED) {
            // Suspended only allows LOGIN
            if (actionCode !== 'LOGIN') {
                return {
                    allowed: false,
                    blockers: [{ code: 'TENANT_SUSPENDED', message: 'Account is suspended.' }]
                };
            }
        }

        // Map actions to required modules
        const actionModules = {
            VIEW_MARKETPLACE_ORDERS: 'marketplace_orders',
            CREATE_MARKETPLACE_ORDER: 'marketplace_orders',
            UPLOAD_PRODUCTION_FILE: 'file_repository',
            RUN_PREFLIGHT: 'basic_preflight',
            PREPARE_PRINTHOUSE_HANDOFF: 'print_house_handoff',
            MARK_PRODUCTION_READY: 'production_readiness',
            QUEUE_PRODUCTION: 'production_queue',
            ASSIGN_MACHINE: 'machine_assignment',
            START_PRODUCTION: 'production_queue',
            PAUSE_PRODUCTION: 'production_queue',
            RESUME_PRODUCTION: 'production_queue',
            COMPLETE_PRODUCTION: 'production_queue',
            PREPARE_DELIVERY_HANDOFF: 'print_house_handoff',
            VIEW_FEDERATION: 'federation_telemetry',
            EXPORT_REPORTS: 'reports',
            VIEW_HISTORY: 'job_history',
            ACCESS_API: 'api_access'
        };

        const requiredModule = actionModules[actionCode];
        if (requiredModule && !modules[requiredModule]) {
            return {
                allowed: false,
                blockers: [{ code: 'MODULE_NOT_ENTITLED', message: `Action ${actionCode} requires module ${requiredModule} which is not in plan.` }]
            };
        }

        return { allowed: true, blockers: [] };
    }

    /**
     * Evaluates action eligibility from a public context.
     */
    async evaluateTenantAction(tenantId, actionCode, context = {}) {
        const tenant = await this.getTenantState(tenantId);
        const evalResult = this.evaluateActionLocal(tenant, actionCode);

        // Optional Audit Event logging on failure
        if (!evalResult.allowed) {
            await this.logGovernanceEvent(tenantId, 'TENANT_ACTION_BLOCKED', {
                actorId: context.userId || 'system',
                planCode: tenant.plan_code,
                commercialStatus: tenant.commercial_status,
                actionCode,
                blockers: evalResult.blockers,
                reason: evalResult.blockers[0]?.message
            }).catch(() => {});
        } else {
            // Optional trace log
            await this.logGovernanceEvent(tenantId, 'TENANT_ACTION_ALLOWED', {
                actorId: context.userId || 'system',
                planCode: tenant.plan_code,
                commercialStatus: tenant.commercial_status,
                actionCode
            }).catch(() => {});
        }

        return {
            ok: true,
            allowed: evalResult.allowed,
            tenantId,
            planCode: tenant.plan_code,
            commercialStatus: tenant.commercial_status,
            actionCode,
            blockers: evalResult.blockers,
            warnings: [],
            limits: tenant.limits,
            entitlements: tenant.modules,
            audit: { source: 'CONTROL_PLANE', phase: '39.0' }
        };
    }

    /**
     * Gated module check.
     */
    async isModuleAllowed(tenantId, moduleCode) {
        const tenant = await this.getTenantState(tenantId);
        return !!tenant.modules[moduleCode];
    }

    /**
     * Assigns a plan to a tenant.
     */
    async assignTenantPlan(tenantId, planCode, actorContext, payload = {}) {
        if (!actorContext || !actorContext.userId) {
            throw new Error('Actor identity is required for plan assignment');
        }

        const normalizedPlan = matrix.normalizePlan(planCode);
        const tenant = await this.getTenantState(tenantId);

        const newStatus = payload.commercialStatus || 
            (normalizedPlan === matrix.PLANS.FOUNDING_PRINTHOUSE ? matrix.COMMERCIAL_STATUSES.GRACE : matrix.COMMERCIAL_STATUSES.ACTIVE);
        
        const newAccess = matrix.PLAN_ACCESS_LEVELS[normalizedPlan];

        const defaultLimits = matrix.DEFAULT_LIMITS[normalizedPlan];
        const defaultModules = matrix.DEFAULT_MODULES[normalizedPlan];

        // Check if the exact plan, status and limits already exist
        const isLimitsEqual = JSON.stringify(tenant.limits) === JSON.stringify({ ...defaultLimits, ...payload.limits });
        const isModulesEqual = JSON.stringify(tenant.modules) === JSON.stringify({ ...defaultModules, ...payload.modules });
        
        if (tenant.plan_code === normalizedPlan && 
            tenant.commercial_status === newStatus && 
            isLimitsEqual && isModulesEqual && 
            !payload.force) {
            return { ok: true, idempotent: true };
        }

        const limitsJson = JSON.stringify({ ...defaultLimits, ...payload.limits });
        const moduleJson = JSON.stringify({ ...defaultModules, ...payload.modules });
        const notesJson = JSON.stringify({ reason: payload.reason || 'Plan assignment', assigned_at: new Date() });

        // Calculate grace columns
        let graceStart = null;
        let graceEnd = null;

        if (normalizedPlan === matrix.PLANS.FOUNDING_PRINTHOUSE) {
            graceStart = new Date();
            const graceDays = parseInt(payload.graceDays || defaultLimits.gracePeriodDays || 7);
            graceEnd = new Date(Date.now() + graceDays * 86400000);
        }

        // Keep tenants.plan in sync for backward compatibility
        // Map FOUNDING_PRINTHOUSE -> ENTERPRISE for ENUM safety in case migration hasn't altered it
        let legacyPlan = normalizedPlan;
        if (normalizedPlan === matrix.PLANS.FOUNDING_PRINTHOUSE || normalizedPlan === matrix.PLANS.CUSTOM) {
            legacyPlan = 'ENTERPRISE';
        }

        // Execute Update
        await db.query(
            `UPDATE tenants 
             SET plan_code = ?, plan = ?, commercial_status = ?, access_level = ?,
                 grace_started_at = ?, grace_ends_at = ?,
                 limits_json = ?, entitlements_json = ?, module_access_json = ?, governance_notes_json = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                normalizedPlan, legacyPlan, newStatus, newAccess,
                graceStart, graceEnd,
                limitsJson, moduleJson, moduleJson, notesJson,
                tenantId
            ]
        );

        // Write tenant_plan_history for backward compatibility
        await db.query(
            `INSERT INTO tenant_plan_history (tenant_id, old_plan, new_plan, reason)
             VALUES (?, ?, ?, ?)`,
            [tenantId, tenant.plan_code, normalizedPlan, payload.reason || 'Plan assigned by admin']
        );

        // Write audit governance event
        await this.logGovernanceEvent(tenantId, 'TENANT_PLAN_ASSIGNED', {
            actorId: actorContext.userId,
            planCode: normalizedPlan,
            commercialStatus: newStatus,
            reason: payload.reason || 'Admin plan assignment',
            metadata: payload
        });

        if (normalizedPlan === matrix.PLANS.FOUNDING_PRINTHOUSE) {
            await this.logGovernanceEvent(tenantId, 'TENANT_GRACE_STARTED', {
                actorId: actorContext.userId,
                planCode: normalizedPlan,
                commercialStatus: newStatus,
                reason: 'Grace period initialized for Founding Printhouse pilot onboarding',
                metadata: { graceStart, graceEnd }
            });
        }

        return { ok: true, updated: true };
    }

    /**
     * Extends a grace period.
     */
    async extendGracePeriod(tenantId, actorContext, payload) {
        if (!actorContext || !actorContext.userId) {
            throw new Error('Actor identity is required for grace extension');
        }
        if (!payload || !payload.reason) {
            throw new Error('Reason is required for grace extension');
        }

        const tenant = await this.getTenantState(tenantId);
        if (tenant.plan_code !== matrix.PLANS.FOUNDING_PRINTHOUSE) {
            throw new Error('Grace period extension is only applicable for FOUNDING_PRINTHOUSE plan');
        }

        const currentGraceEnd = tenant.grace_extended_until 
            ? new Date(tenant.grace_extended_until) 
            : (tenant.grace_ends_at ? new Date(tenant.grace_ends_at) : new Date());

        let newGraceEnd;
        if (payload.graceDays) {
            newGraceEnd = new Date(Date.now() + parseInt(payload.graceDays) * 86400000);
        } else if (payload.newGraceEndDate) {
            newGraceEnd = new Date(payload.newGraceEndDate);
        } else {
            throw new Error('Either graceDays or newGraceEndDate must be provided');
        }

        // Prevent shortening grace unless forced
        if (newGraceEnd < currentGraceEnd && !payload.force) {
            throw new Error('New grace period cannot be shorter than current grace period unless force=true');
        }

        const notes = {
            ...(tenant.governance_notes || {}),
            extension_reason: payload.reason,
            extended_at: new Date(),
            extended_by: actorContext.userId
        };

        // Update DB
        await db.query(
            `UPDATE tenants 
             SET grace_extended_until = ?, governance_notes_json = ?, commercial_status = 'GRACE'
             WHERE id = ?`,
            [newGraceEnd, JSON.stringify(notes), tenantId]
        );

        // Audit Event
        await this.logGovernanceEvent(tenantId, 'TENANT_GRACE_EXTENDED', {
            actorId: actorContext.userId,
            planCode: tenant.plan_code,
            commercialStatus: 'GRACE',
            reason: payload.reason,
            metadata: { previousEnd: currentGraceEnd, newEnd: newGraceEnd }
        });

        return { ok: true, extendedUntil: newGraceEnd };
    }

    /**
     * Checks file size limit.
     */
    async checkFileLimit(tenantId, fileSizeBytes, context = {}) {
        const tenant = await this.getTenantState(tenantId);
        const limits = tenant.limits;
        const maxMb = limits.maxFileSizeMb || 25;
        const maxBytes = maxMb * 1024 * 1024;

        const blockers = [];
        const warnings = [];

        if (fileSizeBytes > maxBytes) {
            const msg = `File size (${(fileSizeBytes / 1024 / 1024).toFixed(2)} MB) exceeds commercial limit of ${maxMb} MB for plan ${tenant.plan_code}`;
            blockers.push({
                code: 'TENANT_FILE_LIMIT_EXCEEDED',
                message: msg,
                limitMb: maxMb,
                actualMb: Number((fileSizeBytes / 1024 / 1024).toFixed(2))
            });

            await this.logGovernanceEvent(tenantId, 'TENANT_LIMIT_EXCEEDED', {
                actorId: context.userId || 'system',
                planCode: tenant.plan_code,
                commercialStatus: tenant.commercial_status,
                reason: msg,
                metadata: { fileSizeBytes, limitBytes: maxBytes, limitMb: maxMb }
            }).catch(() => {});
        }

        return {
            ok: blockers.length === 0,
            blockers,
            warnings,
            limits: { maxFileSizeMb: maxMb }
        };
    }

    /**
     * Checks total job/package size limit.
     */
    async checkJobLimit(tenantId, totalJobSizeBytes, context = {}) {
        const tenant = await this.getTenantState(tenantId);
        const limits = tenant.limits;
        const maxMb = limits.maxJobSizeMb || 50;
        const maxBytes = maxMb * 1024 * 1024;

        const blockers = [];
        const warnings = [];

        if (totalJobSizeBytes > maxBytes) {
            const msg = `Job size (${(totalJobSizeBytes / 1024 / 1024).toFixed(2)} MB) exceeds commercial limit of ${maxMb} MB for plan ${tenant.plan_code}`;
            blockers.push({
                code: 'TENANT_JOB_LIMIT_EXCEEDED',
                message: msg,
                limitMb: maxMb,
                actualMb: Number((totalJobSizeBytes / 1024 / 1024).toFixed(2))
            });

            await this.logGovernanceEvent(tenantId, 'TENANT_LIMIT_EXCEEDED', {
                actorId: context.userId || 'system',
                planCode: tenant.plan_code,
                commercialStatus: tenant.commercial_status,
                reason: msg,
                metadata: { totalJobSizeBytes, limitBytes: maxBytes, limitMb: maxMb }
            }).catch(() => {});
        }

        return {
            ok: blockers.length === 0,
            blockers,
            warnings,
            limits: { maxJobSizeMb: maxMb }
        };
    }

    /**
     * Detects if the grace period has expired.
     */
    async detectGraceExpiration(tenantId) {
        const tenant = await this.getTenantState(tenantId);
        if (tenant.plan_code !== matrix.PLANS.FOUNDING_PRINTHOUSE) {
            return { state: 'NOT_APPLICABLE' };
        }

        const effectiveGraceEnds = tenant.grace_extended_until 
            ? new Date(tenant.grace_extended_until) 
            : (tenant.grace_ends_at ? new Date(tenant.grace_ends_at) : null);

        if (!effectiveGraceEnds) {
            return { state: 'NOT_APPLICABLE' };
        }

        const now = new Date();
        if (now >= effectiveGraceEnds) {
            return { state: 'EXPIRED', endsAt: effectiveGraceEnds };
        }

        return { state: 'ACTIVE', endsAt: effectiveGraceEnds };
    }

    /**
     * Freezes a tenant whose grace has expired.
     */
    async freezeExpiredGraceTenant(tenantId, actorContext = {}) {
        const tenant = await this.getTenantState(tenantId);
        
        if (tenant.commercial_status === matrix.COMMERCIAL_STATUSES.GRACE_EXPIRED) {
            return { ok: true, idempotent: true };
        }

        // Transition status to GRACE_EXPIRED
        await db.query(
            `UPDATE tenants 
             SET commercial_status = 'GRACE_EXPIRED', updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [tenantId]
        );

        // Write audit governance event
        await this.logGovernanceEvent(tenantId, 'TENANT_GRACE_EXPIRED', {
            actorId: actorContext.userId || 'system-grace-monitor',
            planCode: tenant.plan_code,
            commercialStatus: 'GRACE_EXPIRED',
            reason: 'Founding Printhouse grace period expired. New production actions frozen.'
        });

        await this.logGovernanceEvent(tenantId, 'TENANT_GRACE_FROZEN', {
            actorId: actorContext.userId || 'system-grace-monitor',
            planCode: tenant.plan_code,
            commercialStatus: 'GRACE_EXPIRED',
            reason: 'Operational actions frozen. Login, View and History remain enabled.'
        });

        return { ok: true, frozen: true };
    }

    /**
     * Logs a governance event to the database.
     */
    async logGovernanceEvent(tenantId, eventType, data = {}) {
        try {
            const blockersJson = data.blockers ? JSON.stringify(data.blockers) : null;
            const warningsJson = data.warnings ? JSON.stringify(data.warnings) : null;
            const metadataJson = JSON.stringify({
                source: 'CONTROL_PLANE',
                phase: '39.0',
                ...data.metadata
            });

            await db.query(
                `INSERT INTO tenant_governance_events 
                 (tenant_id, event_type, actor_id, plan_code, commercial_status, action_code, blockers_json, warnings_json, reason, metadata_json)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    tenantId, eventType, data.actorId || null, data.planCode || null,
                    data.commercialStatus || null, data.actionCode || null,
                    blockersJson, warningsJson, data.reason || null, metadataJson
                ]
            );
        } catch (err) {
            logger.warn({ event: 'log_governance_event_failed', tenantId, error: err.message });
        }
    }
}

module.exports = new TenantPlanGovernanceService();
