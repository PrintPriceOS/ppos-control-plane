'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationTokenPreflightBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenPreflightEvaluatorService').serviceInstance;
const decisionSvc = require('../services/cohortInterventionExecutionPlanActivationTokenPreflightDecisionService').serviceInstance;

// Get all preflight records
router.get('/preflight', async (req, res, next) => {
  try {
    const list = await builder.listTokenPreflights();
    res.json(list);
  } catch (err) { next(err); }
});

// Get detailed preflight record with rules
router.get('/preflight/:activationTokenPreflightId', async (req, res, next) => {
  try {
    const record = await builder.getTokenPreflight(req.params.activationTokenPreflightId);
    if (!record) return res.status(404).json({ error: 'TOKEN_PREFLIGHT_RECORD_NOT_FOUND' });
    const rules = await builder.getRules(req.params.activationTokenPreflightId);
    res.json({ tokenPreflight: record, rules });
  } catch (err) { next(err); }
});

// Create draft from Phase 158 staging
router.post('/preflight/from-staging/:activationTokenStagingId', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await builder.createTokenPreflightDraft(req.params.activationTokenStagingId, actorId);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// Evaluate preflight rules
router.post('/preflight/:activationTokenPreflightId/evaluate', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const { signatures } = req.body;
    const result = await evaluator.evaluateTokenPreflight(req.params.activationTokenPreflightId, signatures, actorId);
    res.json(result);
  } catch (err) { next(err); }
});

// Record preflight decision
router.post('/preflight/:activationTokenPreflightId/decision', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const { decision, rationale } = req.body;
    const result = await decisionSvc.recordDecision(req.params.activationTokenPreflightId, decision, rationale, actorId);
    res.json(result);
  } catch (err) { next(err); }
});

// Finalize and lock preflight record
router.post('/preflight/:activationTokenPreflightId/finalize', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await decisionSvc.finalizePreflight(req.params.activationTokenPreflightId, actorId);
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
