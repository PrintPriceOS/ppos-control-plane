'use strict';

const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const LimitedBetaRuntimeService = require('../services/limitedBetaRuntimeService');

const svc = new LimitedBetaRuntimeService();

router.use(express.json());
router.use(requireAdmin);

const SAFETY_MARKERS = {
  betaRuntimeEnabled: false,
  fullPublicEnabled: false,
  openMarketplaceEnabled: false,
  liveProviderConnectivityEnabled: false,
  paymentExecutionEnabled: false,
  refundExecutionEnabled: false,
  payoutExecutionEnabled: false,
  providerExternalSubmissionEnabled: false,
  externalTaxSubmissionEnabled: false,
  externalAccountingSubmissionEnabled: false,
  sourceMutationEnabled: false,
};

const SAFETY_MESSAGE =
  'Invite-Only Limited Beta Runtime. ' +
  'This does not enable FULL_PUBLIC, open marketplace access, payment execution, refund execution, payout execution, provider external submission, tax/accounting submission, or uncontrolled source mutation.';

function safeResponse(data) {
  // Scoped betaRuntimeEnabled is set depending on data response
  const betaEnabled = data && (data.betaRuntimeEnabled === true || (data.session && data.session.beta_runtime_enabled === 1));
  return {
    ok: true,
    persistenceMode: data.persistenceMode || 'MEMORY_FALLBACK',
    persistenceStatus: data.persistenceStatus || 'FALLBACK_ONLY',
    runtimeTruthStatus: data.runtimeTruthStatus || 'DEGRADED',
    betaRuntimeEnabled: betaEnabled ? 'SCOPED_ONLY' : false,
    fullPublicEnabled: false,
    openMarketplaceEnabled: false,
    paymentExecutionEnabled: false,
    sourceMutationEnabled: false,
    ...data,
    safety: { ...SAFETY_MARKERS, betaRuntimeEnabled: betaEnabled ? 'SCOPED_ONLY' : false },
    safety_message: SAFETY_MESSAGE
  };
}

router.get('/readiness', async (req, res) => {
  try {
    const result = await svc.evaluateRuntimeActivationReadiness(req.query.gate_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/scope-policy/create', async (req, res) => {
  try {
    const result = await svc.createRuntimeScopePolicy(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/scope-policy/update', async (req, res) => {
  try {
    const result = await svc.updateRuntimeScopePolicy(req.body.policy_id, req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/runtime/enable', async (req, res) => {
  try {
    const result = await svc.enableRuntimeForGate(req.body.gate_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/runtime/disable', async (req, res) => {
  try {
    const result = await svc.disableRuntimeForGate(req.body.gate_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/access-grant/create', async (req, res) => {
  try {
    const result = await svc.createRuntimeAccessGrant(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/access-grant/revoke', async (req, res) => {
  try {
    const result = await svc.revokeRuntimeAccessGrant(req.body.grant_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/access/evaluate', async (req, res) => {
  try {
    const result = await svc.evaluateRuntimeAccess(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/session/create', async (req, res) => {
  try {
    const result = await svc.createRuntimeSession(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/session/terminate', async (req, res) => {
  try {
    const result = await svc.terminateRuntimeSession(req.body.session_id, req.body.reason);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/activity', async (req, res) => {
  try {
    const result = await svc.recordRuntimeActivity(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/guardrail-event', async (req, res) => {
  try {
    const result = await svc.recordRuntimeGuardrailEvent(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/kill-switch/trigger', async (req, res) => {
  try {
    const result = await svc.triggerRuntimeKillSwitch(req.body.gate_id, req.body.reason);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/kill-switch/clear', async (req, res) => {
  try {
    const result = await svc.clearRuntimeKillSwitch(req.body.gate_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/rollback-event', async (req, res) => {
  try {
    const result = await svc.recordRuntimeRollbackEvent(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/finding', async (req, res) => {
  try {
    const result = await svc.recordRuntimeFinding(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/finding/resolve', async (req, res) => {
  try {
    const result = await svc.resolveRuntimeFinding(req.body.finding_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.get('/audit-timeline', async (req, res) => {
  try {
    const result = await svc.getRuntimeAuditTimeline(req.query.gate_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.get('/evidence-pack', async (req, res) => {
  try {
    const result = await svc.buildRuntimeEvidencePack({ gate_id: req.query.gate_id });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/restart-drill/create', async (req, res) => {
  try {
    const result = await svc.createRuntimeRestartDrill(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/restart-drill/snapshot-before', async (req, res) => {
  try {
    const result = await svc.snapshotRuntimeStateBeforeRestart(req.body.gate_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/restart-drill/verify-after', async (req, res) => {
  try {
    const result = await svc.verifyRuntimeStateAfterRestart(req.body.gate_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/restart-drill/compare', async (req, res) => {
  try {
    const result = await svc.compareRuntimeRestartSnapshot(req.body.drill_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/restart-drill/verify-kill-switch', async (req, res) => {
  try {
    const result = await svc.verifyKillSwitchAfterRestart(req.body.drill_id, req.body.gate_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/restart-drill/verify-access', async (req, res) => {
  try {
    const result = await svc.verifyAccessGrantAfterRestart(req.body.drill_id, req.body.grant_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.get('/restart-drill/audit-timeline', async (req, res) => {
  try {
    const result = await svc.getRuntimeRestartRecoveryAuditTimeline(req.query.drill_id, req.query.gate_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.get('/restart-drill/evidence-pack', async (req, res) => {
  try {
    const result = await svc.buildRuntimeRestartRecoveryEvidencePack(req.query.drill_id, req.query.gate_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

module.exports = router;
