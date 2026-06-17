import { adminFetch as adminApi } from '../lib/adminApi';
import type {
  EvidencePack,
  EvaluatePayload,
  RecordFindingPayload,
  ResolveFindingPayload,
  ReadinessResult,
  ReadinessAuditEvent,
} from '../types/productionDeploymentReadinessChecklist';

const BASE = '/api/admin/deployment/readiness';

export async function getDeploymentReadinessChecks(checkId?: string): Promise<{ ok: boolean; results: ReadinessResult[] } & Record<string, unknown>> {
  const params = checkId ? `?check_id=${encodeURIComponent(checkId)}` : '';
  return adminApi(`${BASE}/checks${params}`);
}

export async function evaluateDeploymentReadiness(payload: EvaluatePayload): Promise<EvidencePack & { ok: boolean }> {
  return adminApi(`${BASE}/evaluate`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function recordDeploymentFinding(payload: RecordFindingPayload): Promise<{ ok: boolean; finding_id: string; severity: string; blocks_deployment: boolean }> {
  return adminApi(`${BASE}/finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function resolveDeploymentFinding(payload: ResolveFindingPayload): Promise<{ ok: boolean; finding_id: string; status: string }> {
  return adminApi(`${BASE}/resolve-finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function getDeploymentReadinessEvidencePack(checkId?: string, boardReferenceId?: string): Promise<EvidencePack & { ok: boolean }> {
  const params = new URLSearchParams();
  if (checkId) params.set('check_id', checkId);
  if (boardReferenceId) params.set('board_reference_id', boardReferenceId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return adminApi(`${BASE}/evidence-pack${qs}`);
}

export async function getDeploymentReadinessAuditTimeline(checkId?: string): Promise<{ ok: boolean; check_id: string; audit_timeline: ReadinessAuditEvent[] }> {
  const params = checkId ? `?check_id=${encodeURIComponent(checkId)}` : '';
  return adminApi(`${BASE}/audit-timeline${params}`);
}
