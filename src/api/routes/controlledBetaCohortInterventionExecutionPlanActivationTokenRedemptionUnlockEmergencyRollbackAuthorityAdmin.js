'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityEvaluatorService').serviceInstance;
const decisionService = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityDecisionService').serviceInstance;

// GET /
router.get('/', async (req, res, next) => {
  try {
    const list = await builder.listUnlockEmergencyRollbackAuthorities();
    res.json({ tokenRedemptionUnlockEmergencyRollbackAuthorities: list });
  } catch (err) {
    next(err);
  }
});

// GET /:unlockEmergencyRollbackAuthorityId
router.get('/:unlockEmergencyRollbackAuthorityId', async (req, res, next) => {
  try {
    const { unlockEmergencyRollbackAuthorityId } = req.params;
    const record = await builder.getTokenRedemptionUnlockEmergencyRollbackAuthority(unlockEmergencyRollbackAuthorityId);
    if (!record) {
      return res.status(404).json({ error: 'Emergency rollback authority record not found' });
    }
    const rules = await evaluator.getRuleLogs(unlockEmergencyRollbackAuthorityId);
    res.json({
      tokenRedemptionUnlockEmergencyRollbackAuthority: record,
      rules,
      auditLogs: []
    });
  } catch (err) {
    next(err);
  }
});

// POST /from-unlock-legal-policy-hold/:unlockLegalPolicyHoldId
router.post('/from-unlock-legal-policy-hold/:unlockLegalPolicyHoldId', async (req, res, next) => {
  try {
    const { unlockLegalPolicyHoldId } = req.params;
    const actorId = req.headers['x-actor-id'] || 'admin';
    const draft = await builder.createTokenRedemptionUnlockEmergencyRollbackAuthorityDraft(unlockLegalPolicyHoldId, actorId);
    res.status(201).json(draft);
  } catch (err) {
    next(err);
  }
});

// POST /:unlockEmergencyRollbackAuthorityId/evaluate
router.post('/:unlockEmergencyRollbackAuthorityId/evaluate', async (req, res, next) => {
  try {
    const { unlockEmergencyRollbackAuthorityId } = req.params;
    const { confirmations } = req.body;
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await evaluator.evaluateUnlockEmergencyRollbackAuthority(unlockEmergencyRollbackAuthorityId, confirmations, actorId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /:unlockEmergencyRollbackAuthorityId/decision
router.post('/:unlockEmergencyRollbackAuthorityId/decision', async (req, res, next) => {
  try {
    const { unlockEmergencyRollbackAuthorityId } = req.params;
    const { decision, rationale, rollback_officer_id, rollback_officer_role, reason } = req.body;
    const actorId = req.headers['x-actor-id'] || 'admin';

    // 1. Record Rollback Officer
    await decisionService.recordRollbackOfficer(
      unlockEmergencyRollbackAuthorityId,
      rollback_officer_id,
      rollback_officer_role,
      reason || rationale || 'Emergency rollback authority recorded',
      actorId
    );

    // 2. Record Decision
    const updated = await decisionService.recordDecision(
      unlockEmergencyRollbackAuthorityId,
      decision,
      rationale || reason || 'Decision recorded',
      actorId
    );

    res.json({ tokenRedemptionUnlockEmergencyRollbackAuthority: updated });
  } catch (err) {
    next(err);
  }
});

// POST /:unlockEmergencyRollbackAuthorityId/finalize
router.post('/:unlockEmergencyRollbackAuthorityId/finalize', async (req, res, next) => {
  try {
    const { unlockEmergencyRollbackAuthorityId } = req.params;
    const actorId = req.headers['x-actor-id'] || 'admin';
    const finalized = await decisionService.finalizeUnlockEmergencyRollbackAuthority(unlockEmergencyRollbackAuthorityId, actorId);
    res.json(finalized);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
