'use strict';

const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const DryRunService = require('../services/financialOperationsProductionActivationDryRunService');

const svc = new DryRunService();

router.use(express.json());
router.use(requireAdmin);

const SAFETY_MARKERS = {
  dryRunOnly: true,
  reviewOnly: true,
  externalSubmission: false,
  sourceMutation: false,
  fullPublicEnabled: false,
  liveProviderConnectivityEnabled: false,
  paymentExecutionEnabled: false,
  refundExecutionEnabled: false,
  payoutExecutionEnabled: false,
};

const SAFETY_MESSAGE =
  'This is a dry-run only. No production activation, live provider connectivity, ' +
  'payment execution, refund execution, payout execution, tax/accounting submission, ' +
  'provider submission, or source record mutation will occur.';

function safeResponse(data) {
  return {
    ok: true,
    ...data,
    safety: SAFETY_MARKERS,
    safety_message: SAFETY_MESSAGE,
  };
}

// GET /readiness
router.get('/readiness', async (req, res) => {
  try {
    const result = await svc.evaluateDryRunReadiness({
      gate_reference_id: req.query.gate_reference_id || null,
      dry_run_id: req.query.dry_run_id || null,
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// POST /create
router.post('/create', async (req, res) => {
  try {
    const result = await svc.createDryRun(req.body || {});
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// POST /execute
router.post('/execute', async (req, res) => {
  try {
    const result = await svc.executeDryRun(req.body || {});
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// POST /simulate-rollback
router.post('/simulate-rollback', async (req, res) => {
  try {
    const result = await svc.simulateRollback(req.body || {});
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// GET /steps
router.get('/steps', async (req, res) => {
  try {
    const dryRunId = req.query.dry_run_id;
    if (!dryRunId) {
      return res.status(400).json({ ok: false, error: 'dry_run_id is required', safety: SAFETY_MARKERS });
    }
    const result = await svc.listDryRunSteps({ dry_run_id: dryRunId });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// GET /audit-timeline
router.get('/audit-timeline', async (req, res) => {
  try {
    const dryRunId = req.query.dry_run_id;
    if (!dryRunId) {
      return res.status(400).json({ ok: false, error: 'dry_run_id is required', safety: SAFETY_MARKERS });
    }
    const result = await svc.getDryRunAuditTimeline({ dry_run_id: dryRunId });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// GET /evidence-pack
router.get('/evidence-pack', async (req, res) => {
  try {
    const dryRunId = req.query.dry_run_id;
    if (!dryRunId) {
      return res.status(400).json({ ok: false, error: 'dry_run_id is required', safety: SAFETY_MARKERS });
    }
    const result = await svc.buildDryRunEvidencePack({ dry_run_id: dryRunId });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

module.exports = router;
