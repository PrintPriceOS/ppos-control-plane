'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeEvaluatorService').serviceInstance;
const decisionSvc = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeDecisionService').serviceInstance;

// Get all redemption envelope records
router.get('/envelope', async (req, res, next) => {
  try {
    const list = await builder.listTokenRedemptionEnvelopes();
    res.json(list);
  } catch (err) { next(err); }
});

// Get detailed record with rules
router.get('/envelope/:activationTokenRedemptionEnvelopeId', async (req, res, next) => {
  try {
    const record = await builder.getTokenRedemptionEnvelope(req.params.activationTokenRedemptionEnvelopeId);
    if (!record) return res.status(404).json({ error: 'TOKEN_REDEMPTION_ENVELOPE_RECORD_NOT_FOUND' });
    const rules = await builder.getRules(req.params.activationTokenRedemptionEnvelopeId);
    res.json({ tokenRedemptionEnvelope: record, rules });
  } catch (err) { next(err); }
});

// Create draft from Phase 162 auth
router.post('/envelope/from-auth/:activationTokenRedemptionAuthId', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await builder.createTokenRedemptionEnvelopeDraft(req.params.activationTokenRedemptionAuthId, actorId);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// Evaluate rules
router.post('/envelope/:activationTokenRedemptionEnvelopeId/evaluate', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const { signatures } = req.body;
    const result = await evaluator.evaluateTokenRedemptionEnvelope(req.params.activationTokenRedemptionEnvelopeId, signatures, actorId);
    res.json(result);
  } catch (err) { next(err); }
});

// Record decision
router.post('/envelope/:activationTokenRedemptionEnvelopeId/decision', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const { decision, rationale } = req.body;
    const result = await decisionSvc.recordDecision(req.params.activationTokenRedemptionEnvelopeId, decision, rationale, actorId);
    res.json(result);
  } catch (err) { next(err); }
});

// Finalize and lock
router.post('/envelope/:activationTokenRedemptionEnvelopeId/finalize', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await decisionSvc.finalizeRedemptionEnvelope(req.params.activationTokenRedemptionEnvelopeId, actorId);
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
