'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionAuthorizationBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionAuthorizationEvaluatorService').serviceInstance;
const evidenceSvc = require('../services/cohortInterventionExecutionAuthorizationEvidencePackService').serviceInstance;
const decisionSvc = require('../services/cohortInterventionExecutionAuthorizationDecisionService').serviceInstance;
const auditSvc = require('../services/cohortInterventionExecutionAuthorizationAuditService').serviceInstance;

router.get('/auth', async (req, res, next) => {
  try {
    const list = await builder.listAuth();
    res.json({ authList: list });
  } catch (err) {
    next(err);
  }
});

router.get('/auth/:authId', async (req, res, next) => {
  try {
    const record = await builder.getAuth(req.params.authId);
    if (!record) {
      return res.status(404).json({ error: 'AUTHORIZATION_RECORD_NOT_FOUND' });
    }
    const rules = await builder.getRules(req.params.authId);
    const evidence = await evidenceSvc.getEvidence(req.params.authId);
    const auditLogs = await auditSvc.getAuditLogs(req.params.authId);
    res.json({ auth: record, rules, evidence, auditLogs });
  } catch (err) {
    next(err);
  }
});

router.post('/auth/from-readiness/:readinessId', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { auth } = await builder.createAuth(req.params.readinessId, actorId);
    res.status(201).json({ auth });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('NOT_FINALIZED') || err.message.includes('NOT_APPROVED') || err.message.includes('VIOLATION')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/auth/:authId/evaluate', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const overrides = req.body.overrides || {};
    const result = await evaluator.evaluateAuth(req.params.authId, overrides, actorId);
    res.json({ success: true, result });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/auth/:authId/decision', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { decision, rationale } = req.body;
    const { auth } = await decisionSvc.recordDecision(req.params.authId, decision, rationale, actorId);
    res.json({ auth });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('INVALID') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/auth/:authId/finalize', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { auth } = await decisionSvc.finalizeAuth(req.params.authId, actorId);
    res.json({ auth });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('NOT_COMPLETED') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
