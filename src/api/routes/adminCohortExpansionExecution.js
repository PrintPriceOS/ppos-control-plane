const express = require('express');
const router = express.Router();
const CohortExpansionExecutionService = require('../services/cohortExpansionExecutionService');
const CohortExpansionMonitoringService = require('../services/cohortExpansionMonitoringService');

const execSvc = new CohortExpansionExecutionService();
const monSvc = new CohortExpansionMonitoringService();

router.use((req, res, next) => {
    req.actor = { role: 'OPS_ADMIN', userId: 'admin_1', tenantId: 't_1' }; // Mock actor
    next();
});

router.post('/prepare', async (req, res) => {
    try {
        const execution = await execSvc.prepareExpansionExecution({ 
            expansionReviewId: req.body.expansionReviewId, 
            proposedLimits: req.body.proposedLimits, 
            actor: req.actor 
        });
        res.json({ success: true, execution });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/:expansionExecutionId/validate', async (req, res) => {
    try {
        const execution = await execSvc.validateExpansionExecution({ 
            expansionExecutionId: req.params.expansionExecutionId, 
            actor: req.actor 
        });
        res.json({ success: true, execution });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/:expansionExecutionId/approve', async (req, res) => {
    try {
        const execution = await execSvc.approveExpansionExecution({ 
            expansionExecutionId: req.params.expansionExecutionId, 
            actor: req.actor 
        });
        res.json({ success: true, execution });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/:expansionExecutionId/execute', async (req, res) => {
    try {
        const execution = await execSvc.executeExpansion({ 
            expansionExecutionId: req.params.expansionExecutionId, 
            actor: req.actor 
        });
        res.json({ success: true, execution });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/:expansionExecutionId/pause', async (req, res) => {
    try {
        const execution = await execSvc.pauseExpansion({ 
            expansionExecutionId: req.params.expansionExecutionId, 
            reason: req.body.reason,
            actor: req.actor 
        });
        res.json({ success: true, execution });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/:expansionExecutionId/rollback', async (req, res) => {
    try {
        const execution = await execSvc.rollbackExpansion({ 
            expansionExecutionId: req.params.expansionExecutionId, 
            reason: req.body.reason,
            actor: req.actor 
        });
        res.json({ success: true, execution });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/:expansionExecutionId/cancel', async (req, res) => {
    try {
        const execution = await execSvc.cancelExpansion({ 
            expansionExecutionId: req.params.expansionExecutionId, 
            reason: req.body.reason,
            actor: req.actor 
        });
        res.json({ success: true, execution });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.get('/:expansionExecutionId/monitoring', async (req, res) => {
    try {
        const monitoring = await monSvc.evaluateExpansionHealth({ 
            expansionExecutionId: req.params.expansionExecutionId, 
            actor: req.actor 
        });
        res.json({ success: true, monitoring });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.get('/:expansionExecutionId/audit-timeline', async (req, res) => {
    try {
        const timeline = await execSvc.auditService.getExpansionExecutionTimeline({ 
            expansionExecutionId: req.params.expansionExecutionId, 
            actor: req.actor 
        });
        res.json({ success: true, timeline });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

module.exports = router;
