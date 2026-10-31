'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationAuthorizationBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationAuthorizationEvaluatorService').serviceInstance;
const evidenceSvc = require('../services/cohortInterventionExecutionPlanActivationAuthorizationEvidencePackService').serviceInstance;
const decisionSvc = require('../services/cohortInterventionExecutionPlanActivationAuthorizationDecisionService').serviceInstance;
const auditSvc = require('../services/cohortInterventionExecutionPlanActivationAuthorizationAuditService').serviceInstance;

router.get('/authorization', async (req, res, next) => {
  try {
    const list = await builder.listAuthorization();
    res.json({ authorizationList: list });
  } catch (err) {
    next(err);
  }
});

router.get('/authorization/:activationAuthId', async (req, res, next) => {
  try {
    const record = await builder.getAuthorization(req.params.activationAuthId);
    if (!record) {
      return res.status(404).json({ error: 'AUTHORIZATION_RECORD_NOT_FOUND' });
    }
    const rules = await builder.getRules(req.params.activationAuthId);
    const evidence = await evidenceSvc.getEvidence(req.params.activationAuthId);
    const auditLogs = await auditSvc.getAuditLogs(req.params.activationAuthId);
    res.json({ authorization: record, rules, evidence, auditLogs });
  } catch (err) {
    next(err);
  }
});

router.post('/authorization/from-readiness/:activationRdId', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { authorization } = await builder.createAuthorization(req.params.activationRdId, actorId);
    res.status(201).json({ authorization });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('NOT_FINALIZED') || err.message.includes('NOT_APPROVED') || err.message.includes('VIOLATION')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/authorization/:activationAuthId/evaluate', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const overrides = req.body.overrides || {};
    const result = await evaluator.evaluateAuthorization(req.params.activationAuthId, overrides, actorId);
    res.json({ success: true, result });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/authorization/:activationAuthId/decision', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { result, rationale } = req.body;
    const { authorization } = await decisionSvc.recordDecision(req.params.activationAuthId, result, rationale, actorId);
    res.json({ authorization });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('INVALID') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/authorization/:activationAuthId/finalize', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { authorization } = await decisionSvc.finalizeAuthorization(req.params.activationAuthId, actorId);
    res.json({ authorization });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('NOT_COMPLETED') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
