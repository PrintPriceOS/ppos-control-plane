'use strict';

const express = require('express');
const router = express.Router();
const builder = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionLockBuilderService').serviceInstance;
const evaluator = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionLockEvaluatorService').serviceInstance;
const decisionSvc = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionLockDecisionService').serviceInstance;
const evidenceSvc = require('../services/cohortInterventionExecutionPlanActivationTokenRedemptionLockEvidencePackService').serviceInstance;

// GET list (Drafts and locked records)
router.get('/', async (req, res) => {
  const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

  try {
    if (!isProdLike) {
      const list = Array.from(builder._mockState.tokenRedemptionLock.values());
      return res.json(list);
    }
    const db = require('../services/mysqlClient');
    const rows = await db.query('SELECT * FROM cb_cohort_intervention_activation_token_redempt_lock ORDER BY created_at DESC');
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET details
router.get('/:activationTokenRedemptionLockId', async (req, res) => {
  try {
    const record = await builder.getTokenRedemptionLock(req.params.activationTokenRedemptionLockId);
    if (!record) return res.status(404).json({ error: 'Lock record not found' });
    return res.json(record);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST Create from final approval parent
router.post('/from-final-approval/:activationTokenRedemptionFinalApvId', async (req, res) => {
  const actorId = req.headers['x-actor-id'] || 'admin';
  try {
    const result = await builder.createTokenRedemptionLockDraft(req.params.activationTokenRedemptionFinalApvId, actorId);
    return res.status(201).json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST Evaluate
router.post('/:activationTokenRedemptionLockId/evaluate', async (req, res) => {
  const actorId = req.headers['x-actor-id'] || 'admin';
  const { security_officer_confirmed, compliance_officer_confirmed, operations_director_confirmed } = req.body;
  try {
    const result = await evaluator.evaluateTokenRedemptionLock(req.params.activationTokenRedemptionLockId, {
      security_officer_confirmed,
      compliance_officer_confirmed,
      operations_director_confirmed
    }, actorId);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST Decision (APPROVE / REJECT)
router.post('/:activationTokenRedemptionLockId/decision', async (req, res) => {
  const actorId = req.headers['x-actor-id'] || 'admin';
  const { decision, rationale } = req.body;
  try {
    const result = await decisionSvc.recordDecision(req.params.activationTokenRedemptionLockId, decision, rationale, actorId);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST Finalize
router.post('/:activationTokenRedemptionLockId/finalize', async (req, res) => {
  const actorId = req.headers['x-actor-id'] || 'admin';
  try {
    const finalRecord = await decisionSvc.finalizeRedemptionLock(req.params.activationTokenRedemptionLockId, actorId);
    const evidencePack = await evidenceSvc.generateEvidencePack(finalRecord, actorId);
    return res.json({ tokenRedemptionLock: finalRecord, evidencePack });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
