'use strict';

const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const InternalOrderLifecyclePilotService = require('../services/internalOrderLifecyclePilotService');

const svc = new InternalOrderLifecyclePilotService();

router.use(express.json());
router.use(requireAdmin);

const SAFETY_MARKERS = {
  pilotOnly: true,
  internalOrderLifecycleOnly: true,
  reviewOnly: true,
  fullPublicEnabled: false,
  openMarketplaceAccessEnabled: false,
  liveProviderConnectivityEnabled: false,
  paymentExecutionEnabled: false,
  refundExecutionEnabled: false,
  payoutExecutionEnabled: false,
  externalTaxSubmissionEnabled: false,
  externalAccountingSubmissionEnabled: false,
  providerExternalSubmissionEnabled: false,
  sourceMutationOutsidePilotScope: false,
};

const SAFETY_MESSAGE =
  'Internal order lifecycle pilot only. FULL_PUBLIC remains disabled. No open marketplace access, ' +
  'unrestricted live provider connectivity, payment execution, refund execution, payout execution, ' +
  'tax/accounting submission, provider submission, or source record mutation outside pilot scope is enabled.';

function safeResponse(data) {
  return { ok: true, ...data, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
}

router.get('/readiness', async (req, res) => {
  try {
    const result = await svc.evaluatePilotLifecycleReadiness({
      pilot_run_id: req.query.pilot_run_id,
      tenant_id: req.query.tenant_id,
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/create-run', async (req, res) => {
  try {
    const result = await svc.createPilotLifecycleRun(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/create-order', async (req, res) => {
  try {
    const result = await svc.createInternalPilotOrder(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/execute-lifecycle', async (req, res) => {
  try {
    const result = await svc.executeInternalOrderLifecycle(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/rollback-point', async (req, res) => {
  try {
    const result = await svc.createRollbackPoint(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/simulate-rollback', async (req, res) => {
  try {
    const result = await svc.simulateLifecycleRollback(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/finding', async (req, res) => {
  try {
    const result = await svc.recordLifecycleFinding(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/resolve-finding', async (req, res) => {
  try {
    const result = await svc.resolveLifecycleFinding(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.get('/steps', async (req, res) => {
  try {
    const result = await svc.listLifecycleSteps({
      pilot_run_id: req.query.pilot_run_id,
      pilot_order_id: req.query.pilot_order_id,
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.get('/audit-timeline', async (req, res) => {
  try {
    const result = await svc.getLifecycleAuditTimeline({
      pilot_run_id: req.query.pilot_run_id,
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.get('/evidence-pack', async (req, res) => {
  try {
    const result = await svc.buildInternalOrderLifecycleEvidencePack({
      pilot_run_id: req.query.pilot_run_id,
      pilot_order_id: req.query.pilot_order_id,
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

module.exports = router;
