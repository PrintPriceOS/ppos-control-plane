const express = require('express');
const router = express.Router();
const ControlledBetaInviteIssuanceService = require('../services/controlledBetaInviteIssuanceService');
const service = new ControlledBetaInviteIssuanceService();

router.use((req, res, next) => {
  if (!req.admin) {
    return res.status(403).json({ ok: false, error: 'Admin access required' });
  }
  next();
});

router.get('/readiness/:issuanceGateId', async (req, res) => {
  try {
    const result = await service.evaluateInviteIssuanceReadiness(req.params.issuanceGateId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates', async (req, res) => {
  try {
    const record = await service.createInviteIssuanceGate(req.body);
    res.json({ ok: true, gate: record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:issuanceGateId/bind-preparation', async (req, res) => {
  try {
    const { preparationId, evidencePackId } = req.body;
    await service.bindPreparationToIssuanceGate(req.params.issuanceGateId, preparationId, evidencePackId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:issuanceGateId/batches', async (req, res) => {
  try {
    const record = await service.createInviteIssuanceBatch({
      issuance_gate_id: req.params.issuanceGateId,
      ...req.body
    });
    res.json({ ok: true, batch: record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/batches/:issuanceBatchId/recipients', async (req, res) => {
  try {
    const record = await service.addInviteIssuanceRecipient({
      issuance_batch_id: req.params.issuanceBatchId,
      ...req.body
    });
    res.json({ ok: true, recipient: record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/batches/:issuanceBatchId/validate', async (req, res) => {
  try {
    const result = await service.validateInviteIssuanceBatch(req.params.issuanceBatchId);
    res.json({ ok: result.ok, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:issuanceGateId/guardrails', async (req, res) => {
  try {
    const result = await service.runInviteIssuanceGuardrailChecks(req.params.issuanceGateId);
    res.json({ ok: result.ok, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:issuanceGateId/submit', async (req, res) => {
  try {
    const result = await service.submitInviteIssuanceForApproval(req.params.issuanceGateId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:issuanceGateId/approve', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await service.approveInviteIssuance(req.params.issuanceGateId, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:issuanceGateId/reject', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await service.rejectInviteIssuance(req.params.issuanceGateId, actorId, req.body.reason);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gates/:issuanceGateId/block', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await service.blockInviteIssuance(req.params.issuanceGateId, actorId, req.body.reason);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/batches/:issuanceBatchId/issue', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const records = await service.issueApprovedInviteBatch(req.params.issuanceBatchId, actorId);
    res.json({ ok: true, invites: records });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/invites/:inviteRecordId/revoke', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await service.revokeIssuedInvite(req.params.inviteRecordId, actorId, req.body.reason);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/batches/:issuanceBatchId/revoke', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await service.revokeInviteBatch(req.params.issuanceBatchId, actorId, req.body.reason);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/gates/:issuanceGateId/evidence-pack', async (req, res) => {
  try {
    const pack = await service.buildInviteIssuanceEvidencePack(req.params.issuanceGateId);
    res.json({ ok: true, evidencePack: pack });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/gates/:issuanceGateId/audit-timeline', async (req, res) => {
  try {
    const timeline = await service.getInviteIssuanceAuditTimeline(req.params.issuanceGateId);
    res.json({ ok: true, timeline });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const state = await service.getInviteIssuanceDashboardState();
    res.json({ ok: true, dashboard: state });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
module.exports.serviceInstance = service;
