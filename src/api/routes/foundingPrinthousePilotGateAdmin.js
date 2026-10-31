'use strict';

const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const FoundingPrinthousePilotGateService = require('../services/foundingPrinthousePilotGateService');

const svc = new FoundingPrinthousePilotGateService();

router.use(express.json());
router.use(requireAdmin);

const SAFETY_MARKERS = {
  pilotOnly: true,
  foundingPrinthouseOnly: true,
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
  productionHandoffAllowed: false,
  automaticProductionDispatch: false,
};

const SAFETY_MESSAGE =
  'Founding-printhouse pilot only. FULL_PUBLIC and open marketplace access remain disabled. ' +
  'No real payment/refund/payout/provider/tax/accounting execution is enabled.';

function safeResponse(data) {
  return { ok: true, ...data, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
}

router.get('/readiness', async (req, res) => {
  try {
    const result = await svc.getReadiness({ pilot_program_id: req.query.pilot_program_id });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/program/create', async (req, res) => {
  try {
    const result = await svc.createPilotProgram(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/participant/register', async (req, res) => {
  try {
    const result = await svc.registerFoundingPrinthouse(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/participant/approve', async (req, res) => {
  try {
    const result = await svc.approveParticipantForPilot(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/participant/suspend', async (req, res) => {
  try {
    const result = await svc.suspendParticipant(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/order/link', async (req, res) => {
  try {
    const result = await svc.linkInternalPilotOrder(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.get('/order-handoff-readiness', async (req, res) => {
  try {
    const result = await svc.evaluateOrderHandoffReadiness({ order_link_id: req.query.order_link_id });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/review', async (req, res) => {
  try {
    const result = await svc.submitPrinthouseReview(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/finding', async (req, res) => {
  try {
    const result = await svc.recordPilotFinding(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/resolve-finding', async (req, res) => {
  try {
    const result = await svc.resolvePilotFinding(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.get('/audit-timeline', async (req, res) => {
  try {
    const result = await svc.getPrinthousePilotAuditTimeline({
      pilot_program_id: req.query.pilot_program_id,
      participant_id: req.query.participant_id,
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.get('/evidence-pack', async (req, res) => {
  try {
    const result = await svc.buildPrinthousePilotEvidencePack({
      pilot_program_id: req.query.pilot_program_id,
      participant_id: req.query.participant_id,
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

module.exports = router;
