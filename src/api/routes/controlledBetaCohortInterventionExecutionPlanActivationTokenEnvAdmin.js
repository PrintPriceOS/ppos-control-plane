'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationTokenEnvBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenEnvEvaluatorService').serviceInstance;
const evidenceSvc = require('../services/cohortInterventionExecutionPlanActivationTokenEnvEvidencePackService').serviceInstance;
const decisionSvc = require('../services/cohortInterventionExecutionPlanActivationTokenEnvDecisionService').serviceInstance;
const auditSvc = require('../services/cohortInterventionExecutionPlanActivationTokenEnvAuditService').serviceInstance;

router.get('/env', async (req, res, next) => {
  try {
    const list = await builder.listTokenEnv();
    res.json({ envList: list });
  } catch (err) {
    next(err);
  }
});

router.get('/env/:activationTokenEnvId', async (req, res, next) => {
  try {
    const record = await builder.getTokenEnv(req.params.activationTokenEnvId);
    if (!record) {
      return res.status(404).json({ error: 'TOKEN_ENV_RECORD_NOT_FOUND' });
    }
    const rules = await builder.getRules(req.params.activationTokenEnvId);
    const evidence = await evidenceSvc.getEvidence(req.params.activationTokenEnvId);
    const auditLogs = await auditSvc.getAuditLogs(req.params.activationTokenEnvId);
    res.json({ tokenEnv: record, rules, evidence, auditLogs });
  } catch (err) {
    next(err);
  }
});

router.post('/env/from-token-auth/:activationTokenAuthId', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { tokenEnv } = await builder.createTokenEnv(req.params.activationTokenAuthId, actorId);
    res.status(201).json({ tokenEnv });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('NOT_FINALIZED') || err.message.includes('NOT_APPROVED') || err.message.includes('VIOLATION')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/env/:activationTokenEnvId/evaluate', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const overrides = req.body.overrides || {};
    const result = await evaluator.evaluateTokenEnv(req.params.activationTokenEnvId, overrides, actorId);
    res.json({ success: true, result });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/env/:activationTokenEnvId/decision', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { result, rationale } = req.body;
    const { tokenEnv } = await decisionSvc.recordDecision(req.params.activationTokenEnvId, result, rationale, actorId);
    res.json({ tokenEnv });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('INVALID') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/env/:activationTokenEnvId/finalize', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { tokenEnv } = await decisionSvc.finalizeTokenEnv(req.params.activationTokenEnvId, actorId);
    res.json({ tokenEnv });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('NOT_COMPLETED') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
