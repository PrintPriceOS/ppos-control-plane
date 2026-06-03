/**
 * src/api/routes/adminTenantGovernance.js
 * 
 * Express router for Tenant Plan Governance administrative control.
 */

const express = require('express');
const router = express.Router();
const governanceService = require('../services/tenantPlanGovernanceService');
const { resolveActorContext } = require('../middleware/auth');
const db = require('../services/mysqlClient');

/**
 * Helper to wrap route handlers in fail-safe try/catch
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(err => {
            console.error('[GOVERNANCE-ROUTE-ERROR]', err);
            res.status(500).json({
                ok: false,
                error: {
                    code: 'GOVERNANCE_SYSTEM_ERROR',
                    message: err.message
                }
            });
        });
    };
}

/**
 * GET /api/admin/tenant-governance
 */
router.get('/', asyncHandler(async (req, res) => {
    const actor = resolveActorContext(req);
    const tenants = await db.query(
        `SELECT id, name, status, plan, plan_code, service_tier, commercial_status, access_level,
                grace_started_at, grace_ends_at, grace_extended_until,
                limits_json, entitlements_json, module_access_json, governance_notes_json,
                last_active_at, metadata_json
         FROM tenants
         ORDER BY id ASC`
    );

    const enriched = [];
    for (const t of tenants) {
        try {
            const ent = await governanceService.getTenantEntitlements(t.id, actor);
            let metadata = {};
            try {
                metadata = typeof t.metadata_json === 'string' ? JSON.parse(t.metadata_json) : (t.metadata_json || {});
            } catch (e) {}
            const type = metadata.type || 'PRINTHOUSE';

            // Summarize modules: count how many are true. If all or most (say, >10) are enabled, show "Full", else "Custom" or "Basic"
            const totalModules = Object.keys(ent.modules || {}).length;
            const enabledModules = Object.values(ent.modules || {}).filter(Boolean).length;
            const modulesSummary = enabledModules === totalModules ? 'Full' : (enabledModules > 0 ? `${enabledModules} Modules` : 'None');

            enriched.push({
                id: t.id,
                name: t.name,
                type,
                status: t.status,
                plan: t.plan,
                planCode: ent.planCode,
                serviceTier: ent.serviceTier || t.service_tier,
                commercialStatus: ent.commercialStatus,
                accessLevel: ent.accessLevel,
                grace: ent.grace,
                limits: ent.limits,
                resourceLimits: ent.resourceLimits,
                preflightQuotas: ent.preflightQuotas,
                effective_limits: ent.effective_limits,
                modulesSummary,
                lastActiveAt: t.last_active_at,
                blockers: ent.blockers || [],
                warnings: ent.warnings || []
            });
        } catch (err) {
            enriched.push({
                id: t.id,
                name: t.name,
                type: 'PRINTHOUSE',
                status: t.status,
                plan: t.plan,
                planCode: t.plan_code || t.plan || 'FREE',
                serviceTier: t.service_tier || 'standard',
                commercialStatus: t.commercial_status || 'ACTIVE',
                accessLevel: t.access_level || 'BASIC',
                grace: { active: false, expired: false, daysRemaining: 0 },
                limits: {},
                resourceLimits: null,
                preflightQuotas: null,
                modulesSummary: 'Inconsistent',
                lastActiveAt: t.last_active_at,
                blockers: [{ code: 'DATA_INCONSISTENCY', message: err.message }],
                warnings: []
            });
        }
    }

    res.json({
        ok: true,
        tenants: enriched
    });
}));

/**
 * GET /api/admin/tenant-governance/:tenantId/entitlements
 */
router.get('/:tenantId/entitlements', asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const actor = resolveActorContext(req);
    const entitlements = await governanceService.getTenantEntitlements(tenantId, actor);
    res.json(entitlements);
}));

/**
 * POST /api/admin/tenant-governance/:tenantId/plan
 */
router.post('/:tenantId/plan', asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const { planCode, commercialStatus, graceDays, reason } = req.body;
    const actor = resolveActorContext(req);

    if (!planCode) {
        return res.status(400).json({
            ok: false,
            error: { code: 'INVALID_PARAMETERS', message: 'planCode is required' }
        });
    }

    const result = await governanceService.assignTenantPlan(tenantId, planCode, actor, {
        commercialStatus,
        graceDays,
        reason
    });

    res.json(result);
}));

/**
 * POST /api/admin/tenant-governance/:tenantId/grace/extend
 */
router.post('/:tenantId/grace/extend', asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const { graceDays, reason, force } = req.body;
    const actor = resolveActorContext(req);

    if (!reason) {
        return res.status(400).json({
            ok: false,
            error: { code: 'OVERRIDE_REASON_REQUIRED', message: 'reason is required for grace extension' }
        });
    }
    if (!graceDays) {
        return res.status(400).json({
            ok: false,
            error: { code: 'INVALID_PARAMETERS', message: 'graceDays is required' }
        });
    }

    const result = await governanceService.extendGracePeriod(tenantId, actor, {
        graceDays,
        reason,
        force
    });

    res.json(result);
}));

/**
 * POST /api/admin/tenant-governance/:tenantId/evaluate-action
 */
router.post('/:tenantId/evaluate-action', asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const { actionCode, context } = req.body;

    if (!actionCode) {
        return res.status(400).json({
            ok: false,
            error: { code: 'INVALID_PARAMETERS', message: 'actionCode is required' }
        });
    }

    const result = await governanceService.evaluateTenantAction(tenantId, actionCode, context || {});
    res.json(result);
}));

/**
 * POST /api/admin/tenant-governance/:tenantId/check-file-limit
 */
router.post('/:tenantId/check-file-limit', asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const { fileSizeBytes } = req.body;

    if (fileSizeBytes === undefined) {
        return res.status(400).json({
            ok: false,
            error: { code: 'INVALID_PARAMETERS', message: 'fileSizeBytes is required' }
        });
    }

    const result = await governanceService.checkFileLimit(tenantId, fileSizeBytes);
    res.json(result);
}));

/**
 * POST /api/admin/tenant-governance/:tenantId/check-job-limit
 */
router.post('/:tenantId/check-job-limit', asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const { totalJobSizeBytes } = req.body;

    if (totalJobSizeBytes === undefined) {
        return res.status(400).json({
            ok: false,
            error: { code: 'INVALID_PARAMETERS', message: 'totalJobSizeBytes is required' }
        });
    }

    const result = await governanceService.checkJobLimit(tenantId, totalJobSizeBytes);
    res.json(result);
}));

/**
 * POST /api/admin/tenant-governance/:tenantId/grace/freeze-if-expired
 */
router.post('/:tenantId/grace/freeze-if-expired', asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const actor = resolveActorContext(req);

    const result = await governanceService.freezeExpiredGraceTenant(tenantId, actor);
    res.json(result);
}));

/**
 * PATCH /api/admin/tenant-governance/:tenantId
 */
router.patch('/:tenantId', asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const payload = req.body;
    const actor = resolveActorContext(req);

    const result = await governanceService.updateTenantGovernance(tenantId, payload, actor);
    res.json(result);
}));

module.exports = router;
