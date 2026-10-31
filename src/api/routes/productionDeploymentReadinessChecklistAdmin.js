'use strict';

const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const ChecklistService = require('../services/productionDeploymentReadinessChecklistService');

const svc = new ChecklistService();

router.use(express.json());
router.use(requireAdmin);

const SAFETY_MARKERS = {
  checklistOnly: true,
  deploymentExecuted: false,
  productionActivationEnabled: false,
  fullPublicEnabled: false,
  liveProviderConnectivityEnabled: false,
  paymentExecutionEnabled: false,
  refundExecutionEnabled: false,
  payoutExecutionEnabled: false,
  externalSubmission: false,
  sourceMutation: false,
};

const SAFETY_MESSAGE =
  'This is a checklist-only phase. No deployment, production activation, live provider ' +
  'connectivity, payment/refund/payout execution, external submission, or source mutation will occur.';

function safeResponse(data) {
  return { ok: true, ...data, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
}

// GET /checks
router.get('/checks', async (req, res) => {
  try {
    const result = await svc.evaluateEnvironmentReadiness({
      check_id: req.query.check_id || undefined,
      actor: req.query.actor || 'system',
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// POST /evaluate
router.post('/evaluate', async (req, res) => {
  try {
    const body = req.body || {};
    const result = await svc.buildDeploymentReadinessEvidencePack({
      check_id: body.check_id || undefined,
      actor: body.actor || 'system',
      board_reference_id: body.board_reference_id || null,
      backup_timestamp: body.backup_timestamp || null,
      rollback_script_documented: body.rollback_script_documented || false,
      escalation_contacts_documented: body.escalation_contacts_documented || false,
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// POST /finding
router.post('/finding', async (req, res) => {
  try {
    const result = await svc.recordFinding(req.body || {});
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// POST /resolve-finding
router.post('/resolve-finding', async (req, res) => {
  try {
    const result = await svc.resolveFinding(req.body || {});
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// GET /evidence-pack
router.get('/evidence-pack', async (req, res) => {
  try {
    const result = await svc.buildDeploymentReadinessEvidencePack({
      check_id: req.query.check_id || undefined,
      actor: req.query.actor || 'system',
      board_reference_id: req.query.board_reference_id || null,
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// GET /audit-timeline
router.get('/audit-timeline', async (req, res) => {
  try {
    const result = await svc.getAuditTimeline({
      check_id: req.query.check_id || undefined,
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

module.exports = router;
