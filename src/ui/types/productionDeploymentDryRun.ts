export type DryRunStatus = 'PENDING' | 'DRY_RUN_RUNNING' | 'DRY_RUN_PASSED' | 'DRY_RUN_FAILED';
export type StepType = 'PRE_DEPLOY_CHECK' | 'MIGRATION_VERIFY' | 'BACKUP_VERIFY' | 'SERVICE_RESTART_SIMULATED' | 'HEALTH_CHECK_SIMULATED' | 'SMOKE_TEST_SIMULATED' | 'ROLLBACK_PLAN_VERIFY' | 'POST_DEPLOY_CHECK';
export type StepStatus = 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'SKIPPED';

export interface DryRunSafetyMarkers {
  deploymentDryRunOnly: true;
  realDeploymentExecuted: false;
  serviceRestartExecuted: false;
  rollbackExecuted: false;
  sourceMutation: false;
  externalSubmission: false;
  productionActivationEnabled: false;
  fullPublicEnabled: false;
  liveProviderConnectivityEnabled: false;
  paymentExecutionEnabled: false;
  refundExecutionEnabled: false;
  payoutExecutionEnabled: false;
}

export interface DryRunStep {
  step_id: string;
  dry_run_id: string;
  step_name: string;
  step_type: StepType;
  status: StepStatus;
  simulated_only: true;
  result_json: Record<string, unknown> | null;
  created_at: string;
}

export interface RollbackDrill {
  rollback_drill_id: string;
  dry_run_id: string;
  rollback_scenario: string;
  rollback_simulated_only: true;
  real_rollback_executed: false;
  rollback_steps_json: Record<string, unknown>[];
  status: string;
  triggered_by: string;
  created_at: string;
}

export interface DryRunAuditEvent {
  audit_id: string;
  dry_run_id: string;
  event_type: string;
  actor: string;
  details_json: Record<string, unknown>;
  deployment_dry_run_only: true;
  created_at: string;
}

export interface DryRunEvidencePack {
  dry_run_id: string;
  readiness_reference_id: string | null;
  status: DryRunStatus;
  simulated_deployment_steps: DryRunStep[];
  rollback_drills: RollbackDrill[];
  audit_summary: DryRunAuditEvent[];
  safety_invariants: Record<string, boolean>;
  safety: DryRunSafetyMarkers;
  phase_safety_string: string;
  dryRunOnly: true;
  reviewOnly: true;
  externalSubmission: false;
  sourceMutation: false;
}

export interface CreateDryRunPayload {
  dry_run_id?: string;
  readiness_reference_id?: string;
  requested_by?: string;
}

export interface ExecuteDryRunPayload {
  dry_run_id: string;
  actor?: string;
}

export interface SimulateRollbackPayload {
  dry_run_id: string;
  actor?: string;
  rollback_scenario?: string;
}
