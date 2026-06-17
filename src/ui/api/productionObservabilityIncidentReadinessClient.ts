import { adminFetch as adminApi } from '../lib/adminApi';
import type {
  SimulateIncidentPayload,
  SimulateAlertPayload,
  RecordFindingPayload,
  ResolveFindingPayload,
  ObservabilityReadinessResult,
  IncidentSimulationResult,
  IncidentReadinessEvidencePack,
} from '../types/productionObservabilityIncidentReadiness';

const BASE = '/api/admin/operations/incident-readiness';

export async function getObservabilityReadiness(runId?: string): Promise<{ ok: boolean } & Partial<ObservabilityReadinessResult>> {
  const params = runId ? `?run_id=${encodeURIComponent(runId)}` : '';
  return adminApi(`${BASE}/readiness${params}`);
}

export async function simulateIncident(payload: SimulateIncidentPayload): Promise<{ ok: boolean } & Partial<IncidentSimulationResult>> {
  return adminApi(`${BASE}/simulate-incident`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function simulateAlertDispatch(payload: SimulateAlertPayload): Promise<{ ok: boolean } & Record<string, unknown>> {
  return adminApi(`${BASE}/simulate-alert`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function recordIncidentFinding(payload: RecordFindingPayload): Promise<{ ok: boolean; finding_id: string } & Record<string, unknown>> {
  return adminApi(`${BASE}/finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function resolveIncidentFinding(payload: ResolveFindingPayload): Promise<{ ok: boolean } & Record<string, unknown>> {
  return adminApi(`${BASE}/resolve-finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function getIncidentReadinessEvidencePack(runId?: string): Promise<{ ok: boolean } & Partial<IncidentReadinessEvidencePack>> {
  const params = runId ? `?run_id=${encodeURIComponent(runId)}` : '';
  return adminApi(`${BASE}/evidence-pack${params}`);
}
