'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationReadinessBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationReadinessEvaluatorService').serviceInstance;
const evidenceSvc = require('../services/cohortInterventionExecutionPlanActivationReadinessEvidencePackService').serviceInstance;
const decisionSvc = require('../services/cohortInterventionExecutionPlanActivationReadinessDecisionService').serviceInstance;
const auditSvc = require('../services/cohortInterventionExecutionPlanActivationReadinessAuditService').serviceInstance;

router.get('/readiness', async (req, res, next) => {
  try {
    const list = await builder.listReadiness();
    res.json({ readinessList: list });
  } catch (err) {
    next(err);
  }
});

router.get('/readiness/:activationRdId', async (req, res, next) => {
  try {
    const record = await builder.getReadiness(req.params.activationRdId);
    if (!record) {
      return res.status(404).json({ error: 'READINESS_RECORD_NOT_FOUND' });
    }
    const rules = await builder.getRules(req.params.activationRdId);
    const evidence = await evidenceSvc.getEvidence(req.params.activationRdId);
    const auditLogs = await auditSvc.getAuditLogs(req.params.activationRdId);
    res.json({ readiness: record, rules, evidence, auditLogs });
  } catch (err) {
    next(err);
  }
});

router.post('/readiness/from-plan/:planId', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { readiness } = await builder.createReadiness(req.params.planId, actorId);
    res.status(201).json({ readiness });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('NOT_FINALIZED') || err.message.includes('NOT_APPROVED') || err.message.includes('VIOLATION')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/readiness/:activationRdId/evaluate', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const overrides = req.body.overrides || {};
    const result = await evaluator.evaluateReadiness(req.params.activationRdId, overrides, actorId);
    res.json({ success: true, result });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/readiness/:activationRdId/decision', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { result, rationale } = req.body;
    const { readiness } = await decisionSvc.recordDecision(req.params.activationRdId, result, rationale, actorId);
    res.json({ readiness });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('INVALID') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/readiness/:activationRdId/finalize', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { readiness } = await decisionSvc.finalizeReadiness(req.params.activationRdId, actorId);
    res.json({ readiness });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('NOT_COMPLETED') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
