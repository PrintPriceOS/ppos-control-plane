'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanEvaluatorService').serviceInstance;
const evidenceSvc = require('../services/cohortInterventionExecutionPlanEvidencePackService').serviceInstance;
const decisionSvc = require('../services/cohortInterventionExecutionPlanDecisionService').serviceInstance;
const auditSvc = require('../services/cohortInterventionExecutionPlanAuditService').serviceInstance;

router.get('/plan', async (req, res, next) => {
  try {
    const list = await builder.listPlan();
    res.json({ planList: list });
  } catch (err) {
    next(err);
  }
});

router.get('/plan/:planId', async (req, res, next) => {
  try {
    const record = await builder.getPlan(req.params.planId);
    if (!record) {
      return res.status(404).json({ error: 'PLAN_RECORD_NOT_FOUND' });
    }
    const rules = await builder.getRules(req.params.planId);
    const evidence = await evidenceSvc.getEvidence(req.params.planId);
    const auditLogs = await auditSvc.getAuditLogs(req.params.planId);
    res.json({ plan: record, rules, evidence, auditLogs });
  } catch (err) {
    next(err);
  }
});

router.post('/plan/from-dispatcher/:dispatcherId', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { plan } = await builder.createPlan(req.params.dispatcherId, actorId);
    res.status(201).json({ plan });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('NOT_FINALIZED') || err.message.includes('NOT_APPROVED') || err.message.includes('VIOLATION')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/plan/:planId/evaluate', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const overrides = req.body.overrides || {};
    const result = await evaluator.evaluatePlan(req.params.planId, overrides, actorId);
    res.json({ success: true, result });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/plan/:planId/decision', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { result, rationale } = req.body;
    const { plan } = await decisionSvc.recordDecision(req.params.planId, result, rationale, actorId);
    res.json({ plan });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('INVALID') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/plan/:planId/finalize', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { plan } = await decisionSvc.finalizePlan(req.params.planId, actorId);
    res.json({ plan });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('NOT_COMPLETED') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
