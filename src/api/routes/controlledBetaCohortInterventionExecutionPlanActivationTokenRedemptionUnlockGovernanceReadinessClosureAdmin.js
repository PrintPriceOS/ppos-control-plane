'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureEvaluatorService').serviceInstance;
const decisionService = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureDecisionService').serviceInstance;

// GET /
router.get('/', async (req, res, next) => {
  try {
    const list = await builder.listTokenRedemptionUnlockGovernanceReadinessClosure();
    res.json({ tokenRedemptionUnlockGovernanceReadinessClosures: list });
  } catch (err) {
    next(err);
  }
});

// GET /:unlockGovernanceReadinessClosureId
router.get('/:unlockGovernanceReadinessClosureId', async (req, res, next) => {
  try {
    const { unlockGovernanceReadinessClosureId } = req.params;
    const record = await builder.getTokenRedemptionUnlockGovernanceReadinessClosure(unlockGovernanceReadinessClosureId);
    if (!record) {
      return res.status(404).json({ error: 'Governance closure record not found' });
    }
    const rules = await evaluator.getRuleLogs(unlockGovernanceReadinessClosureId);
    res.json({
      tokenRedemptionUnlockGovernanceReadinessClosure: record,
      rules,
      auditLogs: []
    });
  } catch (err) {
    next(err);
  }
});

// POST /from-unlock-final-non-execution-evidence-seal/:unlockFinalNonExecutionEvidenceSealId
router.post('/from-unlock-final-non-execution-evidence-seal/:unlockFinalNonExecutionEvidenceSealId', async (req, res, next) => {
  try {
    const { unlockFinalNonExecutionEvidenceSealId } = req.params;
    const actorId = req.headers['x-actor-id'] || 'admin';
    const draft = await builder.createTokenRedemptionUnlockGovernanceReadinessClosureDraft(unlockFinalNonExecutionEvidenceSealId, actorId);
    res.status(201).json(draft);
  } catch (err) {
    next(err);
  }
});

// POST /:unlockGovernanceReadinessClosureId/evaluate
router.post('/:unlockGovernanceReadinessClosureId/evaluate', async (req, res, next) => {
  try {
    const { unlockGovernanceReadinessClosureId } = req.params;
    const { confirmations } = req.body;
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await evaluator.evaluateUnlockGovernanceReadinessClosure(unlockGovernanceReadinessClosureId, confirmations, actorId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /:unlockGovernanceReadinessClosureId/decision
router.post('/:unlockGovernanceReadinessClosureId/decision', async (req, res, next) => {
  try {
    const { unlockGovernanceReadinessClosureId } = req.params;
    const { decision, rationale, governance_closure_officer_id, governance_closure_officer_role, reason } = req.body;
    const actorId = req.headers['x-actor-id'] || 'admin';

    // 1. Record officer
    await decisionService.recordGovernanceClosureOfficer(
      unlockGovernanceReadinessClosureId,
      governance_closure_officer_id,
      governance_closure_officer_role,
      reason || rationale || 'Governance closure officer recorded',
      actorId
    );

    // 2. Record decision
    await decisionService.recordDecision(
      unlockGovernanceReadinessClosureId,
      decision,
      rationale || reason || 'Decision recorded',
      actorId
    );

    const updated = await builder.getTokenRedemptionUnlockGovernanceReadinessClosure(unlockGovernanceReadinessClosureId);
    res.json({ tokenRedemptionUnlockGovernanceReadinessClosure: updated });
  } catch (err) {
    next(err);
  }
});

// POST /:unlockGovernanceReadinessClosureId/finalize
router.post('/:unlockGovernanceReadinessClosureId/finalize', async (req, res, next) => {
  try {
    const { unlockGovernanceReadinessClosureId } = req.params;
    const actorId = req.headers['x-actor-id'] || 'admin';
    await decisionService.finalizeUnlockGovernanceReadinessClosure(unlockGovernanceReadinessClosureId, actorId);
    const updated = await builder.getTokenRedemptionUnlockGovernanceReadinessClosure(unlockGovernanceReadinessClosureId);
    res.json({ tokenRedemptionUnlockGovernanceReadinessClosure: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
