'use strict';

const express = require('express');
const router = express.Router();

const builder = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeEvaluatorService').serviceInstance;
const decision = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeDecisionService').serviceInstance;

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
    write_scope: 'PHASE_170_TABLES_ONLY'
  });
};

router.get('/unlock-pre-execution-freeze', async (req, res) => {
  try {
    const list = await builder.listTokenRedemptionUnlockPreExecutionFreezes();
    sendSafetyResponse(res, 200, { success: true, list });
  } catch (err) {
    sendSafetyResponse(res, 500, { success: false, error: err.message });
  }
});

router.get('/unlock-pre-execution-freeze/:unlockPreExecutionFreezeId', async (req, res) => {
  try {
    const record = await builder.getTokenRedemptionUnlockPreExecutionFreeze(req.params.unlockPreExecutionFreezeId);
    if (!record) {
      return sendSafetyResponse(res, 404, { success: false, error: 'UNLOCK_PRE_EXECUTION_FREEZE_RECORD_NOT_FOUND' });
    }
    const rules = await builder.getRules(req.params.unlockPreExecutionFreezeId);
    sendSafetyResponse(res, 200, { success: true, tokenRedemptionUnlockPreExecutionFreeze: record, rules });
  } catch (err) {
    sendSafetyResponse(res, 500, { success: false, error: err.message });
  }
});

router.post('/unlock-pre-execution-freeze/from-unlock-seal/:unlockSealId', async (req, res) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await builder.createTokenRedemptionUnlockPreExecutionFreezeDraft(req.params.unlockSealId, actorId);
    sendSafetyResponse(res, 201, { success: true, ...result });
  } catch (err) {
    const status = err.message.includes('NOT_FOUND') ? 404 : 400;
    sendSafetyResponse(res, status, { success: false, error: err.message });
  }
});

router.post('/unlock-pre-execution-freeze/:unlockPreExecutionFreezeId/evaluate', async (req, res) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const confirmations = req.body.confirmations || {};
    const result = await evaluator.evaluateUnlockPreExecutionFreeze(req.params.unlockPreExecutionFreezeId, confirmations, actorId);
    sendSafetyResponse(res, 200, { success: true, ...result });
  } catch (err) {
    sendSafetyResponse(res, 400, { success: false, error: err.message });
  }
});

router.post('/unlock-pre-execution-freeze/:unlockPreExecutionFreezeId/decision', async (req, res) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const { decision: decisionVal, rationale } = req.body;
    const result = await decision.recordDecision(req.params.unlockPreExecutionFreezeId, decisionVal, rationale, actorId);
    sendSafetyResponse(res, 200, { success: true, tokenRedemptionUnlockPreExecutionFreeze: result });
  } catch (err) {
    sendSafetyResponse(res, 400, { success: false, error: err.message });
  }
});

router.post('/unlock-pre-execution-freeze/:unlockPreExecutionFreezeId/finalize', async (req, res) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await decision.finalizeUnlockPreExecutionFreeze(req.params.unlockPreExecutionFreezeId, actorId);
    sendSafetyResponse(res, 200, { success: true, tokenRedemptionUnlockPreExecutionFreeze: result });
  } catch (err) {
    sendSafetyResponse(res, 400, { success: false, error: err.message });
  }
});

module.exports = router;
