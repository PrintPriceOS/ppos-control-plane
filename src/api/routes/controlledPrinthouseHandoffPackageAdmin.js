'use strict';

const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const ControlledPrinthouseHandoffPackageService = require('../services/controlledPrinthouseHandoffPackageService');

const svc = new ControlledPrinthouseHandoffPackageService();

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
  productionDispatchEnabled: false,
  automaticProductionDispatch: false,
  unrestrictedFileAccess: false,
  permanentPublicUrl: false,
};

const SAFETY_MESSAGE =
  'Controlled printhouse handoff / file package pilot only. FULL_PUBLIC and open marketplace access remain disabled. ' +
  'No automatic production dispatch. No unrestricted file access. No permanent public URLs. ' +
  'No real payment/refund/payout/provider/tax/accounting execution is enabled.';

function safeResponse(data) {
  return { ok: true, ...data, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
}

router.get('/readiness', async (req, res) => {
  try {
    const result = await svc.getReadiness({ handoff_package_id: req.query.handoff_package_id });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/create', async (req, res) => {
  try {
    const result = await svc.createHandoffPackage(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/file-metadata', async (req, res) => {
  try {
    const result = await svc.addPackageFileMetadata(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/access-grant', async (req, res) => {
  try {
    const result = await svc.createScopedFileAccessGrant(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/revoke-access', async (req, res) => {
  try {
    const result = await svc.revokeFileAccessGrant(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/review', async (req, res) => {
  try {
    const result = await svc.submitPrinthouseHandoffReview(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/accept', async (req, res) => {
  try {
    const result = await svc.acceptHandoffPackage(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/reject', async (req, res) => {
  try {
    const result = await svc.rejectHandoffPackage(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/finding', async (req, res) => {
  try {
    const result = await svc.recordHandoffFinding(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/resolve-finding', async (req, res) => {
  try {
    const result = await svc.resolveHandoffFinding(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.get('/audit-timeline', async (req, res) => {
  try {
    const result = await svc.getHandoffAuditTimeline({
      handoff_package_id: req.query.handoff_package_id,
      pilot_program_id: req.query.pilot_program_id,
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.get('/evidence-pack', async (req, res) => {
  try {
    const result = await svc.buildHandoffEvidencePack({
      handoff_package_id: req.query.handoff_package_id,
      pilot_program_id: req.query.pilot_program_id,
      participant_id: req.query.participant_id,
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

module.exports = router;
