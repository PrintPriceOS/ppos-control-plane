import { adminFetch } from '../lib/adminApi';

const BASE = '/api/admin/production/pilot-evidence-review';

export async function getPilotEvidenceReviewReadiness(params: { review_board_id?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.review_board_id) qs.set('review_board_id', params.review_board_id);
  const q = qs.toString();
  return adminFetch(`${BASE}/readiness${q ? `?${q}` : ''}`);
}

export async function createReviewBoard(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/create`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function aggregatePilotEvidence(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/aggregate`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function recordReviewFinding(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function resolveReviewFinding(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/resolve-finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function submitGoNoGoDecision(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/decision`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function getPilotReviewAuditTimeline(params: { review_board_id: string }) {
  const qs = new URLSearchParams();
  qs.set('review_board_id', params.review_board_id);
  return adminFetch(`${BASE}/audit-timeline?${qs.toString()}`);
}

export async function getPilotReviewEvidencePack(params: { review_board_id: string }) {
  const qs = new URLSearchParams();
  qs.set('review_board_id', params.review_board_id);
  return adminFetch(`${BASE}/evidence-pack?${qs.toString()}`);
}
