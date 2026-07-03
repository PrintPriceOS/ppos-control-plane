const express = require('express');
const router = express.Router();
const builderSvc = require('../services/cohortInterventionSimulationApprovalPreparationBuilderService').serviceInstance || require('../services/cohortInterventionSimulationApprovalPreparationBuilderService');
const evaluatorSvc = require('../services/cohortInterventionSimulationApprovalPreparationEvaluatorService').serviceInstance || require('../services/cohortInterventionSimulationApprovalPreparationEvaluatorService');
const decisionSvc = require('../services/cohortInterventionSimulationApprovalPreparationDecisionService').serviceInstance || require('../services/cohortInterventionSimulationApprovalPreparationDecisionService');
const evidenceSvc = require('../services/cohortInterventionSimulationApprovalPreparationEvidencePackService').serviceInstance || require('../services/cohortInterventionSimulationApprovalPreparationEvidencePackService');
const auditSvc = require('../services/cohortInterventionSimulationApprovalPreparationAuditService').serviceInstance || require('../services/cohortInterventionSimulationApprovalPreparationAuditService');

// Exigent admin verification middleware
router.use((req, res, next) => {
  if (!req.admin) {
    return res.status(403).json({ ok: false, error: 'Admin access required' });
  }
  next();
});

router.get('/preps', async (req, res) => {
  try {
    const list = await builderSvc.getPreps();
    res.json({ ok: true, preps: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/preps/:prepId', async (req, res) => {
  try {
    const prep = await builderSvc.getPrep(req.params.prepId);
    if (!prep) return res.status(404).json({ ok: false, error: 'Preparation package not found' });
    const findings = await evaluatorSvc.getFindings(req.params.prepId);
    const evidence = await evidenceSvc.getEvidence(req.params.prepId);
    const auditLogs = await auditSvc.getAuditEvents(req.params.prepId);
    res.json({ ok: true, prep, findings, evidence, auditLogs });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/preps/from-review/:reviewId', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await builderSvc.createPrep(req.params.reviewId, actorId);
    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/preps/:prepId/evaluate', async (req, res) => {
  try {
    const { overrides } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await evaluatorSvc.evaluatePrep(req.params.prepId, actorId, overrides);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/preps/:prepId/finalize', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    // 1. Build the evidence pack v143.0
    await evidenceSvc.buildEvidencePack(req.params.prepId, actorId);
    // 2. Finalize preparation
    const result = await decisionSvc.finalizePrep(req.params.prepId, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/preps/:prepId/re-simulate', async (req, res) => {
  try {
    const { reason } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await decisionSvc.requestResimulation(req.params.prepId, reason, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/preps/:prepId/escalate', async (req, res) => {
  try {
    const { reason } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await decisionSvc.escalatePrep(req.params.prepId, reason, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;
