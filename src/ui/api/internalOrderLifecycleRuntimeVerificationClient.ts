import { adminFetch } from '../lib/adminApi';

const BASE = '/api/admin/production/internal-order-lifecycle-runtime-verification';

export async function getRuntimeVerificationReadiness(params: { verification_run_id?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.verification_run_id) qs.set('verification_run_id', params.verification_run_id);
  const q = qs.toString();
  return adminFetch(`${BASE}/readiness${q ? `?${q}` : ''}`);
}

export async function createRuntimeVerificationRun(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/create`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function verifyDbReadThrough(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/verify-db-read-through`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function verifyMemoryEmptyRecovery(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/verify-memory-empty-recovery`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function verifyAuditRecovery(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/verify-audit-recovery`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function verifyEvidenceRecovery(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/verify-evidence-recovery`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function verifyAllowlist(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/verify-allowlist`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function verifyBlockers(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/verify-blockers`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function getRuntimeVerificationAuditTimeline(params: { verification_run_id: string }) {
  return adminFetch(`${BASE}/audit-timeline?verification_run_id=${encodeURIComponent(params.verification_run_id)}`);
}

export async function getRuntimeVerificationEvidencePack(params: { verification_run_id: string }) {
  return adminFetch(`${BASE}/evidence-pack?verification_run_id=${encodeURIComponent(params.verification_run_id)}`);
}
