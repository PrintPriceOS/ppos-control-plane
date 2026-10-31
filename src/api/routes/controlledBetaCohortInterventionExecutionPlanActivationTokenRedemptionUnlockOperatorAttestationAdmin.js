'use strict';

const express = require('express');
const router = express.Router();

const builder = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationEvaluatorService').serviceInstance;
const decision = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationDecisionService').serviceInstance;

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
    write_scope: 'PHASE_171_TABLES_ONLY'
  });
};

router.get('/unlock-operator-attestation', async (req, res) => {
  try {
    const list = await builder.listTokenRedemptionUnlockOperatorAttestations();
    sendSafetyResponse(res, 200, { success: true, list });
  } catch (err) {
    sendSafetyResponse(res, 500, { success: false, error: err.message });
  }
});

router.get('/unlock-operator-attestation/:unlockOperatorAttestationId', async (req, res) => {
  try {
    const record = await builder.getTokenRedemptionUnlockOperatorAttestation(req.params.unlockOperatorAttestationId);
    if (!record) {
      return sendSafetyResponse(res, 404, { success: false, error: 'UNLOCK_OPERATOR_ATTESTATION_RECORD_NOT_FOUND' });
    }
    const rules = await builder.getRules(req.params.unlockOperatorAttestationId);
    sendSafetyResponse(res, 200, { success: true, tokenRedemptionUnlockOperatorAttestation: record, rules });
  } catch (err) {
    sendSafetyResponse(res, 500, { success: false, error: err.message });
  }
});

router.post('/unlock-operator-attestation/from-unlock-pre-execution-freeze/:unlockPreExecutionFreezeId', async (req, res) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await builder.createTokenRedemptionUnlockOperatorAttestationDraft(req.params.unlockPreExecutionFreezeId, actorId);
    sendSafetyResponse(res, 201, { success: true, ...result });
  } catch (err) {
    const status = err.message.includes('NOT_FOUND') ? 404 : 400;
    sendSafetyResponse(res, status, { success: false, error: err.message });
  }
});

router.post('/unlock-operator-attestation/:unlockOperatorAttestationId/evaluate', async (req, res) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const confirmations = req.body.confirmations || {};
    const result = await evaluator.evaluateUnlockOperatorAttestation(req.params.unlockOperatorAttestationId, confirmations, actorId);
    sendSafetyResponse(res, 200, { success: true, ...result });
  } catch (err) {
    sendSafetyResponse(res, 400, { success: false, error: err.message });
  }
});

router.post('/unlock-operator-attestation/:unlockOperatorAttestationId/decision', async (req, res) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const { decision: decisionVal, rationale } = req.body;
    const result = await decision.recordDecision(req.params.unlockOperatorAttestationId, decisionVal, rationale, actorId);
    sendSafetyResponse(res, 200, { success: true, tokenRedemptionUnlockOperatorAttestation: result });
  } catch (err) {
    sendSafetyResponse(res, 400, { success: false, error: err.message });
  }
});

router.post('/unlock-operator-attestation/:unlockOperatorAttestationId/finalize', async (req, res) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await decision.finalizeUnlockOperatorAttestation(req.params.unlockOperatorAttestationId, actorId);
    sendSafetyResponse(res, 200, { success: true, tokenRedemptionUnlockOperatorAttestation: result });
  } catch (err) {
    sendSafetyResponse(res, 400, { success: false, error: err.message });
  }
});

module.exports = router;
