// Phase 165 — Controlled High-Risk Cohort Intervention Activation Token Redemption Lock / Pre-Redemption Freeze Gate
// Types

export interface ActivationTokenRedemptionLockRecord {
  activation_token_redemption_lock_id: string;
  source_activation_token_redemption_final_apv_id: string;
  source_activation_token_redemption_env_id: string;
  source_activation_token_redemption_auth_id: string;
  source_activation_token_redemption_readiness_id: string;
  source_activation_token_issuance_id: string;
  source_activation_token_preflight_id: string;
  source_activation_token_staging_id: string;
  source_activation_token_final_apv_id: string;
  source_activation_token_env_id: string;
  source_activation_handoff_id: string;
  source_activation_decision_id: string;
  source_activation_lock_id: string;
  source_activation_auth_id: string;
  source_activation_readiness_id: string;
  source_plan_id: string;
  source_dispatcher_id: string;
  source_envelope_id: string;
  source_auth_id: string;
  source_readiness_id: string;
  source_approval_id: string;
  source_prep_id: string;
  source_review_id?: string;
  source_simulation_id?: string;
  source_execution_id?: string;
  cohort_id?: string;
  tenant_id?: string;
  simulation_type?: string;
  activation_token_redemption_lock_status: string;
  activation_token_redemption_lock_result: string;
  risk_level: string;
  confidence_level: string;
  projected_impact_score: number;
  rollback_feasibility_score: number;
  evidence_completeness_score: number;
  guardrail_status: string;
  write_scope_status: string;
  canary_envelope_json: Record<string, unknown>;
  token_redemption_lock_summary_json: Record<string, unknown>;
  impact_review_json: Record<string, unknown>;
  rollback_review_json: Record<string, unknown>;
  guardrail_review_json: Record<string, unknown>;
  token_redemption_lock_rules_json: Record<string, unknown>;
  token_redemption_lock_blockers_json: Record<string, unknown>;
  non_execution_attestation_json: Record<string, unknown>;
  write_scope_attestation_json: Record<string, unknown>;
  non_redeemable_token_record_json: Record<string, unknown>;
  activation_token_redemption_lock_hash: string;
  execution_capability_status: string;
  token_status: string;
  token_redemption_lock_status_val: string;
  token_redemption_status: string;
  token_redeemable_status: string;
  activation_execution_status: string;
  redemption_package_freeze_status: string;
  package_freeze_status: string;
  plan_executable_status: string;
  job_creation_status: string;
  queue_dispatch_status: string;
  runtime_mutation_status: string;
  created_at?: string;
  updated_at?: string;
  created_by: string;
  updated_by: string;
}

export interface ActivationTokenRedemptionLockRule {
  rule_id: string;
  activation_token_redemption_lock_id: string;
  check_type: string;
  severity: string;
  description: string;
  created_at?: string;
}

export interface RedemptionLockSignatures {
  security_officer_confirmed: boolean;
  compliance_officer_confirmed: boolean;
  operations_director_confirmed: boolean;
}
