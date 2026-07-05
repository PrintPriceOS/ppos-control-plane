'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationLockBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationLockEvaluatorService').serviceInstance;
const evidenceSvc = require('../services/cohortInterventionExecutionPlanActivationLockEvidencePackService').serviceInstance;
const decisionSvc = require('../services/cohortInterventionExecutionPlanActivationLockDecisionService').serviceInstance;
const auditSvc = require('../services/cohortInterventionExecutionPlanActivationLockAuditService').serviceInstance;

router.get('/lock', async (req, res, next) => {
  try {
    const list = await builder.listLock();
    res.json({ lockList: list });
  } catch (err) {
    next(err);
  }
});

router.get('/lock/:activationLockId', async (req, res, next) => {
  try {
    const record = await builder.getLock(req.params.activationLockId);
    if (!record) {
      return res.status(404).json({ error: 'LOCK_RECORD_NOT_FOUND' });
    }
    const rules = await builder.getRules(req.params.activationLockId);
    const evidence = await evidenceSvc.getEvidence(req.params.activationLockId);
    const auditLogs = await auditSvc.getAuditLogs(req.params.activationLockId);
    res.json({ lock: record, rules, evidence, auditLogs });
  } catch (err) {
    next(err);
  }
});

router.post('/lock/from-authorization/:activationAuthId', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { lock } = await builder.createLock(req.params.activationAuthId, actorId);
    res.status(201).json({ lock });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('NOT_FINALIZED') || err.message.includes('NOT_APPROVED') || err.message.includes('VIOLATION')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/lock/:activationLockId/evaluate', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const overrides = req.body.overrides || {};
    const result = await evaluator.evaluateLock(req.params.activationLockId, overrides, actorId);
    res.json({ success: true, result });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/lock/:activationLockId/decision', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { result, rationale } = req.body;
    const { lock } = await decisionSvc.recordDecision(req.params.activationLockId, result, rationale, actorId);
    res.json({ lock });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('INVALID') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/lock/:activationLockId/finalize', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { lock } = await decisionSvc.finalizeLock(req.params.activationLockId, actorId);
    res.json({ lock });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('NOT_COMPLETED') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
