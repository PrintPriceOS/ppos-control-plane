'use strict';

const express = require('express');
const router = express.Router();

const builder = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessEvaluatorService').serviceInstance;
const decision = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessDecisionService').serviceInstance;

// GET /
router.get('/', async (req, res, next) => {
  try {
    const list = await builder.getUnlockComplianceWitnessList();
    res.json(list);
  } catch (err) {
    next(err);
  }
});

// GET /:unlockComplianceWitnessId
router.get('/:unlockComplianceWitnessId', async (req, res, next) => {
  try {
    const record = await builder.getTokenRedemptionUnlockComplianceWitness(req.params.unlockComplianceWitnessId);
    if (!record) {
      return res.status(404).json({ error: 'Compliance witness record not found' });
    }
    const rules = await builder.getRules(req.params.unlockComplianceWitnessId);
    res.json({ tokenRedemptionUnlockComplianceWitness: record, rules });
  } catch (err) {
    next(err);
  }
});

// POST /from-unlock-final-human-authorization-seal/:unlockFinalHumanAuthorizationSealId
router.post('/from-unlock-final-human-authorization-seal/:unlockFinalHumanAuthorizationSealId', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await builder.createTokenRedemptionUnlockComplianceWitnessDraft(req.params.unlockFinalHumanAuthorizationSealId, actorId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /:unlockComplianceWitnessId/evaluate
router.post('/:unlockComplianceWitnessId/evaluate', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await evaluator.evaluateUnlockComplianceWitness(req.params.unlockComplianceWitnessId, req.body.confirmations, actorId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /:unlockComplianceWitnessId/decision
router.post('/:unlockComplianceWitnessId/decision', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await decision.recordDecision(req.params.unlockComplianceWitnessId, req.body, actorId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /:unlockComplianceWitnessId/finalize
router.post('/:unlockComplianceWitnessId/finalize', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await decision.finalizeUnlockComplianceWitness(req.params.unlockComplianceWitnessId, actorId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
