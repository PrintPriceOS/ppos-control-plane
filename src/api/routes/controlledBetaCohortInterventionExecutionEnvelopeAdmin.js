'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionEnvelopeBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionEnvelopeEvaluatorService').serviceInstance;
const evidenceSvc = require('../services/cohortInterventionExecutionEnvelopeEvidencePackService').serviceInstance;
const decisionSvc = require('../services/cohortInterventionExecutionEnvelopeDecisionService').serviceInstance;
const auditSvc = require('../services/cohortInterventionExecutionEnvelopeAuditService').serviceInstance;

router.get('/envelope', async (req, res, next) => {
  try {
    const list = await builder.listEnvelope();
    res.json({ envelopeList: list });
  } catch (err) {
    next(err);
  }
});

router.get('/envelope/:envelopeId', async (req, res, next) => {
  try {
    const record = await builder.getEnvelope(req.params.envelopeId);
    if (!record) {
      return res.status(404).json({ error: 'ENVELOPE_RECORD_NOT_FOUND' });
    }
    const rules = await builder.getRules(req.params.envelopeId);
    const evidence = await evidenceSvc.getEvidence(req.params.envelopeId);
    const auditLogs = await auditSvc.getAuditLogs(req.params.envelopeId);
    res.json({ envelope: record, rules, evidence, auditLogs });
  } catch (err) {
    next(err);
  }
});

router.post('/envelope/from-auth/:authId', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { envelope } = await builder.createEnvelope(req.params.authId, actorId);
    res.status(201).json({ envelope });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('NOT_FINALIZED') || err.message.includes('NOT_APPROVED') || err.message.includes('VIOLATION')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/envelope/:envelopeId/evaluate', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const overrides = req.body.overrides || {};
    const result = await evaluator.evaluateEnvelope(req.params.envelopeId, overrides, actorId);
    res.json({ success: true, result });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/envelope/:envelopeId/decision', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { result, rationale } = req.body;
    const { envelope } = await decisionSvc.recordDecision(req.params.envelopeId, result, rationale, actorId);
    res.json({ envelope });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('INVALID') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/envelope/:envelopeId/finalize', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id || req.user.username || 'admin' : 'admin';
    const { envelope } = await decisionSvc.finalizeEnvelope(req.params.envelopeId, actorId);
    res.json({ envelope });
  } catch (err) {
    if (err.message.includes('NOT_FOUND') || err.message.includes('FINALIZED') || err.message.includes('NOT_COMPLETED') || err.message.includes('REQUIRED')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
