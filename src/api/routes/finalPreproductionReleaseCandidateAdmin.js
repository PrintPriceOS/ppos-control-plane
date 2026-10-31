'use strict';

const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const FinalPreproductionReleaseCandidateService = require('../services/finalPreproductionReleaseCandidateService');

const svc = new FinalPreproductionReleaseCandidateService();

router.use(express.json());
router.use(requireAdmin);

const SAFETY_MARKERS = {
  reviewOnly: true,
  externalSubmission: false,
  sourceMutation: false,
  productionActivationEnabled: false,
  fullPublicEnabled: false,
  liveProviderConnectivityEnabled: false,
  paymentExecutionEnabled: false,
  refundExecutionEnabled: false,
  payoutExecutionEnabled: false,
};

const SAFETY_MESSAGE =
  'This is the final pre-production release candidate aggregator. ' +
  'No production deployment, no production activation, no live provider connectivity, ' +
  'no payment/refund/payout execution, no external submissions, and no source commercial record mutation will occur.';

function safeResponse(data) {
  return { ok: true, ...data, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
}

// POST /create
router.post('/create', async (req, res) => {
  try {
    const result = await svc.createReleaseCandidate({ ...req.body, created_by: req.body.created_by || 'admin' });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /aggregate
router.post('/aggregate', async (req, res) => {
  try {
    const result = await svc.aggregateReadinessEvidence({ ...req.body, actor: req.body.actor || 'admin' });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /evaluate
router.post('/evaluate', async (req, res) => {
  try {
    const result = await svc.evaluateReleaseCandidate({ ...req.body, actor: req.body.actor || 'admin' });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /finding
router.post('/finding', async (req, res) => {
  try {
    const result = await svc.recordFinding({ ...req.body, created_by: req.body.created_by || 'admin' });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /resolve-finding
router.post('/resolve-finding', async (req, res) => {
  try {
    const result = await svc.resolveFinding({ ...req.body, resolved_by: req.body.resolved_by || 'admin' });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /evidence-pack
router.get('/evidence-pack', async (req, res) => {
  try {
    const result = await svc.buildFinalEvidencePack({
      candidate_id: req.query.candidate_id,
      actor: req.query.actor || 'admin',
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
