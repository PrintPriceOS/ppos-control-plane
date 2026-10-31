'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationTokenIssuanceBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenIssuanceEvaluatorService').serviceInstance;
const decisionSvc = require('../services/cohortInterventionExecutionPlanActivationTokenIssuanceDecisionService').serviceInstance;

// Get all issuance records
router.get('/issuance', async (req, res, next) => {
  try {
    const list = await builder.listTokenIssuances();
    res.json(list);
  } catch (err) { next(err); }
});

// Get detailed issuance record with rules
router.get('/issuance/:activationTokenIssuanceId', async (req, res, next) => {
  try {
    const record = await builder.getTokenIssuance(req.params.activationTokenIssuanceId);
    if (!record) return res.status(404).json({ error: 'TOKEN_ISSUANCE_RECORD_NOT_FOUND' });
    const rules = await builder.getRules(req.params.activationTokenIssuanceId);
    res.json({ tokenIssuance: record, rules });
  } catch (err) { next(err); }
});

// Create draft from Phase 159 preflight
router.post('/issuance/from-preflight/:activationTokenPreflightId', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await builder.createTokenIssuanceDraft(req.params.activationTokenPreflightId, actorId);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// Evaluate issuance rules
router.post('/issuance/:activationTokenIssuanceId/evaluate', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const { signatures } = req.body;
    const result = await evaluator.evaluateTokenIssuance(req.params.activationTokenIssuanceId, signatures, actorId);
    res.json(result);
  } catch (err) { next(err); }
});

// Record issuance decision
router.post('/issuance/:activationTokenIssuanceId/decision', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const { decision, rationale } = req.body;
    const result = await decisionSvc.recordDecision(req.params.activationTokenIssuanceId, decision, rationale, actorId);
    res.json(result);
  } catch (err) { next(err); }
});

// Finalize and lock issuance record
router.post('/issuance/:activationTokenIssuanceId/finalize', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await decisionSvc.finalizeIssuance(req.params.activationTokenIssuanceId, actorId);
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
