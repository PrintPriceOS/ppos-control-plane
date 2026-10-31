'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationHandoffBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationHandoffEvaluatorService').serviceInstance;
const evidenceSvc = require('../services/cohortInterventionExecutionPlanActivationHandoffEvidencePackService').serviceInstance;
const decisionSvc = require('../services/cohortInterventionExecutionPlanActivationHandoffDecisionService').serviceInstance;
const auditSvc = require('../services/cohortInterventionExecutionPlanActivationHandoffAuditService').serviceInstance;

router.get('/handoff', async (req, res, next) => {
  try {
    const list = await builder.listHandoff();
    res.json({ handoffList: list });
  } catch (err) {
    next(err);
  }
});

router.get('/handoff/:activationHandoffId', async (req, res, next) => {
  try {
    const record = await builder.getHandoff(req.params.activationHandoffId);
    if (!record) {
      return res.status(404).json({ error: 'HANDOFF_RECORD_NOT_FOUND' });
    }
    const rules = await builder.getRules(req.params.activationHandoffId);
    const evidence = await evidenceSvc.getEvidence(req.params.activationHandoffId);
    const auditLogs = await auditSvc.getAuditLogs(req.params.activationHandoffId);
    res.json({ handoff: record, rules, evidence, auditLogs });
  } catch (err) {
    next(err);
  }
});

router.post('/handoff/from-decision/:activationDecisionId', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { handoff } = await builder.createHandoff(req.params.activationDecisionId, actorId);
    res.status(201).json({ handoff });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('NOT_FINALIZED') || err.message.includes('NOT_APPROVED') || err.message.includes('VIOLATION')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/handoff/:activationHandoffId/evaluate', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const overrides = req.body.overrides || {};
    const result = await evaluator.evaluateHandoff(req.params.activationHandoffId, overrides, actorId);
    res.json({ success: true, result });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/handoff/:activationHandoffId/decision', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { result, rationale } = req.body;
    const { handoff } = await decisionSvc.recordDecision(req.params.activationHandoffId, result, rationale, actorId);
    res.json({ handoff });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('INVALID') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/handoff/:activationHandoffId/finalize', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { handoff } = await decisionSvc.finalizeHandoff(req.params.activationHandoffId, actorId);
    res.json({ handoff });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('NOT_COMPLETED') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
