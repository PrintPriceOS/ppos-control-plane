'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationDecisionBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationDecisionEvaluatorService').serviceInstance;
const evidenceSvc = require('../services/cohortInterventionExecutionPlanActivationDecisionEvidencePackService').serviceInstance;
const decisionSvc = require('../services/cohortInterventionExecutionPlanActivationDecisionDecisionService').serviceInstance;
const auditSvc = require('../services/cohortInterventionExecutionPlanActivationDecisionAuditService').serviceInstance;

router.get('/decision', async (req, res, next) => {
  try {
    const list = await builder.listDecision();
    res.json({ decisionList: list });
  } catch (err) {
    next(err);
  }
});

router.get('/decision/:activationDecisionId', async (req, res, next) => {
  try {
    const record = await builder.getDecision(req.params.activationDecisionId);
    if (!record) {
      return res.status(404).json({ error: 'DECISION_RECORD_NOT_FOUND' });
    }
    const rules = await builder.getRules(req.params.activationDecisionId);
    const evidence = await evidenceSvc.getEvidence(req.params.activationDecisionId);
    const auditLogs = await auditSvc.getAuditLogs(req.params.activationDecisionId);
    res.json({ decision: record, rules, evidence, auditLogs });
  } catch (err) {
    next(err);
  }
});

router.post('/decision/from-lock/:activationLockId', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { decision } = await builder.createDecision(req.params.activationLockId, actorId);
    res.status(201).json({ decision });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('NOT_FINALIZED') || err.message.includes('NOT_APPROVED') || err.message.includes('VIOLATION')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/decision/:activationDecisionId/evaluate', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const overrides = req.body.overrides || {};
    const result = await evaluator.evaluateDecision(req.params.activationDecisionId, overrides, actorId);
    res.json({ success: true, result });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/decision/:activationDecisionId/decision', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { result, rationale } = req.body;
    const { decision } = await decisionSvc.recordDecision(req.params.activationDecisionId, result, rationale, actorId);
    res.json({ decision });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('INVALID') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/decision/:activationDecisionId/finalize', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { decision } = await decisionSvc.finalizeDecision(req.params.activationDecisionId, actorId);
    res.json({ decision });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('NOT_COMPLETED') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
