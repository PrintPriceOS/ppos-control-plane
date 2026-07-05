export interface CohortInterventionExecutionPlanActivationTokenFinalApv {
  activation_token_final_apv_id: string;
  source_activation_token_env_id: string;
  source_activation_token_auth_id: string;
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
  activation_token_final_apv_status: string;
  activation_token_final_apv_result?: string;
  risk_level?: string;
  confidence_level?: string;
  projected_impact_score?: number;
  rollback_feasibility_score?: number;
  evidence_completeness_score?: number;
  guardrail_status: string;
  write_scope_status: string;
  canary_envelope_json?: any;
  token_final_apv_summary_json?: any;
  impact_review_json?: any;
  rollback_review_json?: any;
  guardrail_review_json?: any;
  token_final_apv_rules_json?: any;
  token_final_apv_blockers_json?: any;
  non_execution_attestation_json?: any;
  write_scope_attestation_json?: any;
  source_activation_token_env_hash?: string;
  source_token_material_hash?: string;
  source_freeze_package_hash?: string;
  activation_token_final_apv_hash?: string;
  token_final_apv_evidence_pack_hash?: string;
  evidence_pack_hash?: string;
  lineage_hash_chain_json?: any;
  security_chair_signature_json?: any;
  final_approval_rationale_json?: any;
  execution_capability_status: string;
  activation_execution_status: string;
  package_freeze_status: string;
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
  created_at: string;
  updated_at: string;
}

export interface ActivationTokenFinalApvRule {
  rule_id: string;
  activation_token_final_apv_id: string;
  check_type: string;
  severity: string;
  description: string;
  created_at: string;
}

export interface ActivationTokenFinalApvAudit {
  audit_event_id: string;
  activation_token_final_apv_id: string;
  event_type: string;
  actor_id: string;
  details_json?: any;
  created_at: string;
}

export interface ActivationTokenFinalApvEvidence {
  evidence_id: string;
  activation_token_final_apv_id: string;
  evidence_schema_version: string;
  evidence_pack_hash: string;
  evidence_payload_json: any;
  lineage_hash_chain_json: any;
  created_at: string;
}

export interface ActivationTokenFinalApvDetails {
  record: CohortInterventionExecutionPlanActivationTokenFinalApv;
  rules: ActivationTokenFinalApvRule[];
  audits: ActivationTokenFinalApvAudit[];
  evidence?: ActivationTokenFinalApvEvidence;
}
