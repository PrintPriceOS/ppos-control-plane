import { adminFetch } from '../lib/adminApi';

const BASE = '/api/admin/production/pilot-activation';

export async function getPilotReadiness(pilotRunId?: string) {
  const qs = pilotRunId ? `?pilot_run_id=${encodeURIComponent(pilotRunId)}` : '';
  return adminFetch(`${BASE}/readiness${qs}`);
}

export async function createPilotRun(payload: Record<string, unknown> = {}) {
  return adminFetch(`${BASE}/create`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function registerPilotTenant(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/register-tenant`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function activatePilotTenant(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/activate-tenant`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function suspendPilotTenant(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/suspend-tenant`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function recordPilotFinding(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function resolvePilotFinding(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/resolve-finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function createPilotRollbackPoint(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/rollback-point`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function simulatePilotRollback(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/simulate-rollback`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function getPilotAuditTimeline(pilotRunId: string) {
  return adminFetch(`${BASE}/audit-timeline?pilot_run_id=${encodeURIComponent(pilotRunId)}`);
}

export async function getPilotEvidencePack(pilotRunId: string) {
  return adminFetch(`${BASE}/evidence-pack?pilot_run_id=${encodeURIComponent(pilotRunId)}`);
}
