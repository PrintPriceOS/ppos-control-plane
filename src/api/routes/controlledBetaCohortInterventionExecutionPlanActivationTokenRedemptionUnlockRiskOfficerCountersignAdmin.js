'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignEvaluatorService').serviceInstance;
const decisionService = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignDecisionService').serviceInstance;
const auditService = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignAuditService').serviceInstance;

// GET /
router.get('/', async (req, res, next) => {
  try {
    const list = await builder.listUnlockRiskOfficerCountersigns();
    res.json({ tokenRedemptionUnlockRiskOfficerCountersigns: list });
  } catch (err) {
    next(err);
  }
});

// GET /:unlockRiskOfficerCountersignId
router.get('/:unlockRiskOfficerCountersignId', async (req, res, next) => {
  try {
    const { unlockRiskOfficerCountersignId } = req.params;
    const record = await builder.getTokenRedemptionUnlockRiskOfficerCountersign(unlockRiskOfficerCountersignId);
    if (!record) {
      return res.status(404).json({ error: 'Risk officer countersign record not found' });
    }
    const auditLogs = await auditService.getAuditLogs(unlockRiskOfficerCountersignId);
    const rules = await evaluator.getRuleResults(unlockRiskOfficerCountersignId);
    res.json({
      tokenRedemptionUnlockRiskOfficerCountersign: record,
      rules,
      auditLogs
    });
  } catch (err) {
    next(err);
  }
});

// POST /from-unlock-compliance-witness/:unlockComplianceWitnessId
router.post('/from-unlock-compliance-witness/:unlockComplianceWitnessId', async (req, res, next) => {
  try {
    const { unlockComplianceWitnessId } = req.params;
    const actorId = req.headers['x-actor-id'] || 'admin';
    const draft = await builder.createTokenRedemptionUnlockRiskOfficerCountersignDraft(unlockComplianceWitnessId, actorId);
    res.status(201).json(draft);
  } catch (err) {
    next(err);
  }
});

// POST /:unlockRiskOfficerCountersignId/evaluate
router.post('/:unlockRiskOfficerCountersignId/evaluate', async (req, res, next) => {
  try {
    const { unlockRiskOfficerCountersignId } = req.params;
    const { confirmations } = req.body;
    const actorId = req.headers['x-actor-id'] || 'admin';
    const result = await evaluator.evaluateUnlockRiskOfficerCountersign(unlockRiskOfficerCountersignId, confirmations, actorId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /:unlockRiskOfficerCountersignId/decision
router.post('/:unlockRiskOfficerCountersignId/decision', async (req, res, next) => {
  try {
    const { unlockRiskOfficerCountersignId } = req.params;
    const { decision, rationale, risk_officer_id, risk_officer_role, reason } = req.body;
    const actorId = req.headers['x-actor-id'] || 'admin';

    // 1. Record Risk Officer
    await decisionService.recordRiskOfficer(
      unlockRiskOfficerCountersignId,
      risk_officer_id,
      risk_officer_role,
      reason || rationale || 'Attestation recorded',
      actorId
    );

    // 2. Record Decision
    const updated = await decisionService.recordDecision(
      unlockRiskOfficerCountersignId,
      decision,
      rationale || reason || 'Decision finalized',
      actorId
    );

    res.json({ tokenRedemptionUnlockRiskOfficerCountersign: updated });
  } catch (err) {
    next(err);
  }
});

// POST /:unlockRiskOfficerCountersignId/finalize
router.post('/:unlockRiskOfficerCountersignId/finalize', async (req, res, next) => {
  try {
    const { unlockRiskOfficerCountersignId } = req.params;
    const actorId = req.headers['x-actor-id'] || 'admin';
    const finalized = await decisionService.finalizeUnlockRiskOfficerCountersign(unlockRiskOfficerCountersignId, actorId);
    res.json({ tokenRedemptionUnlockRiskOfficerCountersign: finalized });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
