const express = require('express');
const router = express.Router();
const service = require('../services/controlledBetaRuntimeActivityObservationService').serviceInstance || require('../services/controlledBetaRuntimeActivityObservationService');

router.use((req, res, next) => {
  if (!req.admin) {
    return res.status(403).json({ ok: false, error: 'Admin access required' });
  }
  next();
});

router.get('/readiness/:observationGateId', async (req, res) => {
  try {
    const result = await service.evaluateRuntimeActivityObservationReadiness(req.params.observationGateId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates', async (req, res) => {
  try {
    const record = await service.createRuntimeActivityObservationGate(req.body);
    res.json({ ok: true, gate: record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:observationGateId/events', async (req, res) => {
  try {
    const { runtimeSessionId, eventType, status, featureKey, actionKey, occurredAt, metadata } = req.body;
    const record = await service.ingestRuntimeActivityEvent(
      req.params.observationGateId,
      runtimeSessionId,
      eventType,
      status,
      featureKey,
      actionKey,
      occurredAt,
      metadata
    );
    res.json({ ok: true, event: record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:observationGateId/blocked-attempts', async (req, res) => {
  try {
    const { runtimeSessionId, featureKey, actionKey, blockedReason, severity, details } = req.body;
    const record = await service.recordBlockedRuntimeAttempt(
      req.params.observationGateId,
      runtimeSessionId,
      featureKey,
      actionKey,
      blockedReason,
      severity,
      details
    );
    res.json({ ok: true, blockedAttempt: record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:observationGateId/anomaly-signals', async (req, res) => {
  try {
    const { runtimeSessionId, participantId, tenantId, cohortId, anomalyKey, severity, details } = req.body;
    const record = await service.recordRuntimeActivityAnomalySignal(
      req.params.observationGateId,
      runtimeSessionId,
      participantId,
      tenantId,
      cohortId,
      anomalyKey,
      severity,
      details
    );
    res.json({ ok: true, anomalySignal: record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:observationGateId/health-signals', async (req, res) => {
  try {
    const { runtimeSessionId, participantId, tenantId, cohortId, signalKey, status, severity, details } = req.body;
    const record = await service.recordRuntimeActivityHealthSignal(
      req.params.observationGateId,
      runtimeSessionId,
      participantId,
      tenantId,
      cohortId,
      signalKey,
      status,
      severity,
      details
    );
    res.json({ ok: true, healthSignal: record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:observationGateId/guardrails', async (req, res) => {
  try {
    const result = await service.runRuntimeActivityObservationGuardrails(req.params.observationGateId);
    res.json({ ok: result.ok, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:observationGateId/findings', async (req, res) => {
  try {
    const { severity, findingKey, details } = req.body;
    const record = await service.recordRuntimeActivityFinding(
      req.params.observationGateId,
      severity,
      findingKey,
      details
    );
    res.json({ ok: true, finding: record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:observationGateId/findings/:findingId/resolve', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await service.resolveRuntimeActivityFinding(req.params.findingId, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:observationGateId/participant-summary', async (req, res) => {
  try {
    const { participantId } = req.body;
    const summary = await service.buildParticipantUsageSummary(req.params.observationGateId, participantId);
    res.json({ ok: true, participantSummary: summary });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/cohorts/:cohortId/summary', async (req, res) => {
  try {
    const { tenantId } = req.body;
    const summary = await service.buildCohortUsageSummary(tenantId, req.params.cohortId);
    res.json({ ok: true, cohortSummary: summary });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/gates/:observationGateId/evidence-pack', async (req, res) => {
  try {
    const pack = await service.buildRuntimeActivityObservationEvidencePack(req.params.observationGateId);
    res.json({ ok: true, evidencePack: pack });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/gates/:observationGateId/audit-timeline', async (req, res) => {
  try {
    const timeline = await service.getRuntimeActivityObservationAuditTimeline(req.params.observationGateId);
    res.json({ ok: true, timeline });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const state = await service.getRuntimeActivityObservationDashboardState();
    res.json({ ok: true, dashboard: state });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
module.exports.serviceInstance = service;
