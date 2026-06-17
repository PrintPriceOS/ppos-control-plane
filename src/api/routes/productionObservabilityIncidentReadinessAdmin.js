'use strict';

const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const IncidentReadinessService = require('../services/productionObservabilityIncidentReadinessService');

const svc = new IncidentReadinessService();

router.use(express.json());
router.use(requireAdmin);

const SAFETY_MARKERS = {
  simulationOnly: true,
  realAlertDispatched: false,
  productionMutationEnabled: false,
  externalSubmission: false,
  paymentExecutionEnabled: false,
  refundExecutionEnabled: false,
  payoutExecutionEnabled: false,
  fullPublicEnabled: false,
  liveProviderConnectivityEnabled: false,
  sourceMutation: false,
};

const SAFETY_MESSAGE =
  'This is a simulation-only phase. No real alerts are dispatched, no production is mutated, ' +
  'no financial/provider execution occurs, and no external submissions are made.';

function safeResponse(data) {
  return { ok: true, ...data, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
}

// GET /readiness
router.get('/readiness', async (req, res) => {
  try {
    const result = await svc.evaluateObservabilityReadiness({
      run_id: req.query.run_id || undefined,
      actor: req.query.actor || 'system',
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// POST /simulate-incident
router.post('/simulate-incident', async (req, res) => {
  try {
    const body = req.body || {};
    const result = await svc.simulateIncident({
      run_id: body.run_id || undefined,
      actor: body.actor || 'admin',
      incident_category: body.incident_category || 'API_DOWN',
      severity: body.severity || 'MEDIUM',
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// POST /simulate-alert
router.post('/simulate-alert', async (req, res) => {
  try {
    const body = req.body || {};
    const result = await svc.simulateAlertDispatch({
      run_id: body.run_id || undefined,
      actor: body.actor || 'admin',
      alert_type: body.alert_type || 'GENERIC_ALERT',
      sink: body.sink || 'INTERNAL_TEST_SINK_ONLY',
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// POST /finding
router.post('/finding', async (req, res) => {
  try {
    const body = req.body || {};
    const result = await svc.recordIncidentFinding({
      run_id: body.run_id || undefined,
      actor: body.actor || 'admin',
      category: body.category || 'OBSERVABILITY_GAP',
      description: body.description || '',
      severity: body.severity || 'MEDIUM',
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// POST /resolve-finding
router.post('/resolve-finding', async (req, res) => {
  try {
    const body = req.body || {};
    const result = await svc.resolveIncidentFinding({
      run_id: body.run_id || undefined,
      finding_id: body.finding_id,
      actor: body.actor || 'admin',
      resolution: body.resolution || 'Resolved',
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// GET /evidence-pack
router.get('/evidence-pack', async (req, res) => {
  try {
    const result = await svc.buildIncidentReadinessEvidencePack({
      run_id: req.query.run_id || undefined,
      actor: req.query.actor || 'system',
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

module.exports = router;
