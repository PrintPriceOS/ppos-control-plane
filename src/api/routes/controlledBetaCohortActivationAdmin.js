'use strict';

const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const ControlledBetaCohortActivationService = require('../services/controlledBetaCohortActivationService');

const svc = new ControlledBetaCohortActivationService();

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
  'First Controlled Invite-Only Beta Cohort Activation. ' +
  'This does not enable FULL_PUBLIC, open marketplace access, payment execution, refund execution, payout execution, provider external submission, tax/accounting submission, or uncontrolled source mutation.';

function safeResponse(data) {
  const betaEnabled = data && (data.beta_runtime_scoped_enabled === true || (data.activation && data.activation.beta_runtime_scoped_enabled === 1));
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
    const result = await svc.evaluateControlledCohortActivationReadiness(req.query.activation_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/create', async (req, res) => {
  try {
    const result = await svc.createControlledCohortActivation(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/bind-gate', async (req, res) => {
  try {
    const result = await svc.bindActivationToGate(req.body.activation_id, req.body.gate_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/bind-cohort', async (req, res) => {
  try {
    const result = await svc.bindActivationToCohort(req.body.activation_id, req.body.cohort_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/bind-tenant', async (req, res) => {
  try {
    const result = await svc.bindActivationToTenant(req.body.activation_id, req.body.tenant_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/participant/add', async (req, res) => {
  try {
    const result = await svc.addActivationParticipant(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/participant/remove', async (req, res) => {
  try {
    const result = await svc.removeActivationParticipant(req.body.participant_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/invite/issue', async (req, res) => {
  try {
    const result = await svc.issueActivationInvite(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/invite/revoke', async (req, res) => {
  try {
    const result = await svc.revokeActivationInvite(req.body.invite_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/scope/define', async (req, res) => {
  try {
    const result = await svc.defineActivationScope(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/limits/define', async (req, res) => {
  try {
    const result = await svc.defineSessionLimits(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/activate', async (req, res) => {
  try {
    const result = await svc.activateControlledCohort(req.body.activation_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/pause', async (req, res) => {
  try {
    const result = await svc.pauseControlledCohort(req.body.activation_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/resume', async (req, res) => {
  try {
    const result = await svc.resumeControlledCohort(req.body.activation_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/terminate', async (req, res) => {
  try {
    const result = await svc.terminateControlledCohort(req.body.activation_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/access/evaluate', async (req, res) => {
  try {
    const result = await svc.evaluateParticipantActivationAccess(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/monitoring/record', async (req, res) => {
  try {
    const result = await svc.recordActivationMonitoringEvent(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/support/record', async (req, res) => {
  try {
    const result = await svc.recordActivationSupportEvent(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/incident/record', async (req, res) => {
  try {
    const result = await svc.recordActivationIncidentEvent(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/kill-switch/trigger', async (req, res) => {
  try {
    const result = await svc.triggerActivationKillSwitch(req.body.activation_id, req.body.reason);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/kill-switch/clear', async (req, res) => {
  try {
    const result = await svc.clearActivationKillSwitch(req.body.activation_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/finding/record', async (req, res) => {
  try {
    const result = await svc.recordActivationFinding(req.body);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.post('/finding/resolve', async (req, res) => {
  try {
    const result = await svc.resolveActivationFinding(req.body.finding_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.get('/evidence-pack', async (req, res) => {
  try {
    const result = await svc.buildControlledActivationEvidencePack(req.query.activation_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

router.get('/audit-timeline', async (req, res) => {
  try {
    const result = await svc.getControlledActivationAuditTimeline(req.query.activation_id);
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

module.exports = router;
