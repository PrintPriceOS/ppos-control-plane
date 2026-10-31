import { adminFetch } from '../lib/adminApi';

const BASE = '/api/admin/beta/preparation-gate';

export async function getLimitedBetaReadiness(params: { gate_id?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.gate_id) qs.set('gate_id', params.gate_id);
  const q = qs.toString();
  return adminFetch(`${BASE}/readiness${q ? `?${q}` : ''}`);
}

export async function createPreparationGate(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/gate/create`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function createBetaCohort(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/cohort/create`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function registerCohortParticipant(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/participant/register`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function issueInviteCode(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/invite/issue`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function revokeInviteCode(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/invite/revoke`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function recordTermsAcceptance(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/terms/acceptance`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function defineRoleBoundary(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/role-boundary`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function recordSupportEscalationPath(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/support-escalation`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function recordIncidentRollbackPlan(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/incident-rollback-plan`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function recordBetaFinding(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function resolveBetaFinding(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/resolve-finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function getLimitedBetaAuditTimeline(params: { gate_id: string }) {
  const qs = new URLSearchParams();
  qs.set('gate_id', params.gate_id);
  return adminFetch(`${BASE}/audit-timeline?${qs.toString()}`);
}

export async function getLimitedBetaEvidencePack(params: { gate_id: string }) {
  const qs = new URLSearchParams();
  qs.set('gate_id', params.gate_id);
  return adminFetch(`${BASE}/evidence-pack?${qs.toString()}`);
}
