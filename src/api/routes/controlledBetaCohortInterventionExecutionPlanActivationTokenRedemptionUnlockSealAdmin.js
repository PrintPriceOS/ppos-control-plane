'use strict';

const express = require('express');
const router = express.Router();

const builder = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealEvaluatorService').serviceInstance;
const decision = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealDecisionService').serviceInstance;

const SAFETY_HEADERS = {
  'X-Safety-Boundary-Activation-Execution': 'NOT_ENABLED',
  'X-Safety-Boundary-Token-Unlock': 'NOT_UNLOCKED',
  'X-Safety-Boundary-Token-Redeemable': 'NOT_REDEEMABLE',
  'X-Safety-Boundary-Runtime-Mutations': 'ZERO'
};

const sendSafetyResponse = (res, status, payload) => {
  res.set(SAFETY_HEADERS);
  res.status(status).json({
    ...payload,
    execution_enabled: false,
    token_unlocked: false,
    token_redeemed: false,
    token_redeemable: false,
    runtime_mutations: 0,
    write_scope: 'PHASE_169_TABLES_ONLY'
  });
};

router.get('/unlock-seal', async (req, res) => {
  try {
    const list = await builder.listTokenRedemptionUnlockSeals();
    sendSafetyResponse(res, 200, { success: true, list });
  } catch (err) {
    sendSafetyResponse(res, 500, { success: false, error: err.message });
  }
});

router.get('/unlock-seal/:unlockSealId', async (req, res) => {
  try {
    const record = await builder.getTokenRedemptionUnlockSeal(req.params.unlockSealId);
    if (!record) {
      return sendSafetyResponse(res, 404, { success: false, error: 'UNLOCK_SEAL_RECORD_NOT_FOUND' });
    }
    const rules = await builder.getRules(req.params.unlockSealId);
    sendSafetyResponse(res, 200, { success: true, tokenRedemptionUnlockSeal: record, rules });
  } catch (err) {
    sendSafetyResponse(res, 500, { success: false, error: err.message });
  }
});

router.post('/unlock-seal/from-unlock-final-review/:unlockFinalReviewId', async (req, res) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await builder.createTokenRedemptionUnlockSealDraft(req.params.unlockFinalReviewId, actorId);
    sendSafetyResponse(res, 201, { success: true, ...result });
  } catch (err) {
    const status = err.message.includes('NOT_FOUND') ? 404 : 400;
    sendSafetyResponse(res, status, { success: false, error: err.message });
  }
});

router.post('/unlock-seal/:unlockSealId/evaluate', async (req, res) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const confirmations = req.body.confirmations || {};
    const result = await evaluator.evaluateUnlockSeal(req.params.unlockSealId, confirmations, actorId);
    sendSafetyResponse(res, 200, { success: true, ...result });
  } catch (err) {
    sendSafetyResponse(res, 400, { success: false, error: err.message });
  }
});

router.post('/unlock-seal/:unlockSealId/decision', async (req, res) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const { decision: decisionVal, rationale } = req.body;
    const result = await decision.recordDecision(req.params.unlockSealId, decisionVal, rationale, actorId);
    sendSafetyResponse(res, 200, { success: true, tokenRedemptionUnlockSeal: result });
  } catch (err) {
    sendSafetyResponse(res, 400, { success: false, error: err.message });
  }
});

router.post('/unlock-seal/:unlockSealId/finalize', async (req, res) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await decision.finalizeUnlockSeal(req.params.unlockSealId, actorId);
    sendSafetyResponse(res, 200, { success: true, tokenRedemptionUnlockSeal: result });
  } catch (err) {
    sendSafetyResponse(res, 400, { success: false, error: err.message });
  }
});

module.exports = router;
