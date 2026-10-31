'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationEvaluatorService').serviceInstance;
const decisionSvc = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationDecisionService').serviceInstance;

// Get all redemption auth records
router.get('/authorization', async (req, res, next) => {
  try {
    const list = await builder.listTokenRedemptionAuths();
    res.json(list);
  } catch (err) { next(err); }
});

// Get detailed record with rules
router.get('/authorization/:activationTokenRedemptionAuthId', async (req, res, next) => {
  try {
    const record = await builder.getTokenRedemptionAuth(req.params.activationTokenRedemptionAuthId);
    if (!record) return res.status(404).json({ error: 'TOKEN_REDEMPTION_AUTH_RECORD_NOT_FOUND' });
    const rules = await builder.getRules(req.params.activationTokenRedemptionAuthId);
    res.json({ tokenRedemptionAuth: record, rules });
  } catch (err) { next(err); }
});

// Create draft from Phase 161 readiness
router.post('/authorization/from-readiness/:activationTokenRedemptionReadinessId', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await builder.createTokenRedemptionAuthDraft(req.params.activationTokenRedemptionReadinessId, actorId);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// Evaluate rules
router.post('/authorization/:activationTokenRedemptionAuthId/evaluate', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const { signatures } = req.body;
    const result = await evaluator.evaluateTokenRedemptionAuth(req.params.activationTokenRedemptionAuthId, signatures, actorId);
    res.json(result);
  } catch (err) { next(err); }
});

// Record decision
router.post('/authorization/:activationTokenRedemptionAuthId/decision', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const { decision, rationale } = req.body;
    const result = await decisionSvc.recordDecision(req.params.activationTokenRedemptionAuthId, decision, rationale, actorId);
    res.json(result);
  } catch (err) { next(err); }
});

// Finalize and lock
router.post('/authorization/:activationTokenRedemptionAuthId/finalize', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await decisionSvc.finalizeRedemptionAuth(req.params.activationTokenRedemptionAuthId, actorId);
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
