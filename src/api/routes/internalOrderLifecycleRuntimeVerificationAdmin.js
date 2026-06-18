'use strict';

const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const InternalOrderLifecycleRuntimeVerificationService = require('../services/internalOrderLifecycleRuntimeVerificationService');

const svc = new InternalOrderLifecycleRuntimeVerificationService();

router.use(express.json());
router.use(requireAdmin);

const SAFETY_MARKERS = {
  pilotOnly: true,
  runtimeVerificationOnly: true,
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
  productionActivationEnabled: false,
  serviceRestartExecuted: false,
  realRestartExecuted: false,
};

const SAFETY_MESSAGE =
  'Runtime verification / restart recovery drill only. No real restart is executed by code. ' +
  'All restart actions are manual/documented. FULL_PUBLIC remains disabled.';

function safeResponse(data) {
  return { ok: true, ...data, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
}

router.get('/readiness', async (req, res) => {
  try {
    const result = await svc.getReadiness({
      verification_run_id: req.query.verification_run_id,
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/create', async (req, res) => {
  try {
    const result = await svc.createRuntimeVerificationRun(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/verify-db-read-through', async (req, res) => {
  try {
    const result = await svc.verifyDbReadThrough(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/verify-memory-empty-recovery', async (req, res) => {
  try {
    const result = await svc.verifyMemoryEmptyRecovery(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/verify-audit-recovery', async (req, res) => {
  try {
    const result = await svc.verifyAuditTimelineRecovery(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/verify-evidence-recovery', async (req, res) => {
  try {
    const result = await svc.verifyEvidencePackRecovery(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/verify-allowlist', async (req, res) => {
  try {
    const result = await svc.verifyAllowlistFailClosedRuntime(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/verify-blockers', async (req, res) => {
  try {
    const result = await svc.verifyBlockerFindingRuntime(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.get('/audit-timeline', async (req, res) => {
  try {
    const result = await svc.getVerificationAuditTimeline({
      verification_run_id: req.query.verification_run_id,
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.get('/evidence-pack', async (req, res) => {
  try {
    const result = await svc.buildRuntimeVerificationEvidencePack({
      verification_run_id: req.query.verification_run_id,
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

module.exports = router;
