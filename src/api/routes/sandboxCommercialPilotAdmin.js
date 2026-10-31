'use strict';

const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const SandboxCommercialPilotService = require('../services/sandboxCommercialPilotService');

const svc = new SandboxCommercialPilotService();

router.use(express.json());
router.use(requireAdmin);

const SAFETY_MARKERS = {
  pilotOnly: true,
  sandboxOnly: true,
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
  providerLiveCaptureEnabled: false,
  sourceMutationOutsidePilotScope: false,
  productionActivationEnabled: false,
  invoiceIssued: false,
  invoicePreviewOnly: true,
  paymentSimulationOnly: true,
  payoutPreviewOnly: true,
};

const SAFETY_MESSAGE =
  'Sandbox commercial pilot only. No real payment, refund, payout, tax submission, ' +
  'accounting submission, or provider capture is executed. ' +
  'FULL_PUBLIC and open marketplace access remain disabled.';

function safeResponse(data) {
  return { ok: true, ...data, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
}

router.get('/readiness', async (req, res) => {
  try {
    const result = await svc.getReadiness({ sandbox_run_id: req.query.sandbox_run_id });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/create', async (req, res) => {
  try {
    const result = await svc.createSandboxCommercialRun(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/invoice-preview', async (req, res) => {
  try {
    const result = await svc.buildInvoicePreview(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/simulate-payment', async (req, res) => {
  try {
    const result = await svc.simulatePaymentIntent(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/simulate-refund', async (req, res) => {
  try {
    const result = await svc.simulateRefundScenario(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/simulate-payout', async (req, res) => {
  try {
    const result = await svc.simulatePayoutScenario(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/settlement-preview', async (req, res) => {
  try {
    const result = await svc.buildSettlementPreview(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/printhouse-confirmation', async (req, res) => {
  try {
    const result = await svc.submitPrinthouseCommercialConfirmation(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/finding', async (req, res) => {
  try {
    const result = await svc.recordCommercialFinding(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/resolve-finding', async (req, res) => {
  try {
    const result = await svc.resolveCommercialFinding(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.get('/audit-timeline', async (req, res) => {
  try {
    const result = await svc.getCommercialAuditTimeline({
      sandbox_run_id: req.query.sandbox_run_id,
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.get('/evidence-pack', async (req, res) => {
  try {
    const result = await svc.buildCommercialEvidencePack({
      sandbox_run_id: req.query.sandbox_run_id,
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

module.exports = router;
