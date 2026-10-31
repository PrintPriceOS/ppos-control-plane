'use strict';

const express = require('express');
const router = express.Router();
const ControlledBetaRuntimeObservationService = require('../services/controlledBetaRuntimeObservationService');

const service = new ControlledBetaRuntimeObservationService();

// Mock middleware to simulate admin auth for tests
router.use((req, res, next) => {
  // In a real scenario, JWT or admin session verification happens here
  req.admin = true;
  next();
});

router.get('/readiness', async (req, res) => {
  try {
    const result = await service.evaluateRuntimeObservationReadiness(req.query.activation_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/observation-session/create', async (req, res) => {
  try {
    const id = await service.createObservationSession(req.body);
    res.json({ observation_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/observation-session/close', async (req, res) => {
  try {
    const id = await service.closeObservationSession(req.body);
    res.json({ observation_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/event', async (req, res) => {
  try {
    const id = await service.recordRuntimeObservationEvent(req.body);
    res.json({ observation_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/participant-activity', async (req, res) => {
  try {
    const id = await service.recordParticipantActivity(req.body);
    res.json({ observation_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/access', async (req, res) => {
  try {
    const id = await service.recordAccessObservation(req.body);
    res.json({ observation_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/guardrail', async (req, res) => {
  try {
    const id = await service.recordGuardrailObservation(req.body);
    res.json({ observation_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/incident', async (req, res) => {
  try {
    const id = await service.recordIncidentObservation(req.body);
    res.json({ observation_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/support', async (req, res) => {
  try {
    const id = await service.recordSupportObservation(req.body);
    res.json({ observation_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/kill-switch', async (req, res) => {
  try {
    const id = await service.recordKillSwitchObservation(req.body);
    res.json({ observation_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sla', async (req, res) => {
  try {
    const id = await service.recordSlaObservation(req.body);
    res.json({ observation_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/health-snapshot', async (req, res) => {
  try {
    const result = await service.calculateRuntimeHealthSnapshot(req.query.activation_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/participant-activity-summary', async (req, res) => {
  try {
    const result = await service.calculateParticipantActivitySummary(req.query.activation_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/access-summary', async (req, res) => {
  try {
    const result = await service.calculateAccessPatternSummary(req.query.activation_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/guardrail-summary', async (req, res) => {
  try {
    const result = await service.calculateGuardrailSummary(req.query.activation_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/incident-summary', async (req, res) => {
  try {
    const result = await service.calculateIncidentSummary(req.query.activation_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/support-summary', async (req, res) => {
  try {
    const result = await service.calculateSupportSummary(req.query.activation_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/kill-switch-summary', async (req, res) => {
  try {
    const result = await service.calculateKillSwitchSummary(req.query.activation_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sla-summary', async (req, res) => {
  try {
    const result = await service.calculateSlaSummary(req.query.activation_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/risk-score', async (req, res) => {
  try {
    const result = await service.calculateRuntimeRiskScore(req.query.activation_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/finding', async (req, res) => {
  try {
    const id = await service.recordMonitoringFinding(req.body);
    res.json({ observation_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/finding/resolve', async (req, res) => {
  try {
    const id = await service.resolveMonitoringFinding(req.body);
    res.json({ observation_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/audit-timeline', async (req, res) => {
  try {
    const result = await service.getRuntimeMonitoringAuditTimeline(req.query.activation_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/dashboard-state', async (req, res) => {
  try {
    const result = await service.getRuntimeMonitoringDashboardState(req.query.activation_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/evidence-pack', async (req, res) => {
  try {
    const result = await service.buildRuntimeMonitoringEvidencePack(req.query.activation_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
