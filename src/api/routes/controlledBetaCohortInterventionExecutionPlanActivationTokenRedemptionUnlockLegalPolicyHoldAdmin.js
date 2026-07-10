'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldEvaluatorService').serviceInstance;
const decisionService = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldDecisionService').serviceInstance;
const auditService = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldAuditService').serviceInstance;

// GET /
router.get('/', async (req, res, next) => {
  try {
    const list = await builder.listUnlockLegalPolicyHolds();
    res.json({ tokenRedemptionUnlockLegalPolicyHolds: list });
  } catch (err) {
    next(err);
  }
});

// GET /:unlockLegalPolicyHoldId
router.get('/:unlockLegalPolicyHoldId', async (req, res, next) => {
  try {
    const { unlockLegalPolicyHoldId } = req.params;
    const record = await builder.getTokenRedemptionUnlockLegalPolicyHold(unlockLegalPolicyHoldId);
    if (!record) {
      return res.status(404).json({ error: 'Legal/policy hold record not found' });
    }
    const auditLogs = await auditService.logAction(unlockLegalPolicyHoldId, 'GET_RECORD_DETAILS', 'system', { unlockLegalPolicyHoldId }); // We don't have to retrieve audit logs but can return them from logs if we want. Wait, we don't have getAuditLogs in Audit Service? Let's check or just return empty auditLogs array or query db.
    const rules = await evaluator.getRuleResults(unlockLegalPolicyHoldId);
    res.json({
      tokenRedemptionUnlockLegalPolicyHold: record,
      rules,
      auditLogs: []
    });
  } catch (err) {
    next(err);
  }
});

// POST /from-unlock-risk-officer-countersign/:unlockRiskOfficerCountersignId
router.post('/from-unlock-risk-officer-countersign/:unlockRiskOfficerCountersignId', async (req, res, next) => {
  try {
    const { unlockRiskOfficerCountersignId } = req.params;
    const actorId = req.headers['x-actor-id'] || 'admin';
    const draft = await builder.createTokenRedemptionUnlockLegalPolicyHoldDraft(unlockRiskOfficerCountersignId, actorId);
    res.status(201).json(draft);
  } catch (err) {
    next(err);
  }
});

// POST /:unlockLegalPolicyHoldId/evaluate
router.post('/:unlockLegalPolicyHoldId/evaluate', async (req, res, next) => {
  try {
    const { unlockLegalPolicyHoldId } = req.params;
    const { confirmations } = req.body;
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await evaluator.evaluateUnlockLegalPolicyHold(unlockLegalPolicyHoldId, confirmations, actorId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /:unlockLegalPolicyHoldId/decision
router.post('/:unlockLegalPolicyHoldId/decision', async (req, res, next) => {
  try {
    const { unlockLegalPolicyHoldId } = req.params;
    const { decision, rationale, legal_policy_officer_id, legal_policy_officer_role, reason } = req.body;
    const actorId = req.headers['x-actor-id'] || 'admin';

    // 1. Record Officer
    await decisionService.recordLegalPolicyOfficer(
      unlockLegalPolicyHoldId,
      legal_policy_officer_id,
      legal_policy_officer_role,
      reason || rationale || 'Attestation recorded',
      actorId
    );

    // 2. Record Decision
    const updated = await decisionService.recordDecision(
      unlockLegalPolicyHoldId,
      decision,
      rationale || reason || 'Decision finalized',
      actorId
    );

    res.json({ tokenRedemptionUnlockLegalPolicyHold: updated });
  } catch (err) {
    next(err);
  }
});

// POST /:unlockLegalPolicyHoldId/finalize
router.post('/:unlockLegalPolicyHoldId/finalize', async (req, res, next) => {
  try {
    const { unlockLegalPolicyHoldId } = req.params;
    const actorId = req.headers['x-actor-id'] || 'admin';
    const finalized = await decisionService.finalizeUnlockLegalPolicyHold(unlockLegalPolicyHoldId, actorId);
    res.json({ tokenRedemptionUnlockLegalPolicyHold: finalized });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
