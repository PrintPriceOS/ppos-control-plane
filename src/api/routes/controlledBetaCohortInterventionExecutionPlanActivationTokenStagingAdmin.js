'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationTokenStagingBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenStagingEvaluatorService').serviceInstance;
const decisionSvc = require('../services/cohortInterventionExecutionPlanActivationTokenStagingDecisionService').serviceInstance;

// Get all staging records
router.get('/staging', async (req, res, next) => {
  try {
    const list = await builder.listTokenStaging();
    res.json(list);
  } catch (err) {
    next(err);
  }
});

// Get detailed staging record
router.get('/staging/:activationTokenStagingId', async (req, res, next) => {
  try {
    const record = await builder.getTokenStaging(req.params.activationTokenStagingId);
    if (!record) {
      return res.status(404).json({ error: 'TOKEN_STAGING_RECORD_NOT_FOUND' });
    }
    const rules = await builder.getRules(req.params.activationTokenStagingId);
    res.json({ tokenStaging: record, rules });
  } catch (err) {
    next(err);
  }
});

// Create draft from Final Approval
router.post('/staging/from-final-apv/:activationTokenFinalApvId', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await builder.createTokenStagingDraft(req.params.activationTokenFinalApvId, actorId);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Evaluate rules
router.post('/staging/:activationTokenStagingId/evaluate', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const { signatures } = req.body;
    const result = await evaluator.evaluateTokenStaging(req.params.activationTokenStagingId, signatures, actorId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Record staging decision
router.post('/staging/:activationTokenStagingId/decision', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const { decision, rationale } = req.body;
    const result = await decisionSvc.recordDecision(req.params.activationTokenStagingId, decision, rationale, actorId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Finalize and lock staging record
router.post('/staging/:activationTokenStagingId/finalize', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await decisionSvc.finalizeStaging(req.params.activationTokenStagingId, actorId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
