const express = require('express');

module.exports = function createLiveOrderIntakeRoutes(dependencies) {
    const { 
        liveOrderLifecycleService, 
        liveProductionGuardService,
        quotaEnforcementService,
        commercialPlanService
    } = dependencies;

    const getActor = (req) => ({
        userId: req.user ? req.user.id : 'anonymous',
        role: req.user ? req.user.role : 'CUSTOMER',
        tenantId: req.user ? req.user.tenantId : null
    });

    const adminRouter = express.Router();
    const customerRouter = express.Router();

    // --- CUSTOMER ROUTES ---
    customerRouter.post('/', async (req, res) => {
        try {
            const actor = getActor(req);
            const { tenant_id, printhouse_id, source_order_id, live_scope, order_type, customer_id, required_files } = req.body;

            // Enforce cross-tenant isolation for customers
            if (actor.role === 'CUSTOMER' && actor.tenantId && actor.tenantId !== tenant_id) {
                return res.status(403).json({ error: 'Cross-tenant access blocked' });
            }

            // Billing Status Check
            if (commercialPlanService) {
                const billingStatus = await commercialPlanService.getTenantBillingStatus(tenant_id);
                if (billingStatus === 'BLOCKED') {
                    return res.status(403).json({ error: 'BLOCKED: Billing status is BLOCKED' });
                }
            }

            // Quota Check
            if (quotaEnforcementService) {
                const quota = await quotaEnforcementService.checkQuota(tenant_id, 'LIVE_ORDERS');
                if (quota.status === 'HARD_LIMIT_REACHED') {
                    return res.status(403).json({ error: 'BLOCKED: Quota hard limit reached' });
                }
            }

            // Live Guard Check
            if (liveProductionGuardService) {
                const guardResult = await liveProductionGuardService.evaluateGuard('CREATE_LIVE_ORDER', {
                    tenantId: tenant_id,
                    printhouseId: printhouse_id,
                    actor
                });
                if (guardResult.decision === 'BLOCKED') {
                    return res.status(403).json({ error: `BLOCKED by guard: ${guardResult.reason}` });
                }
            }

            const payload = {
                liveScope: live_scope,
                orderType: order_type,
                liveOrderNumber: `CUST-${Date.now()}`,
                sourceChannel: 'CUSTOMER_PORTAL',
                requiredFiles: required_files
            };

            const order = await liveOrderLifecycleService.createLiveOrder({
                tenantId: tenant_id,
                printhouseId: printhouse_id,
                sourceOrderId: source_order_id,
                payload,
                actor
            });

            const safeOrder = await liveOrderLifecycleService.buildCustomerSafeLiveOrderSnapshot({ liveOrderId: order.id });
            res.status(201).json(safeOrder);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    customerRouter.get('/:liveOrderId/status', async (req, res) => {
        try {
            const actor = getActor(req);
            const order = await liveOrderLifecycleService.getLiveOrder({ liveOrderId: req.params.liveOrderId, actor });
            if (actor.role === 'CUSTOMER' && actor.tenantId && actor.tenantId !== order.tenant_id) {
                return res.status(403).json({ error: 'Cross-tenant access blocked' });
            }
            const safeOrder = await liveOrderLifecycleService.buildCustomerSafeLiveOrderSnapshot({ liveOrderId: order.id });
            res.json(safeOrder);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    // --- ADMIN ROUTES ---
    adminRouter.post('/', async (req, res) => {
        try {
            const actor = getActor(req);
            // Must have some internal or admin role
            if (actor.role === 'CUSTOMER') {
                return res.status(403).json({ error: 'Unauthorized' });
            }

            const { tenant_id, printhouse_id, source_order_id, live_scope, order_type, required_files } = req.body;

            // Billing Status Check
            if (commercialPlanService) {
                const billingStatus = await commercialPlanService.getTenantBillingStatus(tenant_id);
                if (billingStatus === 'BLOCKED') {
                    return res.status(403).json({ error: 'BLOCKED: Billing status is BLOCKED' });
                }
            }

            // Quota Check
            if (quotaEnforcementService) {
                const quota = await quotaEnforcementService.checkQuota(tenant_id, 'LIVE_ORDERS');
                if (quota.status === 'HARD_LIMIT_REACHED') {
                    return res.status(403).json({ error: 'BLOCKED: Quota hard limit reached' });
                }
            }

            // Live Guard Check
            if (liveProductionGuardService) {
                const guardResult = await liveProductionGuardService.evaluateGuard('CREATE_LIVE_ORDER', {
                    tenantId: tenant_id,
                    printhouseId: printhouse_id,
                    actor
                });
                if (guardResult.decision === 'BLOCKED') {
                    return res.status(403).json({ error: `BLOCKED by guard: ${guardResult.reason}` });
                }
            }

            const payload = {
                liveScope: live_scope,
                orderType: order_type,
                liveOrderNumber: `ADM-${Date.now()}`,
                sourceChannel: 'ADMIN_CREATED',
                requiredFiles: required_files
            };

            const order = await liveOrderLifecycleService.createLiveOrder({
                tenantId: tenant_id,
                printhouseId: printhouse_id,
                sourceOrderId: source_order_id,
                payload,
                actor
            });

            res.status(201).json(order);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    adminRouter.post('/:liveOrderId/cancel', async (req, res) => {
        try {
            const actor = getActor(req);
            if (actor.role === 'CUSTOMER') return res.status(403).json({ error: 'Unauthorized' });
            
            const transitioned = await liveOrderLifecycleService.transitionLiveOrder({
                liveOrderId: req.params.liveOrderId,
                nextStatus: 'LIVE_CANCELLED',
                reason: req.body.reason || 'Admin cancelled',
                actor
            });
            res.json(transitioned);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    adminRouter.get('/:liveOrderId/operator-status', async (req, res) => {
        try {
            const actor = getActor(req);
            const order = await liveOrderLifecycleService.buildOperatorLiveOrderSnapshot({ liveOrderId: req.params.liveOrderId, actor });
            res.json(order);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    return { adminRouter, customerRouter };
};
