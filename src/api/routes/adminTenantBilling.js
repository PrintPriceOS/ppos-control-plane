/**
 * src/api/routes/adminTenantBilling.js
 * 
 * Express router for Tenant Billing, Usage, and Plan Limits administrative control.
 */

const express = require('express');
const router = express.Router();
const commercialPlanService = require('../services/commercialPlanService');
const usageMeteringService = require('../services/usageMeteringService');
const billingEventService = require('../services/billingEventService');
const { resolveActorContext } = require('../middleware/auth');
const db = require('../services/mysqlClient');

function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(err => {
            console.error('[BILLING-ROUTE-ERROR]', err);
            res.status(500).json({
                ok: false,
                error: {
                    code: 'BILLING_SYSTEM_ERROR',
                    message: err.message
                }
            });
        });
    };
}

/**
 * GET /api/admin/tenant-billing/plans
 */
router.get('/plans', asyncHandler(async (req, res) => {
    const plans = await commercialPlanService.listCommercialPlans();
    res.json({ ok: true, plans });
}));

/**
 * POST /api/admin/tenant-billing/plans
 */
router.post('/plans', asyncHandler(async (req, res) => {
    const actor = resolveActorContext(req);
    const result = await commercialPlanService.createOrUpdateCommercialPlan(req.body, actor);
    res.json(result);
}));

/**
 * GET /api/admin/tenant-billing/entitlements/:tenantId
 */
router.get('/entitlements/:tenantId', asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const entitlement = await commercialPlanService.evaluateTenantEntitlement({ tenantId });
    res.json({ ok: true, entitlement });
}));

/**
 * POST /api/admin/tenant-billing/entitlements/:tenantId/assign
 */
router.post('/entitlements/:tenantId/assign', asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const { planCode, status } = req.body;
    const actor = resolveActorContext(req);
    const result = await commercialPlanService.assignPlanToTenant({ tenantId, planCode, status, actor });
    res.json(result);
}));

/**
 * POST /api/admin/tenant-billing/entitlements/:tenantId/status
 */
router.post('/entitlements/:tenantId/status', asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const { billingStatus } = req.body;
    const actor = resolveActorContext(req);
    const result = await commercialPlanService.updateTenantBillingStatus({ tenantId, billingStatus, actor });
    res.json(result);
}));

/**
 * GET /api/admin/tenant-billing/usage/:tenantId
 */
router.get('/usage/:tenantId', asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const { periodKey } = req.query;
    const summary = await usageMeteringService.getTenantUsageSummary({ tenantId, periodKey });
    res.json({ ok: true, summary });
}));

/**
 * GET /api/admin/tenant-billing/events/:tenantId
 */
router.get('/events/:tenantId', asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const { periodKey } = req.query;
    const pk = periodKey || usageMeteringService.getCurrentPeriodKey();
    const summary = await billingEventService.summarizeTenantBillingPeriod({ tenantId, periodKey: pk });
    res.json({ ok: true, summary });
}));

/**
 * POST /api/admin/tenant-billing/adjustments/:tenantId
 */
router.post('/adjustments/:tenantId', asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const { amountCents, currency, reason } = req.body;
    const actor = resolveActorContext(req);
    const result = await billingEventService.applyManualAdjustment({
        tenantId,
        amountCents,
        currency,
        reason,
        actor
    });
    res.json({ ok: true, adjustment: result });
}));

module.exports = router;
