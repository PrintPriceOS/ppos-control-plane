'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealEvaluatorService').serviceInstance;
const decisionService = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealDecisionService').serviceInstance;

// GET /
router.get('/', async (req, res, next) => {
  try {
    const list = await builder.listTokenRedemptionUnlockFinalNonExecutionEvidenceSeal();
    res.json({ tokenRedemptionUnlockFinalNonExecutionEvidenceSeals: list });
  } catch (err) {
    next(err);
  }
});

// GET /:unlockFinalNonExecutionEvidenceSealId
router.get('/:unlockFinalNonExecutionEvidenceSealId', async (req, res, next) => {
  try {
    const { unlockFinalNonExecutionEvidenceSealId } = req.params;
    const record = await builder.getTokenRedemptionUnlockFinalNonExecutionEvidenceSeal(unlockFinalNonExecutionEvidenceSealId);
    if (!record) {
      return res.status(404).json({ error: 'Evidence seal record not found' });
    }
    const rules = await evaluator.getRuleLogs(unlockFinalNonExecutionEvidenceSealId);
    res.json({
      tokenRedemptionUnlockFinalNonExecutionEvidenceSeal: record,
      rules,
      auditLogs: []
    });
  } catch (err) {
    next(err);
  }
});

// POST /from-unlock-kill-switch-dry-run/:unlockKillSwitchDryRunId
router.post('/from-unlock-kill-switch-dry-run/:unlockKillSwitchDryRunId', async (req, res, next) => {
  try {
    const { unlockKillSwitchDryRunId } = req.params;
    const actorId = req.headers['x-actor-id'] || 'admin';
    const draft = await builder.createTokenRedemptionUnlockFinalNonExecutionEvidenceSealDraft(unlockKillSwitchDryRunId, actorId);
    res.status(201).json(draft);
  } catch (err) {
    next(err);
  }
});

// POST /:unlockFinalNonExecutionEvidenceSealId/evaluate
router.post('/:unlockFinalNonExecutionEvidenceSealId/evaluate', async (req, res, next) => {
  try {
    const { unlockFinalNonExecutionEvidenceSealId } = req.params;
    const { confirmations } = req.body;
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await evaluator.evaluateUnlockFinalNonExecutionEvidenceSeal(unlockFinalNonExecutionEvidenceSealId, confirmations, actorId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /:unlockFinalNonExecutionEvidenceSealId/decision
router.post('/:unlockFinalNonExecutionEvidenceSealId/decision', async (req, res, next) => {
  try {
    const { unlockFinalNonExecutionEvidenceSealId } = req.params;
    const { decision, rationale, evidence_seal_officer_id, evidence_seal_officer_role, reason } = req.body;
    const actorId = req.headers['x-actor-id'] || 'admin';

    // 1. Record evidence seal officer
    await decisionService.recordEvidenceSealOfficer(
      unlockFinalNonExecutionEvidenceSealId,
      evidence_seal_officer_id,
      evidence_seal_officer_role,
      reason || rationale || 'Evidence seal officer recorded',
      actorId
    );

    // 2. Record decision
    await decisionService.recordDecision(
      unlockFinalNonExecutionEvidenceSealId,
      decision,
      rationale || reason || 'Decision recorded',
      actorId
    );

    const updated = await builder.getTokenRedemptionUnlockFinalNonExecutionEvidenceSeal(unlockFinalNonExecutionEvidenceSealId);
    res.json({ tokenRedemptionUnlockFinalNonExecutionEvidenceSeal: updated });
  } catch (err) {
    next(err);
  }
});

// POST /:unlockFinalNonExecutionEvidenceSealId/finalize
router.post('/:unlockFinalNonExecutionEvidenceSealId/finalize', async (req, res, next) => {
  try {
    const { unlockFinalNonExecutionEvidenceSealId } = req.params;
    const actorId = req.headers['x-actor-id'] || 'admin';
    await decisionService.finalizeUnlockFinalNonExecutionEvidenceSeal(unlockFinalNonExecutionEvidenceSealId, actorId);
    const updated = await builder.getTokenRedemptionUnlockFinalNonExecutionEvidenceSeal(unlockFinalNonExecutionEvidenceSealId);
    res.json({ tokenRedemptionUnlockFinalNonExecutionEvidenceSeal: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
