import { adminFetch } from '../lib/adminApi';
import {
  DryRunReadinessResult,
  ProductionActivationDryRun,
  DryRunStep,
  DryRunAuditEvent,
  DryRunEvidencePack,
  DryRunSafetyMarkers,
  RollbackSimulation,
} from '../types/financialOperationsProductionActivationDryRun';

const BASE_URL = '/api/admin/financials/activation-dry-run';

export interface DryRunApiResponse<T> {
  ok: boolean;
  safety: DryRunSafetyMarkers;
  safety_message: string;
  data?: T;
  error?: string;
}

export interface ReadinessResponse extends DryRunApiResponse<DryRunReadinessResult> {
  status: 'READY_FOR_DRY_RUN' | 'BLOCKED';
  gate_reference_id: string | null;
  gate_valid: boolean;
  safety_invariants: Record<string, boolean>;
}

export interface CreateDryRunResponse extends DryRunApiResponse<ProductionActivationDryRun> {
  dry_run_id: string;
  dry_run_status: string;
  gate_reference_id: string;
}

export interface ExecuteDryRunResponse extends DryRunApiResponse<any> {
  dry_run_id: string;
  dry_run_status: string;
  simulated_activation_steps: any[];
}

export interface RollbackResponse extends DryRunApiResponse<RollbackSimulation> {
  rollback_id: string;
  rollback_simulated_only: boolean;
}

export interface StepsResponse extends DryRunApiResponse<DryRunStep[]> {
  dry_run_id: string;
  steps: DryRunStep[];
}

export interface AuditTimelineResponse extends DryRunApiResponse<DryRunAuditEvent[]> {
  dry_run_id: string;
  audit_timeline: DryRunAuditEvent[];
}

export interface EvidencePackResponse extends DryRunApiResponse<DryRunEvidencePack> {
  dry_run_id: string;
  dry_run_status: string;
  safety_invariants: Record<string, boolean>;
  simulated_activation_steps: any[];
  simulated_rollback_steps: any[];
  audit_summary: any[];
}

export const getProductionActivationDryRunReadiness = async (
  gateReferenceId?: string,
  dryRunId?: string
): Promise<ReadinessResponse> => {
  const params = new URLSearchParams();
  if (gateReferenceId) params.set('gate_reference_id', gateReferenceId);
  if (dryRunId) params.set('dry_run_id', dryRunId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return adminFetch<ReadinessResponse>(`${BASE_URL}/readiness${qs}`);
};

export const createProductionActivationDryRun = async (payload: {
  gate_reference_id?: string;
  requested_by?: string;
  dry_run_name?: string;
  metadata?: Record<string, any>;
}): Promise<CreateDryRunResponse> => {
  return adminFetch<CreateDryRunResponse>(`${BASE_URL}/create`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const executeProductionActivationDryRun = async (payload: {
  dry_run_id: string;
}): Promise<ExecuteDryRunResponse> => {
  return adminFetch<ExecuteDryRunResponse>(`${BASE_URL}/execute`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const simulateProductionActivationRollback = async (payload: {
  dry_run_id: string;
  rollback_reason?: string;
}): Promise<RollbackResponse> => {
  return adminFetch<RollbackResponse>(`${BASE_URL}/simulate-rollback`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const getProductionActivationDryRunSteps = async (
  dryRunId: string
): Promise<StepsResponse> => {
  return adminFetch<StepsResponse>(`${BASE_URL}/steps?dry_run_id=${encodeURIComponent(dryRunId)}`);
};

export const getProductionActivationDryRunAuditTimeline = async (
  dryRunId: string
): Promise<AuditTimelineResponse> => {
  return adminFetch<AuditTimelineResponse>(
    `${BASE_URL}/audit-timeline?dry_run_id=${encodeURIComponent(dryRunId)}`
  );
};

export const getProductionActivationDryRunEvidencePack = async (
  dryRunId: string
): Promise<EvidencePackResponse> => {
  return adminFetch<EvidencePackResponse>(
    `${BASE_URL}/evidence-pack?dry_run_id=${encodeURIComponent(dryRunId)}`
  );
};
