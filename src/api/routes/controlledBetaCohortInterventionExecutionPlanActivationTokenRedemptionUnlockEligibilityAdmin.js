'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityEvaluatorService').serviceInstance;
const decisionSvc = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityDecisionService').serviceInstance;
const evidenceSvc = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityEvidencePackService').serviceInstance;

const addMarkers = (obj) => {
  return {
    ...obj,
    execution_enabled: false,
    token_unlocked: false,
    token_redeemed: false,
    token_redeemable: false,
    runtime_mutations: 0
  };
};

// GET list (Drafts and eligibility records)
router.get('/', async (req, res) => {
  try {
    const list = await builder.listTokenRedemptionUnlockEligibilities();
    return res.json(addMarkers(list));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET details
router.get('/:unlockEligibilityId', async (req, res) => {
  try {
    const record = await builder.getTokenRedemptionUnlockEligibility(req.params.unlockEligibilityId);
    if (!record) return res.status(404).json({ error: 'Unlock eligibility record not found' });
    return res.json(addMarkers(record));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST Create from lock parent
router.post('/from-redemption-lock/:redemptionLockId', async (req, res) => {
  const actorId = req.headers['x-actor-id'] || 'admin';
  try {
    const result = await builder.createTokenRedemptionUnlockEligibilityDraft(req.params.redemptionLockId, actorId);
    return res.status(201).json(addMarkers(result));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST Evaluate
router.post('/:unlockEligibilityId/evaluate', async (req, res) => {
  const actorId = req.headers['x-actor-id'] || 'admin';
  const { security_officer_confirmed, compliance_officer_confirmed } = req.body;
  try {
    const result = await evaluator.evaluateUnlockEligibility(req.params.unlockEligibilityId, {
      security_officer_confirmed,
      compliance_officer_confirmed
    }, actorId);
    return res.json(addMarkers(result));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST Decision (APPROVE / REJECT)
router.post('/:unlockEligibilityId/decision', async (req, res) => {
  const actorId = req.headers['x-actor-id'] || 'admin';
  const { decision, rationale } = req.body;
  try {
    const result = await decisionSvc.recordDecision(req.params.unlockEligibilityId, decision, rationale, actorId);
    return res.json(addMarkers(result));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST Finalize
router.post('/:unlockEligibilityId/finalize', async (req, res) => {
  const actorId = req.headers['x-actor-id'] || 'admin';
  try {
    const finalRecord = await decisionSvc.finalizeUnlockEligibility(req.params.unlockEligibilityId, actorId);
    const evidencePack = await evidenceSvc.generateEvidencePack(finalRecord, actorId);
    return res.json(addMarkers({ tokenRedemptionUnlockEligibility: finalRecord, evidencePack }));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
