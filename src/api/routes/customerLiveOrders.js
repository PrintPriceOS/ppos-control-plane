const express = require('express');

module.exports = function createCustomerLiveOrdersRoutes(dependencies) {
    const router = express.Router();
    const { 
        customerLiveOrderViewService,
        liveOrderLifecycleService
    } = dependencies;

    const getActor = (req) => ({
        userId: req.user ? req.user.id : 'customer_anon',
        role: req.user ? req.user.role : 'CUSTOMER',
        tenantId: req.user ? req.user.tenantId : null
    });

    router.get('/', async (req, res) => {
        try {
            const actor = getActor(req);
            if (actor.role !== 'CUSTOMER') return res.status(403).json({ error: 'Endpoint restricted to customers' });
            
            // In reality this would query the DB filtered by tenant_id and customer_id
            const orders = await liveOrderLifecycleService.listLiveOrders({ customer_id: actor.userId, tenant_id: actor.tenantId }, actor);
            
            const safeOrders = await Promise.all(orders.map(o => customerLiveOrderViewService.buildCustomerLiveOrderSummary({ liveOrderId: o.id, actor })));
            res.json(safeOrders);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/:liveOrderId', async (req, res) => {
        try {
            const actor = getActor(req);
            const view = await customerLiveOrderViewService.buildCustomerLiveOrderView({ liveOrderId: req.params.liveOrderId, actor });
            res.json(view);
        } catch (err) {
            res.status(403).json({ error: err.message });
        }
    });

    router.get('/:liveOrderId/summary', async (req, res) => {
        try {
            const actor = getActor(req);
            const summary = await customerLiveOrderViewService.buildCustomerLiveOrderSummary({ liveOrderId: req.params.liveOrderId, actor });
            res.json(summary);
        } catch (err) {
            res.status(403).json({ error: err.message });
        }
    });

    router.get('/:liveOrderId/next-actions', async (req, res) => {
        try {
            const actor = getActor(req);
            const actions = await customerLiveOrderViewService.buildCustomerNextActions({ liveOrderId: req.params.liveOrderId, actor });
            res.json(actions);
        } catch (err) {
            res.status(403).json({ error: err.message });
        }
    });

    router.get('/:liveOrderId/timeline', async (req, res) => {
        try {
            const actor = getActor(req);
            // Assert access
            await customerLiveOrderViewService.assertCustomerCanViewLiveOrder({ liveOrderId: req.params.liveOrderId, actor });
            // Fetch internal events (mocked here)
            const events = []; // In a real app: await liveOrderLifecycleService.getEvents(...)
            const safeTimeline = customerLiveOrderViewService.sanitizeTimelineForCustomer(events);
            res.json(safeTimeline);
        } catch (err) {
            res.status(403).json({ error: err.message });
        }
    });

    router.get('/:liveOrderId/documents', async (req, res) => {
        try {
            const actor = getActor(req);
            await customerLiveOrderViewService.assertCustomerCanViewLiveOrder({ liveOrderId: req.params.liveOrderId, actor });
            res.json([]); // Customer-safe documents only
        } catch (err) {
            res.status(403).json({ error: err.message });
        }
    });

    router.get('/:liveOrderId/reports', async (req, res) => {
        try {
            const actor = getActor(req);
            await customerLiveOrderViewService.assertCustomerCanViewLiveOrder({ liveOrderId: req.params.liveOrderId, actor });
            
            // Mocking reports to show separation
            const allReports = [
                { id: 'r1', type: 'customer_safe_report', url: '/safe-report.pdf' },
                { id: 'r2', type: 'operator_report', url: '/internal-report.pdf' },
                { id: 'r3', type: 'raw_audit_report', url: '/audit.json' },
                { id: 'r4', type: 'raw_preflight_report', url: '/preflight.json' }
            ];
            
            const safeReports = allReports.filter(r => r.type === 'customer_safe_report');
            res.json(safeReports);
        } catch (err) {
            res.status(403).json({ error: err.message });
        }
    });

    router.get('/:liveOrderId/messages', async (req, res) => {
        try {
            const actor = getActor(req);
            await customerLiveOrderViewService.assertCustomerCanViewLiveOrder({ liveOrderId: req.params.liveOrderId, actor });
            res.json([]); // Customer-safe messages only
        } catch (err) {
            res.status(403).json({ error: err.message });
        }
    });

    return router;
};
