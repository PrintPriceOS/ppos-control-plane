const express = require('express');
const router = express.Router();
const builderSvc = require('../services/cohortInterventionSimulationApprovalBuilderService').serviceInstance || require('../services/cohortInterventionSimulationApprovalBuilderService');
const evaluatorSvc = require('../services/cohortInterventionSimulationApprovalEvaluatorService').serviceInstance || require('../services/cohortInterventionSimulationApprovalEvaluatorService');
const decisionSvc = require('../services/cohortInterventionSimulationApprovalDecisionService').serviceInstance || require('../services/cohortInterventionSimulationApprovalDecisionService');
const evidenceSvc = require('../services/cohortInterventionSimulationApprovalEvidencePackService').serviceInstance || require('../services/cohortInterventionSimulationApprovalEvidencePackService');
const auditSvc = require('../services/cohortInterventionSimulationApprovalAuditService').serviceInstance || require('../services/cohortInterventionSimulationApprovalAuditService');

// Exigent admin verification middleware
router.use((req, res, next) => {
  if (!req.admin) {
    return res.status(403).json({ ok: false, error: 'Admin access required' });
  }
  next();
});

router.get('/approvals', async (req, res) => {
  try {
    const list = await builderSvc.getApprovals();
    res.json({ ok: true, approvals: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/approvals/:approvalId', async (req, res) => {
  try {
    const approval = await builderSvc.getApproval(req.params.approvalId);
    if (!approval) return res.status(404).json({ ok: false, error: 'Approval package not found' });
    const findings = await evaluatorSvc.getFindings(req.params.approvalId);
    const evidence = await evidenceSvc.getEvidence(req.params.approvalId);
    const auditLogs = await auditSvc.getAuditEvents(req.params.approvalId);
    res.json({ ok: true, approval, findings, evidence, auditLogs });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/approvals/from-preparation/:prepId', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await builderSvc.createApproval(req.params.prepId, actorId);
    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/approvals/:approvalId/evaluate', async (req, res) => {
  try {
    const { overrides } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await evaluatorSvc.evaluateApproval(req.params.approvalId, actorId, overrides);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/approvals/:approvalId/decision', async (req, res) => {
  try {
    const { decision, rationale } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await decisionSvc.recordDecision(req.params.approvalId, decision, rationale, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/approvals/:approvalId/finalize', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    // 1. Build evidence pack v144.0
    await evidenceSvc.buildEvidencePack(req.params.approvalId, actorId);
    // 2. Finalize approval
    const result = await decisionSvc.finalizeApproval(req.params.approvalId, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;
