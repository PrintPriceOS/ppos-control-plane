'use strict';

const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const ControlledProductionPilotActivationService = require('../services/controlledProductionPilotActivationService');

const svc = new ControlledProductionPilotActivationService();

router.use(express.json());
router.use(requireAdmin);

const SAFETY_MARKERS = {
  controlledPilotOnly: true,
  fullPublicEnabled: false,
  openMarketplaceEnabled: false,
  unrestrictedLiveProviderConnectivityEnabled: false,
  paymentExecutionEnabled: false,
  refundExecutionEnabled: false,
  payoutExecutionEnabled: false,
  externalSubmission: false,
  sourceMutation: false,
  rollbackAvailable: true,
};

const SAFETY_MESSAGE =
  'Controlled pilot only. FULL_PUBLIC remains disabled. No unrestricted live provider connectivity, ' +
  'payment execution, refund execution, payout execution, tax/accounting submission, ' +
  'provider submission, or source record mutation is enabled.';

function safeResponse(data) {
  return { ok: true, ...data, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
}

router.get('/readiness', async (req, res) => {
  try {
    const result = await svc.evaluatePilotReadiness({ pilot_run_id: req.query.pilot_run_id });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/create', async (req, res) => {
  try {
    const result = await svc.createPilotRun({ ...req.body, created_by: req.body.created_by || 'admin' });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/register-tenant', async (req, res) => {
  try {
    const result = await svc.registerPilotTenant({ ...req.body, registered_by: req.body.registered_by || 'admin' });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/activate-tenant', async (req, res) => {
  try {
    const result = await svc.activatePilotForTenant(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/suspend-tenant', async (req, res) => {
  try {
    const result = await svc.suspendPilotTenant(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/finding', async (req, res) => {
  try {
    const result = await svc.recordPilotFinding({ ...req.body, created_by: req.body.created_by || 'admin' });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/resolve-finding', async (req, res) => {
  try {
    const result = await svc.resolvePilotFinding({ ...req.body, resolved_by: req.body.resolved_by || 'admin' });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/rollback-point', async (req, res) => {
  try {
    const result = await svc.createPilotRollbackPoint({ ...req.body, created_by: req.body.created_by || 'admin' });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/simulate-rollback', async (req, res) => {
  try {
    const result = await svc.simulatePilotRollback(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.get('/audit-timeline', async (req, res) => {
  try {
    const result = await svc.getPilotAuditTimeline({ pilot_run_id: req.query.pilot_run_id });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.get('/evidence-pack', async (req, res) => {
  try {
    const result = await svc.buildPilotEvidencePack({ pilot_run_id: req.query.pilot_run_id });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

module.exports = router;
