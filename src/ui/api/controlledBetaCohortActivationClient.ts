import { authenticatedBetaFetch } from './betaApiAuthHelper';

const BASE = '/api/admin/beta/cohort-activation';

export async function getControlledBetaCohortActivationReadiness(params: { activation_id?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.activation_id) qs.set('activation_id', params.activation_id);
  const q = qs.toString();
  return authenticatedBetaFetch(`${BASE}/readiness${q ? `?${q}` : ''}`);
}

export async function createControlledCohortActivation(payload: Record<string, unknown>) {
  return authenticatedBetaFetch(`${BASE}/create`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function bindActivationToGate(payload: Record<string, unknown>) {
  return authenticatedBetaFetch(`${BASE}/bind-gate`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function bindActivationToCohort(payload: Record<string, unknown>) {
  return authenticatedBetaFetch(`${BASE}/bind-cohort`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function bindActivationToTenant(payload: Record<string, unknown>) {
  return authenticatedBetaFetch(`${BASE}/bind-tenant`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function addActivationParticipant(payload: Record<string, unknown>) {
  return authenticatedBetaFetch(`${BASE}/participant/add`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function removeActivationParticipant(payload: Record<string, unknown>) {
  return authenticatedBetaFetch(`${BASE}/participant/remove`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function issueActivationInvite(payload: Record<string, unknown>) {
  return authenticatedBetaFetch(`${BASE}/invite/issue`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function revokeActivationInvite(payload: Record<string, unknown>) {
  return authenticatedBetaFetch(`${BASE}/invite/revoke`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function defineActivationScope(payload: Record<string, unknown>) {
  return authenticatedBetaFetch(`${BASE}/scope/define`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function defineSessionLimits(payload: Record<string, unknown>) {
  return authenticatedBetaFetch(`${BASE}/limits/define`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function activateControlledCohort(payload: Record<string, unknown>) {
  return authenticatedBetaFetch(`${BASE}/activate`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function pauseControlledCohort(payload: Record<string, unknown>) {
  return authenticatedBetaFetch(`${BASE}/pause`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function resumeControlledCohort(payload: Record<string, unknown>) {
  return authenticatedBetaFetch(`${BASE}/resume`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function terminateControlledCohort(payload: Record<string, unknown>) {
  return authenticatedBetaFetch(`${BASE}/terminate`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function evaluateParticipantActivationAccess(payload: Record<string, unknown>) {
  return authenticatedBetaFetch(`${BASE}/access/evaluate`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function recordActivationMonitoringEvent(payload: Record<string, unknown>) {
  return authenticatedBetaFetch(`${BASE}/monitoring/record`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function recordActivationSupportEvent(payload: Record<string, unknown>) {
  return authenticatedBetaFetch(`${BASE}/support/record`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function recordActivationIncidentEvent(payload: Record<string, unknown>) {
  return authenticatedBetaFetch(`${BASE}/incident/record`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function triggerActivationKillSwitch(payload: Record<string, unknown>) {
  return authenticatedBetaFetch(`${BASE}/kill-switch/trigger`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function clearActivationKillSwitch(payload: Record<string, unknown>) {
  return authenticatedBetaFetch(`${BASE}/kill-switch/clear`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function recordActivationFinding(payload: Record<string, unknown>) {
  return authenticatedBetaFetch(`${BASE}/finding/record`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function resolveActivationFinding(payload: Record<string, unknown>) {
  return authenticatedBetaFetch(`${BASE}/finding/resolve`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function getControlledActivationEvidencePack(params: { activation_id: string }) {
  const qs = new URLSearchParams();
  qs.set('activation_id', params.activation_id);
  return authenticatedBetaFetch(`${BASE}/evidence-pack?${qs.toString()}`);
}

export async function getControlledActivationAuditTimeline(params: { activation_id: string }) {
  const qs = new URLSearchParams();
  qs.set('activation_id', params.activation_id);
  return authenticatedBetaFetch(`${BASE}/audit-timeline?${qs.toString()}`);
}
