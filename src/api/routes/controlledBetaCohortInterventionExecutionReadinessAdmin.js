'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionReadinessBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionReadinessEvaluatorService').serviceInstance;
const evidenceSvc = require('../services/cohortInterventionExecutionReadinessEvidencePackService').serviceInstance;
const decisionSvc = require('../services/cohortInterventionExecutionReadinessDecisionService').serviceInstance;
const auditSvc = require('../services/cohortInterventionExecutionReadinessAuditService').serviceInstance;

router.get('/readiness', async (req, res, next) => {
  try {
    const list = await builder.listReadiness();
    res.json({ readinessList: list });
  } catch (err) {
    next(err);
  }
});

router.get('/readiness/:readinessId', async (req, res, next) => {
  try {
    const record = await builder.getReadiness(req.params.readinessId);
    if (!record) {
      return res.status(404).json({ error: 'READINESS_RECORD_NOT_FOUND' });
    }
    const checks = await builder.getChecks(req.params.readinessId);
    const evidence = await evidenceSvc.getEvidence(req.params.readinessId);
    const auditLogs = await auditSvc.getAuditLogs(req.params.readinessId);
    res.json({ readiness: record, checks, evidence, auditLogs });
  } catch (err) {
    next(err);
  }
});

router.post('/readiness/from-approval/:approvalId', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { readiness } = await builder.createReadiness(req.params.approvalId, actorId);
    res.status(201).json({ readiness });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('NOT_FINALIZED') || err.message.includes('VIOLATION')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/readiness/:readinessId/evaluate', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const overrides = req.body.overrides || {};
    const result = await evaluator.evaluateReadiness(req.params.readinessId, overrides, actorId);
    res.json({ success: true, result });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/readiness/:readinessId/decision', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { decision, rationale } = req.body;
    const { readiness } = await decisionSvc.recordDecision(req.params.readinessId, decision, rationale, actorId);
    res.json({ readiness });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('INVALID') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/readiness/:readinessId/finalize', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { readiness } = await decisionSvc.finalizeReadiness(req.params.readinessId, actorId);
    res.json({ readiness });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('NOT_COMPLETED') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
