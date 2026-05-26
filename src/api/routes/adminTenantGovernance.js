/**
 * src/api/routes/adminTenantGovernance.js
 * 
 * Express router for Tenant Plan Governance administrative control.
 */

const express = require('express');
const router = express.Router();
const governanceService = require('../services/tenantPlanGovernanceService');
const { resolveActorContext } = require('../middleware/auth');

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

module.exports = router;
