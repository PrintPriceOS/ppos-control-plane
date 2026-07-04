'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionDispatcherBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionDispatcherEvaluatorService').serviceInstance;
const evidenceSvc = require('../services/cohortInterventionExecutionDispatcherEvidencePackService').serviceInstance;
const decisionSvc = require('../services/cohortInterventionExecutionDispatcherDecisionService').serviceInstance;
const auditSvc = require('../services/cohortInterventionExecutionDispatcherAuditService').serviceInstance;

router.get('/dispatcher', async (req, res, next) => {
  try {
    const list = await builder.listDispatcher();
    res.json({ dispatcherList: list });
  } catch (err) {
    next(err);
  }
});

router.get('/dispatcher/:dispatcherId', async (req, res, next) => {
  try {
    const record = await builder.getDispatcher(req.params.dispatcherId);
    if (!record) {
      return res.status(404).json({ error: 'DISPATCHER_RECORD_NOT_FOUND' });
    }
    const rules = await builder.getRules(req.params.dispatcherId);
    const evidence = await evidenceSvc.getEvidence(req.params.dispatcherId);
    const auditLogs = await auditSvc.getAuditLogs(req.params.dispatcherId);
    res.json({ dispatcher: record, rules, evidence, auditLogs });
  } catch (err) {
    next(err);
  }
});

router.post('/dispatcher/from-envelope/:envelopeId', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { dispatcher } = await builder.createDispatcher(req.params.envelopeId, actorId);
    res.status(201).json({ dispatcher });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('NOT_FINALIZED') || err.message.includes('NOT_APPROVED') || err.message.includes('VIOLATION')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/dispatcher/:dispatcherId/evaluate', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const overrides = req.body.overrides || {};
    const result = await evaluator.evaluateDispatcher(req.params.dispatcherId, overrides, actorId);
    res.json({ success: true, result });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/dispatcher/:dispatcherId/decision', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { result, rationale } = req.body;
    const { dispatcher } = await decisionSvc.recordDecision(req.params.dispatcherId, result, rationale, actorId);
    res.json({ dispatcher });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('INVALID') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/dispatcher/:dispatcherId/finalize', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { dispatcher } = await decisionSvc.finalizeDispatcher(req.params.dispatcherId, actorId);
    res.json({ dispatcher });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('NOT_COMPLETED') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
