const express = require('express');
const router = express.Router();
const service = require('../services/controlledBetaRuntimeSessionService');

router.use((req, res, next) => {
  if (!req.admin) {
    return res.status(403).json({ ok: false, error: 'Admin access required' });
  }
  next();
});

router.get('/readiness/:sessionGateId', async (req, res) => {
  try {
    const result = await service.evaluateRuntimeSessionReadiness(req.params.sessionGateId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates', async (req, res) => {
  try {
    const record = await service.createRuntimeSessionGate(req.body);
    res.json({ ok: true, gate: record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:sessionGateId/bind-acceptance', async (req, res) => {
  try {
    const { acceptanceGateId } = req.body;
    const result = await service.bindAcceptanceToSessionGate(req.params.sessionGateId, acceptanceGateId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:sessionGateId/session-limits', async (req, res) => {
  try {
    const { participantId, max_sessions, max_concurrent_sessions, session_ttl_minutes, daily_action_limit, feature_scope_json } = req.body;
    const record = await service.defineRuntimeSessionLimits(req.params.sessionGateId, participantId, {
      max_sessions,
      max_concurrent_sessions,
      session_ttl_minutes,
      daily_action_limit,
      feature_scope_json
    });
    res.json({ ok: true, sessionLimits: record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:sessionGateId/guardrails', async (req, res) => {
  try {
    const result = await service.runRuntimeSessionGuardrailChecks(req.params.sessionGateId);
    res.json({ ok: result.ok, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:sessionGateId/submit', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await service.submitRuntimeSessionGateForApproval(req.params.sessionGateId, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:sessionGateId/approve', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await service.approveRuntimeSessionGate(req.params.sessionGateId, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:sessionGateId/reject', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await service.rejectRuntimeSessionGate(req.params.sessionGateId, actorId, req.body.reason);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:sessionGateId/block', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const reasons = Array.isArray(req.body.reasons) ? req.body.reasons : [req.body.reason || 'Blocked by admin'];
    const result = await service.blockRuntimeSessionGate(req.params.sessionGateId, actorId, reasons);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:sessionGateId/sessions', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const record = await service.createControlledRuntimeSession(req.params.sessionGateId, actorId);
    res.json({ ok: true, session: record });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/sessions/:runtimeSessionId/feature-access', async (req, res) => {
  try {
    const { featureKey, contextScope } = req.body;
    const result = await service.evaluateRuntimeFeatureAccess(req.params.runtimeSessionId, featureKey, contextScope);
    if (!result.ok) {
      return res.status(403).json({ ok: false, ...result });
    }
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/sessions/:runtimeSessionId/heartbeat', async (req, res) => {
  try {
    const { metadata } = req.body;
    const record = await service.recordRuntimeSessionHeartbeat(req.params.runtimeSessionId, metadata);
    res.json({ ok: true, heartbeat: record });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/sessions/:runtimeSessionId/events', async (req, res) => {
  try {
    const { eventType, status, featureKey, details } = req.body;
    const record = await service.recordRuntimeSessionEvent(req.params.runtimeSessionId, eventType, status, featureKey, details);
    res.json({ ok: true, event: record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/sessions/:runtimeSessionId/close', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await service.closeRuntimeSession(req.params.runtimeSessionId, actorId, req.body.reason || 'Closed by user');
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/sessions/:runtimeSessionId/revoke', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await service.revokeRuntimeSession(req.params.runtimeSessionId, actorId, req.body.reason || 'Revoked by admin');
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/participants/:participantId/revoke-sessions', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await service.revokeParticipantRuntimeSessions(req.params.participantId, actorId, req.body.reason || 'Mass revocation by admin');
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/expire', async (req, res) => {
  try {
    const result = await service.expireRuntimeSessions();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/gates/:sessionGateId/evidence-pack', async (req, res) => {
  try {
    const pack = await service.buildRuntimeSessionEvidencePack(req.params.sessionGateId);
    res.json({ ok: true, evidencePack: pack });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/gates/:sessionGateId/audit-timeline', async (req, res) => {
  try {
    const timeline = await service.getRuntimeSessionAuditTimeline(req.params.sessionGateId);
    res.json({ ok: true, timeline });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const state = await service.getRuntimeSessionDashboardState();
    res.json({ ok: true, dashboard: state });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
module.exports.serviceInstance = service;
