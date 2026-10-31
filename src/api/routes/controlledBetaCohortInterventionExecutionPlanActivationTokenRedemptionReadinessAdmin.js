'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionReadinessBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionReadinessEvaluatorService').serviceInstance;
const decisionSvc = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionReadinessDecisionService').serviceInstance;

// Get all redemption readiness records
router.get('/readiness', async (req, res, next) => {
  try {
    const list = await builder.listTokenRedemptionReadinesses();
    res.json(list);
  } catch (err) { next(err); }
});

// Get detailed record with rules
router.get('/readiness/:activationTokenRedemptionReadinessId', async (req, res, next) => {
  try {
    const record = await builder.getTokenRedemptionReadiness(req.params.activationTokenRedemptionReadinessId);
    if (!record) return res.status(404).json({ error: 'TOKEN_REDEMPTION_READINESS_RECORD_NOT_FOUND' });
    const rules = await builder.getRules(req.params.activationTokenRedemptionReadinessId);
    res.json({ tokenRedemptionReadiness: record, rules });
  } catch (err) { next(err); }
});

// Create draft from Phase 160 issuance
router.post('/readiness/from-issuance/:activationTokenIssuanceId', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await builder.createTokenRedemptionReadinessDraft(req.params.activationTokenIssuanceId, actorId);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// Evaluate rules
router.post('/readiness/:activationTokenRedemptionReadinessId/evaluate', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const { signatures } = req.body;
    const result = await evaluator.evaluateTokenRedemptionReadiness(req.params.activationTokenRedemptionReadinessId, signatures, actorId);
    res.json(result);
  } catch (err) { next(err); }
});

// Record decision
router.post('/readiness/:activationTokenRedemptionReadinessId/decision', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const { decision, rationale } = req.body;
    const result = await decisionSvc.recordDecision(req.params.activationTokenRedemptionReadinessId, decision, rationale, actorId);
    res.json(result);
  } catch (err) { next(err); }
});

// Finalize and lock
router.post('/readiness/:activationTokenRedemptionReadinessId/finalize', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await decisionSvc.finalizeRedemptionReadiness(req.params.activationTokenRedemptionReadinessId, actorId);
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
