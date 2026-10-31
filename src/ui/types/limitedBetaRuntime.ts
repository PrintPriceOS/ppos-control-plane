export interface LimitedBetaRuntimeSession {
  session_id: string;
  gate_id: string;
  cohort_id: string;
  participant_id: string;
  tenant_id: string;
  scope_policy_id: string;
  access_status: string;
  created_at: string;
  expires_at: string | null;
  terminated_at: string | null;
  termination_reason: string | null;
  beta_runtime_enabled: number;
  invite_only: number;
  cohort_scoped: number;
  tenant_scoped: number;
  participant_scoped: number;
  kill_switch_enabled: number;
  full_public_enabled: number;
  open_marketplace_enabled: number;
  payment_execution_enabled: number;
  refund_execution_enabled: number;
  payout_execution_enabled: number;
  live_provider_connectivity_enabled: number;
  provider_external_submission_enabled: number;
  external_tax_submission_enabled: number;
  external_accounting_submission_enabled: number;
  source_mutation_enabled: number;
  runtime_truth_status: string;
  persistence_status: string | null;
  evidence_integrity_hash: string | null;
  verified_from_phase127_1: number;
  verified_from_db: number;
  fail_closed_verified: number;
  rollback_ready: number;
  restart_recovery_status?: string | null;
  last_verified_after_restart_at?: string | null;
  recovered_from_db?: number;
  memory_state_detected?: number;
  restart_safe?: number;
  kill_switch_survived_restart?: number;
  access_policy_survived_restart?: number;
  session_state_survived_restart?: number;
  evidence_pack_survived_restart?: number;
  recovery_integrity_hash?: string | null;
}

export interface LimitedBetaRuntimeAccessGrant {
  grant_id: string;
  gate_id: string;
  cohort_id: string;
  participant_id: string;
  tenant_id: string;
  scope_policy_id: string;
  granted_by: string;
  granted_at: string;
  revoked: number;
  revoked_by: string | null;
  revoked_at: string | null;
}

export interface LimitedBetaRuntimeAccessDenial {
  denial_id: string;
  gate_id: string;
  cohort_id: string | null;
  participant_id: string | null;
  tenant_id: string | null;
  feature_key: string;
  denial_reason: string;
  created_at: string;
}

export interface LimitedBetaRuntimeScopePolicy {
  policy_id: string;
  gate_id: string;
  policy_name: string;
  allowed_features_json: string[];
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

export interface LimitedBetaRuntimeKillSwitch {
  kill_switch_id: string;
  gate_id: string;
  kill_switch_enabled: number;
  triggered_by: string;
  triggered_at: string;
  reason: string | null;
  cleared_by: string | null;
  cleared_at: string | null;
}

export interface LimitedBetaRuntimeFinding {
  finding_id: string;
  gate_id: string;
  finding_status: string;
  severity: string;
  summary: string;
  details_json: Record<string, any>;
  blocks_runtime: number;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface LimitedBetaRuntimeRestartDrill {
  drill_id: string;
  gate_id: string;
  cohort_id: string;
  participant_id: string;
  tenant_id: string;
  before_restart_snapshot_hash: string | null;
  after_restart_snapshot_hash: string | null;
  recovery_integrity_hash: string | null;
  restart_recovery_status: string;
  runtime_truth_status: string;
  persistence_status: string;
  started_at: string;
  verified_at: string | null;
  verified_by: string | null;
  findings: string | null;
}
