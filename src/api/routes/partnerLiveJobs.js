const express = require('express');

function createPartnerLiveJobsRouter({ partnerLiveJobService }) {
    const router = express.Router();

    // Mock middleware for role and scope enforcement
    const enforcePartnerScope = (req, res, next) => {
        const actor = req.actor;
        if (!actor || !actor.tenantId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const validRoles = ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN', 'PRINTHOUSE_ADMIN', 'PRINTHOUSE_OPERATOR'];
        if (!validRoles.includes(actor.role)) {
            return res.status(403).json({ error: 'Forbidden: Invalid role for partner operations' });
        }

        if (['PRINTHOUSE_ADMIN', 'PRINTHOUSE_OPERATOR'].includes(actor.role) && !actor.printhouseId) {
            return res.status(403).json({ error: 'Forbidden: No printhouse context' });
        }

        next();
    };

    router.use(enforcePartnerScope);

    router.get('/', async (req, res) => {
        try {
            const jobs = await partnerLiveJobService.listPartnerLiveJobs(req.query, req.actor);
            res.json({ jobs });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/:partnerLiveJobId', async (req, res) => {
        try {
            const safePayload = await partnerLiveJobService.buildPartnerSafeJobPayload({ 
                partnerLiveJobId: req.params.partnerLiveJobId, 
                actor: req.actor,
                orderPayload: req.body.rawPayload || {} // mocked injection for testing
            });
            res.json({ job: safePayload });
        } catch (err) {
            if (err.message.includes('Unauthorized') || err.message.includes('Cross-')) {
                return res.status(403).json({ error: 'Forbidden' });
            }
            res.status(404).json({ error: err.message });
        }
    });

    router.get('/:partnerLiveJobId/summary', async (req, res) => {
        try {
            const job = await partnerLiveJobService.getPartnerLiveJob({ partnerLiveJobId: req.params.partnerLiveJobId, actor: req.actor });
            res.json({ summary: { status: job.partner_job_status, due_at: job.due_at } });
        } catch (err) {
            res.status(403).json({ error: 'Forbidden' });
        }
    });

    router.get('/:partnerLiveJobId/handoff', async (req, res) => {
        try {
            const safePayload = await partnerLiveJobService.buildPartnerSafeJobPayload({ 
                partnerLiveJobId: req.params.partnerLiveJobId, 
                actor: req.actor,
                orderPayload: req.body.rawPayload || {}
            });
            
            // Audit handoff access
            await partnerLiveJobService.recordPartnerLiveJobEvent({
                tenantId: req.actor.tenantId,
                printhouseId: req.actor.printhouseId || 'system',
                partnerLiveJobId: req.params.partnerLiveJobId,
                liveOrderId: 'lo_unknown',
                eventType: 'PARTNER_HANDOFF_DOWNLOADED',
                actor: req.actor
            });

            res.json({ handoff: safePayload.partner_safe_handoff_json });
        } catch (err) {
            res.status(403).json({ error: 'Forbidden' });
        }
    });

    router.get('/:partnerLiveJobId/files', async (req, res) => {
        try {
            await partnerLiveJobService.assertPartnerCanViewJob({ partnerLiveJobId: req.params.partnerLiveJobId, actor: req.actor });
            
            // Audit file access
            await partnerLiveJobService.recordPartnerLiveJobEvent({
                tenantId: req.actor.tenantId,
                printhouseId: req.actor.printhouseId || 'system',
                partnerLiveJobId: req.params.partnerLiveJobId,
                liveOrderId: 'lo_unknown',
                eventType: 'PARTNER_FILES_ACCESSED',
                actor: req.actor
            });

            res.json({ files: [{ file_id: 'safe_id_1', url: '/api/safe/download/1' }] }); // No raw paths
        } catch (err) {
            res.status(403).json({ error: 'Forbidden' });
        }
    });

    router.get('/:partnerLiveJobId/timeline', async (req, res) => {
        try {
            await partnerLiveJobService.assertPartnerCanViewJob({ partnerLiveJobId: req.params.partnerLiveJobId, actor: req.actor });
            res.json({ timeline: [{ event: 'JOB_ASSIGNED', safe: true }] });
        } catch (err) {
            res.status(403).json({ error: 'Forbidden' });
        }
    });

    router.get('/:partnerLiveJobId/incidents', async (req, res) => {
        try {
            await partnerLiveJobService.assertPartnerCanViewJob({ partnerLiveJobId: req.params.partnerLiveJobId, actor: req.actor });
            res.json({ incidents: [] });
        } catch (err) {
            res.status(403).json({ error: 'Forbidden' });
        }
    });

    router.get('/:partnerLiveJobId/allowed-actions', async (req, res) => {
        try {
            await partnerLiveJobService.assertPartnerCanViewJob({ partnerLiveJobId: req.params.partnerLiveJobId, actor: req.actor });
            // Cannot include proof, payment, live enablement
            const actions = ['ACCEPT', 'REJECT', 'HOLD', 'START_PRODUCTION'];
            res.json({ allowed_actions: actions });
        } catch (err) {
            res.status(403).json({ error: 'Forbidden' });
        }
    });

    // Explicit blocks for governance bypass
    router.post('/:partnerLiveJobId/approve-proof', (req, res) => res.status(403).json({ error: 'Partner route cannot approve proof' }));
    router.post('/:partnerLiveJobId/approve-payment', (req, res) => res.status(403).json({ error: 'Partner route cannot approve payment' }));
    router.post('/:partnerLiveJobId/enable-live', (req, res) => res.status(403).json({ error: 'Partner route cannot enable live production' }));

    return router;
}

module.exports = createPartnerLiveJobsRouter;
