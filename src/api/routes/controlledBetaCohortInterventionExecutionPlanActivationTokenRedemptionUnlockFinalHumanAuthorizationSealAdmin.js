'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealEvaluatorService').serviceInstance;
const decisionSvc = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealDecisionService').serviceInstance;

// GET /
router.get('/', async (req, res, next) => {
  try {
    const list = await builder.listTokenRedemptionUnlockFinalHumanAuthorizationSeals();
    res.json(list);
  } catch (e) {
    next(e);
  }
});

// GET /:unlockFinalHumanAuthorizationSealId
router.get('/:unlockFinalHumanAuthorizationSealId', async (req, res, next) => {
  try {
    const details = await builder.getTokenRedemptionUnlockFinalHumanAuthorizationSeal(req.params.unlockFinalHumanAuthorizationSealId);
    if (!details) return res.status(404).json({ error: 'Not found' });
    const rules = await builder.getRules(req.params.unlockFinalHumanAuthorizationSealId);
    res.json({ tokenRedemptionUnlockFinalHumanAuthorizationSeal: details, rules });
  } catch (e) {
    next(e);
  }
});

// POST /from-unlock-dual-control-authorization/:unlockDualControlAuthorizationId
router.post('/from-unlock-dual-control-authorization/:unlockDualControlAuthorizationId', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const draft = await builder.createTokenRedemptionUnlockFinalHumanAuthorizationSealDraft(req.params.unlockDualControlAuthorizationId, actorId);
    res.status(201).json(draft);
  } catch (e) {
    next(e);
  }
});

// POST /:unlockFinalHumanAuthorizationSealId/evaluate
router.post('/:unlockFinalHumanAuthorizationSealId/evaluate', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await evaluator.evaluateUnlockFinalHumanAuthorizationSeal(req.params.unlockFinalHumanAuthorizationSealId, req.body.confirmations || {}, actorId);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

// POST /:unlockFinalHumanAuthorizationSealId/decision
router.post('/:unlockFinalHumanAuthorizationSealId/decision', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const { final_human_authorizer_id, final_human_authorizer_role, final_human_authorization_seal_reason, decision, rationale } = req.body;

    let record;
    if (final_human_authorizer_id) {
      await decisionSvc.recordFinalHumanAuthorizer(
        req.params.unlockFinalHumanAuthorizationSealId,
        final_human_authorizer_id,
        final_human_authorizer_role,
        final_human_authorization_seal_reason
      );
    }

    if (decision) {
      record = await decisionSvc.recordDecision(req.params.unlockFinalHumanAuthorizationSealId, decision, rationale, actorId);
    } else {
      record = await builder.getTokenRedemptionUnlockFinalHumanAuthorizationSeal(req.params.unlockFinalHumanAuthorizationSealId);
    }

    res.json({ tokenRedemptionUnlockFinalHumanAuthorizationSeal: record });
  } catch (e) {
    next(e);
  }
});

// POST /:unlockFinalHumanAuthorizationSealId/finalize
router.post('/:unlockFinalHumanAuthorizationSealId/finalize', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const finalized = await decisionSvc.finalizeUnlockFinalHumanAuthorizationSeal(req.params.unlockFinalHumanAuthorizationSealId, actorId);
    res.json({ tokenRedemptionUnlockFinalHumanAuthorizationSeal: finalized });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
