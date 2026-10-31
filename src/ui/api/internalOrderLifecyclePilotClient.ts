import { adminFetch } from '../lib/adminApi';

const BASE = '/api/admin/production/internal-order-lifecycle-pilot';

export async function getInternalOrderLifecyclePilotReadiness(params: { pilot_run_id?: string; tenant_id?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.pilot_run_id) qs.set('pilot_run_id', params.pilot_run_id);
  if (params.tenant_id) qs.set('tenant_id', params.tenant_id);
  const q = qs.toString();
  return adminFetch(`${BASE}/readiness${q ? `?${q}` : ''}`);
}

export async function createInternalOrderLifecyclePilotRun(payload: Record<string, unknown> = {}) {
  return adminFetch(`${BASE}/create-run`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function createInternalPilotOrder(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/create-order`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function executeInternalOrderLifecycle(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/execute-lifecycle`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function createInternalOrderLifecycleRollbackPoint(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/rollback-point`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function simulateInternalOrderLifecycleRollback(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/simulate-rollback`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function recordInternalOrderLifecycleFinding(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function resolveInternalOrderLifecycleFinding(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/resolve-finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function getInternalOrderLifecycleSteps(params: { pilot_run_id: string; pilot_order_id?: string }) {
  const qs = new URLSearchParams({ pilot_run_id: params.pilot_run_id });
  if (params.pilot_order_id) qs.set('pilot_order_id', params.pilot_order_id);
  return adminFetch(`${BASE}/steps?${qs.toString()}`);
}

export async function getInternalOrderLifecycleAuditTimeline(params: { pilot_run_id: string }) {
  return adminFetch(`${BASE}/audit-timeline?pilot_run_id=${encodeURIComponent(params.pilot_run_id)}`);
}

export async function getInternalOrderLifecycleEvidencePack(params: { pilot_run_id: string; pilot_order_id?: string }) {
  const qs = new URLSearchParams({ pilot_run_id: params.pilot_run_id });
  if (params.pilot_order_id) qs.set('pilot_order_id', params.pilot_order_id);
  return adminFetch(`${BASE}/evidence-pack?${qs.toString()}`);
}
