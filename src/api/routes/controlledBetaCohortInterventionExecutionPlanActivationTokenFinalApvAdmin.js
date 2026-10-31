'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationTokenFinalApvBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenFinalApvEvaluatorService').serviceInstance;
const decision = require('../services/cohortInterventionExecutionPlanActivationTokenFinalApvDecisionService').serviceInstance;
const evidencePack = require('../services/cohortInterventionExecutionPlanActivationTokenFinalApvEvidencePackService').serviceInstance;
const audit = require('../services/cohortInterventionExecutionPlanActivationTokenFinalApvAuditService').serviceInstance;

// GET /apv
router.get('/apv', async (req, res, next) => {
  try {
    const list = await builder.listTokenFinalApv();
    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
});

// GET /apv/:activationTokenFinalApvId
router.get('/apv/:activationTokenFinalApvId', async (req, res, next) => {
  try {
    const record = await builder.getTokenFinalApv(req.params.activationTokenFinalApvId);
    if (!record) {
      return res.status(404).json({ success: false, error: 'TOKEN_FINAL_APV_RECORD_NOT_FOUND' });
    }
    const rules = await builder.getRules(req.params.activationTokenFinalApvId);
    const audits = await audit.getAuditLogs(req.params.activationTokenFinalApvId);
    const evidence = await evidencePack.getEvidence(req.params.activationTokenFinalApvId);

    res.json({
      success: true,
      data: {
        record,
        rules,
        audits,
        evidence
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /apv/from-token-env/:activationTokenEnvId
router.post('/apv/from-token-env/:activationTokenEnvId', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.email || req.user.username || 'admin' : 'admin';
    const { tokenFinalApv } = await builder.createTokenFinalApv(req.params.activationTokenEnvId, actorId);
    res.json({ success: true, data: tokenFinalApv });
  } catch (err) {
    next(err);
  }
});

// POST /apv/:activationTokenFinalApvId/evaluate
router.post('/apv/:activationTokenFinalApvId/evaluate', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.email || req.user.username || 'admin' : 'admin';
    const overrides = req.body.overrides || {};
    const result = await evaluator.evaluateTokenFinalApv(req.params.activationTokenFinalApvId, overrides, actorId);
    res.json({ success: true, evaluation: result });
  } catch (err) {
    next(err);
  }
});

// POST /apv/:activationTokenFinalApvId/decision
router.post('/apv/:activationTokenFinalApvId/decision', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.email || req.user.username || 'admin' : 'admin';
    const { result, rationale } = req.body;
    const outcome = await decision.recordDecision(req.params.activationTokenFinalApvId, result, rationale, actorId);
    res.json({ success: true, data: outcome.tokenFinalApv });
  } catch (err) {
    next(err);
  }
});

// POST /apv/:activationTokenFinalApvId/finalize
router.post('/apv/:activationTokenFinalApvId/finalize', async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.email || req.user.username || 'admin' : 'admin';
    const outcome = await decision.finalizeTokenFinalApv(req.params.activationTokenFinalApvId, actorId);
    res.json({ success: true, data: outcome.tokenFinalApv });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
