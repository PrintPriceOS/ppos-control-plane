import { adminFetch as adminApi } from '../lib/adminApi';
import type {
  DryRunEvidencePack,
  CreateDryRunPayload,
  ExecuteDryRunPayload,
  SimulateRollbackPayload,
  DryRunStep,
  DryRunAuditEvent,
} from '../types/productionDeploymentDryRun';

const BASE = '/api/admin/deployment/dry-run';

export async function getDeploymentDryRunReadiness(dryRunId?: string): Promise<{ ok: boolean } & Record<string, unknown>> {
  const params = dryRunId ? `?dry_run_id=${encodeURIComponent(dryRunId)}` : '';
  return adminApi(`${BASE}/readiness${params}`);
}

export async function createDeploymentDryRun(payload: CreateDryRunPayload): Promise<{ ok: boolean; dry_run_id: string } & Record<string, unknown>> {
  return adminApi(`${BASE}/create`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function executeDeploymentDryRun(payload: ExecuteDryRunPayload): Promise<{ ok: boolean; status: string } & Record<string, unknown>> {
  return adminApi(`${BASE}/execute`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function simulateDeploymentRollback(payload: SimulateRollbackPayload): Promise<{ ok: boolean; rollback_drill_id: string } & Record<string, unknown>> {
  return adminApi(`${BASE}/simulate-rollback`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function getDeploymentDryRunSteps(dryRunId?: string): Promise<{ ok: boolean; steps: DryRunStep[] } & Record<string, unknown>> {
  const params = dryRunId ? `?dry_run_id=${encodeURIComponent(dryRunId)}` : '';
  return adminApi(`${BASE}/steps${params}`);
}

export async function getDeploymentDryRunAuditTimeline(dryRunId?: string): Promise<{ ok: boolean; audit_timeline: DryRunAuditEvent[] } & Record<string, unknown>> {
  const params = dryRunId ? `?dry_run_id=${encodeURIComponent(dryRunId)}` : '';
  return adminApi(`${BASE}/audit-timeline${params}`);
}

export async function getDeploymentDryRunEvidencePack(dryRunId?: string): Promise<DryRunEvidencePack & { ok: boolean }> {
  const params = dryRunId ? `?dry_run_id=${encodeURIComponent(dryRunId)}` : '';
  return adminApi(`${BASE}/evidence-pack${params}`);
}
