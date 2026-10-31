'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalEvaluatorService').serviceInstance;
const decisionSvc = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalDecisionService').serviceInstance;

// Get all final approval records
router.get('/approval', async (req, res, next) => {
  try {
    const list = await builder.listTokenRedemptionFinalApprovals();
    res.json(list);
  } catch (err) { next(err); }
});

// Get detailed record with rules
router.get('/approval/:activationTokenRedemptionFinalApvId', async (req, res, next) => {
  try {
    const record = await builder.getTokenRedemptionFinalApproval(req.params.activationTokenRedemptionFinalApvId);
    if (!record) return res.status(404).json({ error: 'TOKEN_REDEMPTION_FINAL_APPROVAL_RECORD_NOT_FOUND' });
    const rules = await builder.getRules(req.params.activationTokenRedemptionFinalApvId);
    res.json({ tokenRedemptionFinalApproval: record, rules });
  } catch (err) { next(err); }
});

// Create draft from Phase 163 env
router.post('/approval/from-env/:activationTokenRedemptionEnvId', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await builder.createTokenRedemptionFinalApprovalDraft(req.params.activationTokenRedemptionEnvId, actorId);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// Evaluate rules
router.post('/approval/:activationTokenRedemptionFinalApvId/evaluate', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const { signatures } = req.body;
    const result = await evaluator.evaluateTokenRedemptionFinalApproval(req.params.activationTokenRedemptionFinalApvId, signatures, actorId);
    res.json(result);
  } catch (err) { next(err); }
});

// Record decision
router.post('/approval/:activationTokenRedemptionFinalApvId/decision', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const { decision, rationale } = req.body;
    const result = await decisionSvc.recordDecision(req.params.activationTokenRedemptionFinalApvId, decision, rationale, actorId);
    res.json(result);
  } catch (err) { next(err); }
});

// Finalize and lock
router.post('/approval/:activationTokenRedemptionFinalApvId/finalize', async (req, res, next) => {
  try {
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await decisionSvc.finalizeRedemptionFinalApproval(req.params.activationTokenRedemptionFinalApvId, actorId);
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
