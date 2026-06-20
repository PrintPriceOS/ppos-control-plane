const express = require('express');
const router = express.Router();
const service = require('../services/controlledBetaInviteAcceptanceService');

router.use((req, res, next) => {
  if (!req.admin) {
    return res.status(403).json({ ok: false, error: 'Admin access required' });
  }
  next();
});

router.get('/readiness/:acceptanceGateId', async (req, res) => {
  try {
    const result = await service.evaluateInviteAcceptanceReadiness(req.params.acceptanceGateId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates', async (req, res) => {
  try {
    const record = await service.createInviteAcceptanceGate(req.body);
    res.json({ ok: true, gate: record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:acceptanceGateId/claim', async (req, res) => {
  try {
    const { code, token, claimAttemptHash, ip, userAgent } = req.body;
    const clientIp = ip || req.ip || '127.0.0.1';
    const clientUa = userAgent || req.headers['user-agent'] || 'Unknown';
    const record = await service.verifyInviteClaim(req.params.acceptanceGateId, code, token, claimAttemptHash, clientIp, clientUa);
    res.json({ ok: true, claim: record });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:acceptanceGateId/bind-identity', async (req, res) => {
  try {
    const { externalRef, email, label } = req.body;
    const record = await service.bindParticipantIdentity(req.params.acceptanceGateId, externalRef, email, label);
    res.json({ ok: true, participant: record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:acceptanceGateId/terms', async (req, res) => {
  try {
    const { participantId, termsVersion, termsHash, acceptedBy, method } = req.body;
    const record = await service.recordTermsAcceptance(req.params.acceptanceGateId, participantId, termsVersion, termsHash, acceptedBy, method);
    res.json({ ok: true, termsAcceptance: record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:acceptanceGateId/session-limits', async (req, res) => {
  try {
    const { participantId, max_sessions, max_concurrent_sessions, session_ttl_minutes, daily_action_limit, feature_scope_json } = req.body;
    const record = await service.defineOnboardingSessionLimits(req.params.acceptanceGateId, participantId, {
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

router.post('/gates/:acceptanceGateId/access-policy', async (req, res) => {
  try {
    const { participantId, policy_status, allowed_features_json, denied_features_json, runtime_scope_json } = req.body;
    const record = await service.defineOnboardingAccessPolicy(req.params.acceptanceGateId, participantId, {
      policy_status,
      allowed_features_json,
      denied_features_json,
      runtime_scope_json
    });
    res.json({ ok: true, accessPolicy: record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:acceptanceGateId/guardrails', async (req, res) => {
  try {
    const result = await service.runOnboardingGuardrailChecks(req.params.acceptanceGateId);
    res.json({ ok: result.ok, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:acceptanceGateId/submit', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await service.submitOnboardingForApproval(req.params.acceptanceGateId, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:acceptanceGateId/approve', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await service.approveOnboarding(req.params.acceptanceGateId, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:acceptanceGateId/reject', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await service.rejectOnboarding(req.params.acceptanceGateId, actorId, req.body.reason);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:acceptanceGateId/block', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const reasons = Array.isArray(req.body.reasons) ? req.body.reasons : [req.body.reason || 'Blocked by admin'];
    const result = await service.blockOnboarding(req.params.acceptanceGateId, actorId, reasons);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:acceptanceGateId/grant-runtime-access', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await service.grantControlledRuntimeAccess(req.params.acceptanceGateId, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:acceptanceGateId/revoke', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await service.revokeParticipantOnboarding(req.params.acceptanceGateId, actorId, req.body.reason);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/gates/:acceptanceGateId/evidence-pack', async (req, res) => {
  try {
    const pack = await service.buildOnboardingEvidencePack(req.params.acceptanceGateId);
    res.json({ ok: true, evidencePack: pack });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/gates/:acceptanceGateId/audit-timeline', async (req, res) => {
  try {
    const timeline = await service.getOnboardingAuditTimeline(req.params.acceptanceGateId);
    res.json({ ok: true, timeline });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const state = await service.getOnboardingDashboardState();
    res.json({ ok: true, dashboard: state });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
module.exports.serviceInstance = service;
