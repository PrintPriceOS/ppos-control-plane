'use strict';

const express = require('express');
const router = express.Router();

const builder = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationEvaluatorService').serviceInstance;
const decision = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationDecisionService').serviceInstance;

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
    write_scope: 'PHASE_172_TABLES_ONLY'
  });
};

router.get('/unlock-dual-control-authorization', async (req, res) => {
  try {
    const list = await builder.listTokenRedemptionUnlockDualControlAuthorizations();
    sendSafetyResponse(res, 200, { success: true, list });
  } catch (err) {
    sendSafetyResponse(res, 500, { success: false, error: err.message });
  }
});

router.get('/unlock-dual-control-authorization/:unlockDualControlAuthorizationId', async (req, res) => {
  try {
    const record = await builder.getTokenRedemptionUnlockDualControlAuthorization(req.params.unlockDualControlAuthorizationId);
    if (!record) {
      return sendSafetyResponse(res, 404, { success: false, error: 'UNLOCK_DUAL_CONTROL_AUTHORIZATION_RECORD_NOT_FOUND' });
    }
    const rules = await builder.getRules(req.params.unlockDualControlAuthorizationId);
    sendSafetyResponse(res, 200, { success: true, tokenRedemptionUnlockDualControlAuthorization: record, rules });
  } catch (err) {
    sendSafetyResponse(res, 500, { success: false, error: err.message });
  }
});

router.post('/unlock-dual-control-authorization/from-unlock-operator-attestation/:unlockOperatorAttestationId', async (req, res) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await builder.createTokenRedemptionUnlockDualControlAuthorizationDraft(req.params.unlockOperatorAttestationId, actorId);
    sendSafetyResponse(res, 201, { success: true, ...result });
  } catch (err) {
    const status = err.message.includes('NOT_FOUND') ? 404 : 400;
    sendSafetyResponse(res, status, { success: false, error: err.message });
  }
});

router.post('/unlock-dual-control-authorization/:unlockDualControlAuthorizationId/primary-authorizer', async (req, res) => {
  try {
    const { authorizerId, role } = req.body;
    const result = await decision.recordPrimaryAuthorizer(req.params.unlockDualControlAuthorizationId, authorizerId, role);
    sendSafetyResponse(res, 200, { success: true, tokenRedemptionUnlockDualControlAuthorization: result });
  } catch (err) {
    sendSafetyResponse(res, 400, { success: false, error: err.message });
  }
});

router.post('/unlock-dual-control-authorization/:unlockDualControlAuthorizationId/secondary-authorizer', async (req, res) => {
  try {
    const { authorizerId, role } = req.body;
    const result = await decision.recordSecondaryAuthorizer(req.params.unlockDualControlAuthorizationId, authorizerId, role);
    sendSafetyResponse(res, 200, { success: true, tokenRedemptionUnlockDualControlAuthorization: result });
  } catch (err) {
    sendSafetyResponse(res, 400, { success: false, error: err.message });
  }
});

router.post('/unlock-dual-control-authorization/:unlockDualControlAuthorizationId/evaluate', async (req, res) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const confirmations = req.body.confirmations || {};
    const result = await evaluator.evaluateUnlockDualControlAuthorization(req.params.unlockDualControlAuthorizationId, confirmations, actorId);
    sendSafetyResponse(res, 200, { success: true, ...result });
  } catch (err) {
    sendSafetyResponse(res, 400, { success: false, error: err.message });
  }
});

router.post('/unlock-dual-control-authorization/:unlockDualControlAuthorizationId/decision', async (req, res) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const { decision: decisionVal, rationale } = req.body;
    const result = await decision.recordDecision(req.params.unlockDualControlAuthorizationId, decisionVal, rationale, actorId);
    sendSafetyResponse(res, 200, { success: true, tokenRedemptionUnlockDualControlAuthorization: result });
  } catch (err) {
    sendSafetyResponse(res, 400, { success: false, error: err.message });
  }
});

router.post('/unlock-dual-control-authorization/:unlockDualControlAuthorizationId/finalize', async (req, res) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await decision.finalizeUnlockDualControlAuthorization(req.params.unlockDualControlAuthorizationId, actorId);
    sendSafetyResponse(res, 200, { success: true, tokenRedemptionUnlockDualControlAuthorization: result });
  } catch (err) {
    sendSafetyResponse(res, 400, { success: false, error: err.message });
  }
});

module.exports = router;
