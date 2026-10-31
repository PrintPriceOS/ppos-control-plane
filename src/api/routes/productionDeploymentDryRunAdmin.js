'use strict';

const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const DryRunService = require('../services/productionDeploymentDryRunRollbackDrillService');

const svc = new DryRunService();

router.use(express.json());
router.use(requireAdmin);

const SAFETY_MARKERS = {
  deploymentDryRunOnly: true,
  realDeploymentExecuted: false,
  serviceRestartExecuted: false,
  rollbackExecuted: false,
  sourceMutation: false,
  externalSubmission: false,
  productionActivationEnabled: false,
  fullPublicEnabled: false,
  liveProviderConnectivityEnabled: false,
  paymentExecutionEnabled: false,
  refundExecutionEnabled: false,
  payoutExecutionEnabled: false,
};

const SAFETY_MESSAGE =
  'This is a dry-run only phase. No real deployment, service restart, rollback, production activation, ' +
  'live provider connectivity, payment/refund/payout execution, external submission, or source mutation will occur.';

function safeResponse(data) {
  return { ok: true, ...data, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
}

// GET /readiness
router.get('/readiness', async (req, res) => {
  try {
    const result = await svc.evaluateDeploymentDryRunReadiness({
      dry_run_id: req.query.dry_run_id || undefined,
      actor: req.query.actor || 'system',
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// POST /create
router.post('/create', async (req, res) => {
  try {
    const body = req.body || {};
    const result = await svc.createDeploymentDryRun({
      dry_run_id: body.dry_run_id || undefined,
      readiness_reference_id: body.readiness_reference_id || undefined,
      requested_by: body.requested_by || 'admin',
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// POST /execute
router.post('/execute', async (req, res) => {
  try {
    const body = req.body || {};
    const result = await svc.executeDeploymentDryRun({
      dry_run_id: body.dry_run_id || undefined,
      actor: body.actor || 'admin',
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// POST /simulate-rollback
router.post('/simulate-rollback', async (req, res) => {
  try {
    const body = req.body || {};
    const result = await svc.simulateRollback({
      dry_run_id: body.dry_run_id || undefined,
      actor: body.actor || 'admin',
      rollback_scenario: body.rollback_scenario || 'STANDARD_ROLLBACK',
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// GET /steps
router.get('/steps', async (req, res) => {
  try {
    const result = await svc.getDryRunSteps({
      dry_run_id: req.query.dry_run_id || undefined,
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// GET /audit-timeline
router.get('/audit-timeline', async (req, res) => {
  try {
    const result = await svc.getDryRunAuditTimeline({
      dry_run_id: req.query.dry_run_id || undefined,
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// GET /evidence-pack
router.get('/evidence-pack', async (req, res) => {
  try {
    const result = await svc.buildDeploymentDryRunEvidencePack({
      dry_run_id: req.query.dry_run_id || undefined,
      actor: req.query.actor || 'system',
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

module.exports = router;
