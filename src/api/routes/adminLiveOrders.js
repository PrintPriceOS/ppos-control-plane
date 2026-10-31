const express = require('express');

module.exports = function createAdminLiveOrdersRoutes(dependencies) {
    const router = express.Router();
    const { 
        liveOrderLifecycleService, 
        liveOrderPreflightGateService, 
        liveOrderProductionOpsService 
    } = dependencies;

    const getActor = (req) => ({
        userId: req.user ? req.user.id : 'anonymous',
        role: req.user ? req.user.role : 'SYSTEM_ADMIN',
        tenantId: req.user ? req.user.tenantId : null
    });

    router.get('/', async (req, res) => {
        try {
            const actor = getActor(req);
            const orders = await liveOrderLifecycleService.listLiveOrders(req.query, actor);
            res.json(orders);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/:liveOrderId', async (req, res) => {
        try {
            const actor = getActor(req);
            const order = await liveOrderLifecycleService.getLiveOrder({ liveOrderId: req.params.liveOrderId, actor });
            res.json(order);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/:liveOrderId/events', async (req, res) => {
        try {
            res.json([]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/:liveOrderId/gates', async (req, res) => {
        try {
            const actor = getActor(req);
            const snaps = await liveOrderLifecycleService.getLiveOrderGateSnapshots({ liveOrderId: req.params.liveOrderId, actor });
            res.json(snaps);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/:liveOrderId/evaluate', async (req, res) => {
        try {
            const actor = getActor(req);
            const evalRes = await liveOrderPreflightGateService.createLiveOrderGateSnapshots({ liveOrderId: req.params.liveOrderId, actor });
            res.json(evalRes);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    router.post('/:liveOrderId/enter-queue', async (req, res) => {
        try {
            const actor = getActor(req);
            const result = await liveOrderProductionOpsService.enterLiveProductionQueue({ liveOrderId: req.params.liveOrderId, actor });
            res.json(result);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    router.post('/:liveOrderId/assign-machine', async (req, res) => {
        try {
            const actor = getActor(req);
            const result = await liveOrderProductionOpsService.assignMachineToLiveOrder({ liveOrderId: req.params.liveOrderId, machineId: req.body.machineId, actor });
            res.json(result);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    router.post('/:liveOrderId/start-production', async (req, res) => {
        try {
            const actor = getActor(req);
            const result = await liveOrderProductionOpsService.startLiveOrderProduction({ liveOrderId: req.params.liveOrderId, actor });
            res.json(result);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    router.post('/:liveOrderId/pause-production', async (req, res) => {
        try {
            const actor = getActor(req);
            const result = await liveOrderProductionOpsService.pauseLiveOrderProduction({ liveOrderId: req.params.liveOrderId, reason: req.body.reason, actor });
            res.json(result);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    router.post('/:liveOrderId/resume-production', async (req, res) => {
        try {
            const actor = getActor(req);
            const result = await liveOrderProductionOpsService.resumeLiveOrderProduction({ liveOrderId: req.params.liveOrderId, actor });
            res.json(result);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    router.post('/:liveOrderId/generate-handoff', async (req, res) => {
        try {
            const actor = getActor(req);
            const result = await liveOrderProductionOpsService.generateLiveOrderHandoffPackage({ liveOrderId: req.params.liveOrderId, actor });
            res.json(result);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    router.post('/:liveOrderId/send-to-printhouse', async (req, res) => {
        try {
            const actor = getActor(req);
            const result = await liveOrderProductionOpsService.sendLiveOrderToPrinthouse({ liveOrderId: req.params.liveOrderId, actor });
            res.json(result);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    router.post('/:liveOrderId/complete', async (req, res) => {
        try {
            const actor = getActor(req);
            const result = await liveOrderProductionOpsService.markLiveOrderCompleted({ liveOrderId: req.params.liveOrderId, finalAuditPayload: req.body.finalAuditPayload, actor });
            res.json(result);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    router.post('/:liveOrderId/block', async (req, res) => {
        try {
            const actor = getActor(req);
            const result = await liveOrderProductionOpsService.blockLiveOrderProduction({ liveOrderId: req.params.liveOrderId, reason: req.body.reason, actor });
            res.json(result);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    return router;
};
