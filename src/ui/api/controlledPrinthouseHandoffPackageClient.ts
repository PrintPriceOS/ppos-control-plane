import { adminFetch } from '../lib/adminApi';

const BASE = '/api/admin/production/printhouse-handoff-package';

export async function getHandoffPackageReadiness(params: { handoff_package_id?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.handoff_package_id) qs.set('handoff_package_id', params.handoff_package_id);
  const q = qs.toString();
  return adminFetch(`${BASE}/readiness${q ? `?${q}` : ''}`);
}

export async function createHandoffPackage(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/create`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function addPackageFileMetadata(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/file-metadata`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function createScopedFileAccessGrant(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/access-grant`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function revokeFileAccessGrant(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/revoke-access`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function submitPrinthouseHandoffReview(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/review`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function acceptHandoffPackage(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/accept`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function rejectHandoffPackage(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/reject`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function recordHandoffFinding(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function resolveHandoffFinding(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/resolve-finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function getHandoffAuditTimeline(params: { handoff_package_id: string; pilot_program_id?: string }) {
  const qs = new URLSearchParams();
  qs.set('handoff_package_id', params.handoff_package_id);
  if (params.pilot_program_id) qs.set('pilot_program_id', params.pilot_program_id);
  return adminFetch(`${BASE}/audit-timeline?${qs.toString()}`);
}

export async function getHandoffEvidencePack(params: { handoff_package_id: string; pilot_program_id?: string; participant_id?: string }) {
  const qs = new URLSearchParams();
  qs.set('handoff_package_id', params.handoff_package_id);
  if (params.pilot_program_id) qs.set('pilot_program_id', params.pilot_program_id);
  if (params.participant_id) qs.set('participant_id', params.participant_id);
  return adminFetch(`${BASE}/evidence-pack?${qs.toString()}`);
}
