export type ActivationTokenStagingStatus =
  | 'DRAFT'
  | 'READY_FOR_EVALUATION'
  | 'EVALUATED'
  | 'READY_FOR_DECISION'
  | 'STAGED'
  | 'REJECTED'
  | 'FINALIZED'
  | 'BLOCKED'
  | 'FAILED'
  | 'SUPERSEDED';

export type ActivationTokenStagingResult =
  | 'STAGED_NOT_ISSUED'
  | 'STAGING_REJECTED_NOT_ISSUED'
  | 'STAGING_BLOCKED_BY_PARENT_FINAL_APPROVAL'
  | 'STAGING_BLOCKED_BY_GUARDRAIL'
  | 'STAGING_BLOCKED_BY_HASH_MISMATCH'
  | 'STAGING_BLOCKED_BY_WRITE_SCOPE'
  | 'STAGING_BLOCKED_BY_REDEEMABLE_TOKEN'
  | 'REQUIRE_FINAL_APPROVAL_REVALIDATION'
  | 'ESCALATE_TO_SECURITY_COMMITTEE';

export interface StagingSignatures {
  security_officer_confirmed: boolean;
  compliance_officer_confirmed: boolean;
  operations_director_confirmed: boolean;
}

export interface ActivationTokenStagingRule {
  rule_id: string;
  activation_token_staging_id: string;
  check_type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  description: string;
  created_at: string;
}

export interface ActivationTokenStagingRecord {
  activation_token_staging_id: string;
  source_activation_token_final_apv_id: string;
  source_activation_token_env_id: string;
  cohort_id: string;
  tenant_id: string;
  simulation_type: string;
  activation_token_staging_status: ActivationTokenStagingStatus;
  activation_token_staging_result: ActivationTokenStagingResult | null;
  risk_level: string;
  confidence_level: string;
  projected_impact_score: number;
  rollback_feasibility_score: number;
  evidence_completeness_score: number;
  guardrail_status: 'PENDING' | 'PASS' | 'FAIL';
  write_scope_status: 'PENDING' | 'PASS' | 'FAIL';
  canary_envelope_json: any;
  token_staging_summary_json: any;
  non_execution_attestation_json: any;
  write_scope_attestation_json: any;
  source_activation_token_final_apv_hash: string;
  source_token_material_hash: string;
  source_freeze_package_hash: string;
  activation_token_staging_hash: string | null;
  token_staging_evidence_pack_hash: string | null;
  lineage_hash_chain_json: any;
  staging_signatures_json: StagingSignatures;
  staging_metadata_json: any;
  execution_capability_status: string;
  activation_execution_status: string;
  package_freeze_status: string;
  plan_executable_status: string;
  job_creation_status: string;
  queue_dispatch_status: string;
  runtime_mutation_status: string;
  finalized_by: string | null;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
}
