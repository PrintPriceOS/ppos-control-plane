'use strict';

const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const PrelaunchSecurityComplianceHardeningService = require('../services/prelaunchSecurityComplianceHardeningService');

const svc = new PrelaunchSecurityComplianceHardeningService();

router.use(express.json());
router.use(requireAdmin);

const SAFETY_MARKERS = {
  reviewOnly: true,
  externalSubmission: false,
  sourceMutation: false,
  productionActivationEnabled: false,
  paymentExecutionEnabled: false,
  refundExecutionEnabled: false,
  payoutExecutionEnabled: false,
  fullPublicEnabled: false,
  liveProviderConnectivityEnabled: false,
};

const SAFETY_MESSAGE =
  'This is a review-only security hardening phase. No production activation, no external submission, ' +
  'no secret exposure, no financial/provider execution, and no source commercial record mutation will occur.';

function safeResponse(data) {
  return { ok: true, ...data, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
}

// GET /scan/env-exposure
router.get('/scan/env-exposure', async (req, res) => {
  try {
    const result = await svc.scanEnvExposure({ actor: req.query.actor || 'admin' });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /scan/admin-routes
router.get('/scan/admin-routes', async (req, res) => {
  try {
    const result = await svc.scanAdminRouteProtection({ actor: req.query.actor || 'admin' });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /scan/secret-leakage
router.get('/scan/secret-leakage', async (req, res) => {
  try {
    const result = await svc.scanSecretLeakagePatterns({ actor: req.query.actor || 'admin' });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /scan/redaction
router.get('/scan/redaction', async (req, res) => {
  try {
    const result = await svc.scanRedactionCoverage({ actor: req.query.actor || 'admin' });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /scan/role-boundaries
router.get('/scan/role-boundaries', async (req, res) => {
  try {
    const result = await svc.evaluateRoleBoundaryReadiness({ actor: req.query.actor || 'admin' });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /scan/compliance-guardrails
router.get('/scan/compliance-guardrails', async (req, res) => {
  try {
    const result = await svc.evaluateComplianceGuardrails({ actor: req.query.actor || 'admin' });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /finding
router.post('/finding', async (req, res) => {
  try {
    const result = await svc.recordSecurityFinding({ ...req.body, created_by: req.body.created_by || 'admin' });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /resolve-finding
router.post('/resolve-finding', async (req, res) => {
  try {
    const result = await svc.resolveSecurityFinding({ ...req.body, resolved_by: req.body.resolved_by || 'admin' });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /evidence-pack
router.get('/evidence-pack', async (req, res) => {
  try {
    const result = await svc.buildSecurityComplianceEvidencePack({ actor: req.query.actor || 'admin' });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
