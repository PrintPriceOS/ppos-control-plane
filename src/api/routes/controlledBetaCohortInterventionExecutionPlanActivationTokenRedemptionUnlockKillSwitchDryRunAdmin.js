'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunEvaluatorService').serviceInstance;
const decisionService = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunDecisionService').serviceInstance;

// GET /
router.get('/', async (req, res, next) => {
  try {
    const list = await builder.listTokenRedemptionUnlockKillSwitchDryRun();
    res.json({ tokenRedemptionUnlockKillSwitchDryRuns: list });
  } catch (err) {
    next(err);
  }
});

// GET /:unlockKillSwitchDryRunId
router.get('/:unlockKillSwitchDryRunId', async (req, res, next) => {
  try {
    const { unlockKillSwitchDryRunId } = req.params;
    const record = await builder.getTokenRedemptionUnlockKillSwitchDryRun(unlockKillSwitchDryRunId);
    if (!record) {
      return res.status(404).json({ error: 'Kill-switch dry-run record not found' });
    }
    const rules = await evaluator.getRuleLogs(unlockKillSwitchDryRunId);
    res.json({
      tokenRedemptionUnlockKillSwitchDryRun: record,
      rules,
      auditLogs: []
    });
  } catch (err) {
    next(err);
  }
});

// POST /from-unlock-emergency-rollback-authority/:unlockEmergencyRollbackAuthorityId
router.post('/from-unlock-emergency-rollback-authority/:unlockEmergencyRollbackAuthorityId', async (req, res, next) => {
  try {
    const { unlockEmergencyRollbackAuthorityId } = req.params;
    const actorId = req.headers['x-actor-id'] || 'admin';
    const draft = await builder.createTokenRedemptionUnlockKillSwitchDryRunDraft(unlockEmergencyRollbackAuthorityId, actorId);
    res.status(201).json(draft);
  } catch (err) {
    next(err);
  }
});

// POST /:unlockKillSwitchDryRunId/evaluate
router.post('/:unlockKillSwitchDryRunId/evaluate', async (req, res, next) => {
  try {
    const { unlockKillSwitchDryRunId } = req.params;
    const { confirmations } = req.body;
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await evaluator.evaluateUnlockKillSwitchDryRun(unlockKillSwitchDryRunId, confirmations, actorId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /:unlockKillSwitchDryRunId/decision
router.post('/:unlockKillSwitchDryRunId/decision', async (req, res, next) => {
  try {
    const { unlockKillSwitchDryRunId } = req.params;
    const { decision, rationale, kill_switch_verification_officer_id, kill_switch_verification_officer_role, reason } = req.body;
    const actorId = req.headers['x-actor-id'] || 'admin';

    // 1. Record verification officer
    await decisionService.recordVerificationOfficer(
      unlockKillSwitchDryRunId,
      kill_switch_verification_officer_id,
      kill_switch_verification_officer_role,
      reason || rationale || 'Kill-switch dry-run verification officer recorded',
      actorId
    );

    // 2. Record decision
    await decisionService.recordDecision(
      unlockKillSwitchDryRunId,
      decision,
      rationale || reason || 'Decision recorded',
      actorId
    );

    const updated = await builder.getTokenRedemptionUnlockKillSwitchDryRun(unlockKillSwitchDryRunId);
    res.json({ tokenRedemptionUnlockKillSwitchDryRun: updated });
  } catch (err) {
    next(err);
  }
});

// POST /:unlockKillSwitchDryRunId/finalize
router.post('/:unlockKillSwitchDryRunId/finalize', async (req, res, next) => {
  try {
    const { unlockKillSwitchDryRunId } = req.params;
    const actorId = req.headers['x-actor-id'] || 'admin';
    await decisionService.finalizeUnlockKillSwitchDryRun(unlockKillSwitchDryRunId, actorId);
    const updated = await builder.getTokenRedemptionUnlockKillSwitchDryRun(unlockKillSwitchDryRunId);
    res.json({ tokenRedemptionUnlockKillSwitchDryRun: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
