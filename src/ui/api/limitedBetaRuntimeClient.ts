import { adminFetch } from '../lib/adminApi';

const BASE = '/api/admin/beta/runtime';

export async function getLimitedBetaRuntimeReadiness(params: { gate_id?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.gate_id) qs.set('gate_id', params.gate_id);
  const q = qs.toString();
  return adminFetch(`${BASE}/readiness${q ? `?${q}` : ''}`);
}

export async function createRuntimeScopePolicy(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/scope-policy/create`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateRuntimeScopePolicy(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/scope-policy/update`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function enableRuntimeForGate(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/runtime/enable`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function disableRuntimeForGate(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/runtime/disable`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function createRuntimeAccessGrant(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/access-grant/create`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function revokeRuntimeAccessGrant(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/access-grant/revoke`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function evaluateRuntimeAccess(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/access/evaluate`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function createRuntimeSession(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/session/create`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function terminateRuntimeSession(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/session/terminate`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function recordRuntimeActivity(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/activity`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function recordRuntimeGuardrailEvent(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/guardrail-event`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function triggerRuntimeKillSwitch(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/kill-switch/trigger`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function clearRuntimeKillSwitch(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/kill-switch/clear`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function recordRuntimeRollbackEvent(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/rollback-event`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function recordRuntimeFinding(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function resolveRuntimeFinding(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/finding/resolve`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function getRuntimeAuditTimeline(params: { gate_id: string }) {
  const qs = new URLSearchParams();
  qs.set('gate_id', params.gate_id);
  return adminFetch(`${BASE}/audit-timeline?${qs.toString()}`);
}

export async function getRuntimeEvidencePack(params: { gate_id: string }) {
  const qs = new URLSearchParams();
  qs.set('gate_id', params.gate_id);
  return adminFetch(`${BASE}/evidence-pack?${qs.toString()}`);
}
