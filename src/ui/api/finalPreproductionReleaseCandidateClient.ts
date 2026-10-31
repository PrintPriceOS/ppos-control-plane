import { adminFetch as adminApi } from '../lib/adminApi';
import type {
  CreateReleaseCandidatePayload,
  RecordFindingPayload,
  ResolveFindingPayload,
} from '../types/finalPreproductionReleaseCandidate';

const BASE = '/api/admin/preproduction/release-candidate';

export async function createReleaseCandidate(payload: CreateReleaseCandidatePayload): Promise<Record<string, unknown>> {
  return adminApi(`${BASE}/create`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function aggregateReadinessEvidence(payload: { candidate_id?: string }): Promise<Record<string, unknown>> {
  return adminApi(`${BASE}/aggregate`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function evaluateReleaseCandidate(payload: { candidate_id?: string }): Promise<Record<string, unknown>> {
  return adminApi(`${BASE}/evaluate`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function recordFinding(payload: RecordFindingPayload): Promise<Record<string, unknown>> {
  return adminApi(`${BASE}/finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function resolveFinding(payload: ResolveFindingPayload): Promise<Record<string, unknown>> {
  return adminApi(`${BASE}/resolve-finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function getFinalEvidencePack(candidateId?: string): Promise<Record<string, unknown>> {
  const params = candidateId ? `?candidate_id=${encodeURIComponent(candidateId)}` : '';
  return adminApi(`${BASE}/evidence-pack${params}`);
}
