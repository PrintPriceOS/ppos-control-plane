'use strict';

const express = require('express');
const router = express.Router();

const builder = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalEvaluatorService').serviceInstance;
const decision = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalDecisionService').serviceInstance;

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
    runtime_mutations: 0
  });
};

router.get('/unlock-approval', async (req, res) => {
  try {
    const list = await builder.listTokenRedemptionUnlockApprovals();
    sendSafetyResponse(res, 200, { success: true, list });
  } catch (err) {
    sendSafetyResponse(res, 500, { success: false, error: err.message });
  }
});

router.get('/unlock-approval/:unlockApprovalId', async (req, res) => {
  try {
    const record = await builder.getTokenRedemptionUnlockApproval(req.params.unlockApprovalId);
    if (!record) {
      return sendSafetyResponse(res, 404, { success: false, error: 'UNLOCK_APPROVAL_RECORD_NOT_FOUND' });
    }
    const rules = await builder.getRules(req.params.unlockApprovalId);
    sendSafetyResponse(res, 200, { success: true, tokenRedemptionUnlockApproval: record, rules });
  } catch (err) {
    sendSafetyResponse(res, 500, { success: false, error: err.message });
  }
});

router.post('/unlock-approval/from-unlock-eligibility/:unlockEligibilityId', async (req, res) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await builder.createTokenRedemptionUnlockApprovalDraft(req.params.unlockEligibilityId, actorId);
    sendSafetyResponse(res, 201, { success: true, ...result });
  } catch (err) {
    const status = err.message.includes('NOT_FOUND') ? 404 : 400;
    sendSafetyResponse(res, status, { success: false, error: err.message });
  }
});

router.post('/unlock-approval/:unlockApprovalId/evaluate', async (req, res) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const confirmations = req.body.confirmations || {};
    const result = await evaluator.evaluateUnlockApproval(req.params.unlockApprovalId, confirmations, actorId);
    sendSafetyResponse(res, 200, { success: true, ...result });
  } catch (err) {
    sendSafetyResponse(res, 400, { success: false, error: err.message });
  }
});

router.post('/unlock-approval/:unlockApprovalId/decision', async (req, res) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const { decision: decisionVal, rationale } = req.body;
    const result = await decision.recordDecision(req.params.unlockApprovalId, decisionVal, rationale, actorId);
    sendSafetyResponse(res, 200, { success: true, tokenRedemptionUnlockApproval: result });
  } catch (err) {
    sendSafetyResponse(res, 400, { success: false, error: err.message });
  }
});

router.post('/unlock-approval/:unlockApprovalId/finalize', async (req, res) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await decision.finalizeUnlockApproval(req.params.unlockApprovalId, actorId);
    sendSafetyResponse(res, 200, { success: true, tokenRedemptionUnlockApproval: result });
  } catch (err) {
    sendSafetyResponse(res, 400, { success: false, error: err.message });
  }
});

module.exports = router;
