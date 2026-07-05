'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationTokenAuthBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenAuthEvaluatorService').serviceInstance;
const evidenceSvc = require('../services/cohortInterventionExecutionPlanActivationTokenAuthEvidencePackService').serviceInstance;
const decisionSvc = require('../services/cohortInterventionExecutionPlanActivationTokenAuthDecisionService').serviceInstance;
const auditSvc = require('../services/cohortInterventionExecutionPlanActivationTokenAuthAuditService').serviceInstance;

router.get('/auth', async (req, res, next) => {
  try {
    const list = await builder.listTokenAuth();
    res.json({ authList: list });
  } catch (err) {
    next(err);
  }
});

router.get('/auth/:activationTokenAuthId', async (req, res, next) => {
  try {
    const record = await builder.getTokenAuth(req.params.activationTokenAuthId);
    if (!record) {
      return res.status(404).json({ error: 'TOKEN_AUTH_RECORD_NOT_FOUND' });
    }
    const rules = await builder.getRules(req.params.activationTokenAuthId);
    const evidence = await evidenceSvc.getEvidence(req.params.activationTokenAuthId);
    const auditLogs = await auditSvc.getAuditLogs(req.params.activationTokenAuthId);
    res.json({ tokenAuth: record, rules, evidence, auditLogs });
  } catch (err) {
    next(err);
  }
});

router.post('/auth/from-handoff/:activationHandoffId', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { tokenAuth } = await builder.createTokenAuth(req.params.activationHandoffId, actorId);
    res.status(201).json({ tokenAuth });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('NOT_FINALIZED') || err.message.includes('NOT_APPROVED') || err.message.includes('VIOLATION')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/auth/:activationTokenAuthId/evaluate', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const overrides = req.body.overrides || {};
    const result = await evaluator.evaluateTokenAuth(req.params.activationTokenAuthId, overrides, actorId);
    res.json({ success: true, result });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/auth/:activationTokenAuthId/decision', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { result, rationale } = req.body;
    const { tokenAuth } = await decisionSvc.recordDecision(req.params.activationTokenAuthId, result, rationale, actorId);
    res.json({ tokenAuth });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('INVALID') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/auth/:activationTokenAuthId/finalize', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { tokenAuth } = await decisionSvc.finalizeTokenAuth(req.params.activationTokenAuthId, actorId);
    res.json({ tokenAuth });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('NOT_COMPLETED') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
