// Phase 166 — Controlled High-Risk Cohort Intervention Activation Token Redemption Unlock Eligibility Gate
// Types

export interface ActivationTokenRedemptionUnlockEligibilityRecord {
  activation_token_redemption_unlock_eligibility_id: string;
  source_activation_token_redemption_lock_id: string;
  source_activation_token_redemption_final_apv_id: string;
  source_activation_token_redemption_envelope_id: string;
  source_activation_token_redemption_auth_id: string;
  source_activation_token_redemption_readiness_id: string;
  source_activation_token_issuance_id: string;
  source_activation_token_staging_id: string;
  source_activation_token_preflight_id: string;
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
  unlock_eligibility_status: string;
  unlock_eligibility_result: string;
  token_redemption_lock_status: string;
  token_redemption_status: string;
  token_redeemable_status: string;
  actual_unlock_status: string;
  risk_level: string;
  confidence_level: string;
  projected_impact_score: number;
  rollback_feasibility_score: number;
  evidence_completeness_score: number;
  guardrail_status: string;
  write_scope_status: string;
  canary_envelope_json: Record<string, unknown>;
  unlock_eligibility_summary_json: Record<string, unknown>;
  impact_review_json: Record<string, unknown>;
  rollback_review_json: Record<string, unknown>;
  guardrail_review_json: Record<string, unknown>;
  unlock_eligibility_rules_json: Record<string, unknown>;
  unlock_eligibility_blockers_json: Record<string, unknown>;
  non_execution_attestation_json: Record<string, unknown>;
  write_scope_attestation_json: Record<string, unknown>;
  source_redemption_lock_hash: string;
  source_redemption_package_freeze_hash: string;
  source_token_material_hash: string;
  unlock_eligibility_hash: string;
  unlock_eligibility_evidence_pack_hash: string;
  evidence_pack_hash: string;
  lineage_hash_chain_json: Record<string, unknown>;
  security_signature_json: Record<string, unknown>;
  eligibility_rationale_json: Record<string, unknown>;
  execution_capability_status: string;
  activation_execution_status: string;
  package_freeze_status: string;
  redemption_package_freeze_status: string;
  plan_executable_status: string;
  job_creation_status: string;
  queue_dispatch_status: string;
  runtime_mutation_status: string;
  approved_by?: string;
  approved_at?: string;
  rejected_by?: string;
  rejected_at?: string;
  finalized_by?: string;
  finalized_at?: string;
  created_at?: string;
  updated_at?: string;
  created_by: string;
  updated_by: string;
}

export interface ActivationTokenRedemptionUnlockEligibilityRule {
  rule_id: string;
  activation_token_redemption_unlock_eligibility_id: string;
  check_type: string;
  severity: string;
  description: string;
  created_at?: string;
}

export interface UnlockEligibilitySignatures {
  security_officer_confirmed: boolean;
  compliance_officer_confirmed: boolean;
}
