const express = require('express');
const router = express.Router();
const builderService = require('../services/cohortInterventionApprovalBuilderService').serviceInstance || require('../services/cohortInterventionApprovalBuilderService');
const workflowService = require('../services/cohortInterventionApprovalWorkflowService').serviceInstance || require('../services/cohortInterventionApprovalWorkflowService');
const decisionService = require('../services/cohortInterventionApprovalDecisionService').serviceInstance || require('../services/cohortInterventionApprovalDecisionService');
const evidenceService = require('../services/cohortInterventionApprovalEvidencePackService').serviceInstance || require('../services/cohortInterventionApprovalEvidencePackService');
const db = require('../services/mysqlClient');

// Exigent admin verification middleware
router.use((req, res, next) => {
  if (!req.admin) {
    return res.status(403).json({ ok: false, error: 'Admin access required' });
  }
  next();
});

router.get('/approvals', async (req, res) => {
  try {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    let list = [];
    if (!isProdLike) {
      list = Array.from(builderService._mockState.approvals.values());
    } else {
      list = await db.query("SELECT * FROM controlled_beta_cohort_intervention_approvals ORDER BY created_at DESC");
    }
    res.json({ ok: true, approvals: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/approvals/:approvalId', async (req, res) => {
  try {
    const approval = await workflowService.getApproval(req.params.approvalId);
    if (!approval) return res.status(404).json({ ok: false, error: 'Approval not found' });
    const steps = await workflowService.getSteps(req.params.approvalId);
    res.json({ ok: true, approval, steps });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/approvals/from-preparation/:preparationId', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await builderService.createApproval(req.params.preparationId, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/approvals/:approvalId/policy', async (req, res) => {
  try {
    const approval = await workflowService.getApproval(req.params.approvalId);
    if (!approval) return res.status(404).json({ ok: false, error: 'Approval not found' });
    // Just return policy config
    res.json({ ok: true, policy: approval.approval_policy_json });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/approvals/:approvalId/step', async (req, res) => {
  try {
    const { role } = req.body;
    if (!role) return res.status(400).json({ ok: false, error: 'Missing role' });
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await workflowService.signStep(req.params.approvalId, role, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/approvals/:approvalId/decision', async (req, res) => {
  try {
    const { decision, rationale } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await decisionService.recordDecision(req.params.approvalId, decision, rationale, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/approvals/:approvalId/finalize', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await workflowService.finalizeApproval(req.params.approvalId, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/approvals/:approvalId/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await workflowService.rejectApproval(req.params.approvalId, reason, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/approvals/:approvalId/request-changes', async (req, res) => {
  try {
    const { reason } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await workflowService.requestChanges(req.params.approvalId, reason, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/approvals/:approvalId/return-to-preparation', async (req, res) => {
  try {
    const { reason } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await workflowService.returnToPreparation(req.params.approvalId, reason, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/approvals/:approvalId/escalate', async (req, res) => {
  try {
    const { reason } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await workflowService.escalateApproval(req.params.approvalId, reason, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/approvals/:approvalId/supersede', async (req, res) => {
  try {
    const { supersededByApprovalId, reason } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await workflowService.supersedeApproval(req.params.approvalId, supersededByApprovalId, reason, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/approvals/:approvalId/evidence-pack', async (req, res) => {
  try {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    let record = null;
    if (!isProdLike) {
      record = evidenceService._mockState.evidence.get(req.params.approvalId);
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_cohort_intervention_approval_evidence WHERE approval_id = ?", [req.params.approvalId]);
      if (list.length > 0) record = list[0];
    }
    if (!record) return res.status(404).json({ ok: false, error: 'Evidence pack not found' });
    res.json({ ok: true, evidencePack: record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/preparations/:preparationId/approval-summary', async (req, res) => {
  try {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    let approval = null;
    if (!isProdLike) {
      for (const val of builderService._mockState.approvals.values()) {
        if (val.source_preparation_id === req.params.preparationId) {
          approval = val;
          break;
        }
      }
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_cohort_intervention_approvals WHERE source_preparation_id = ?", [req.params.preparationId]);
      if (list.length > 0) approval = list[0];
    }
    res.json({ ok: true, approval });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/cohorts/:cohortId/approval-readiness', async (req, res) => {
  try {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    let list = [];
    if (!isProdLike) {
      for (const val of builderService._mockState.approvals.values()) {
        if (val.cohort_id === req.params.cohortId) list.push(val);
      }
    } else {
      list = await db.query("SELECT * FROM controlled_beta_cohort_intervention_approvals WHERE cohort_id = ?", [req.params.cohortId]);
    }
    res.json({ ok: true, approvals: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
module.exports.serviceInstance = workflowService;
