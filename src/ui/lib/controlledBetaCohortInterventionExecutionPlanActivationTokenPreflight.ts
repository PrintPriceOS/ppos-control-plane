// Phase 159 — Activation Token Issuance Preflight Gate — UI Types

export interface ActivationTokenPreflightRecord {
  activation_token_preflight_id: string;
  source_activation_token_staging_id: string;
  source_activation_token_final_apv_id: string;
  activation_token_preflight_status:
    | 'DRAFT' | 'READY_FOR_EVALUATION' | 'EVALUATED' | 'READY_FOR_DECISION'
    | 'PREFLIGHT_PASSED' | 'PREFLIGHT_FAILED' | 'FINALIZED' | 'BLOCKED' | 'FAILED' | 'SUPERSEDED';
  activation_token_preflight_result:
    | 'PREFLIGHT_PASSED_NOT_ISSUED' | 'PREFLIGHT_FAILED_NOT_ISSUED'
    | 'PREFLIGHT_BLOCKED_BY_PARENT_STAGING' | 'PREFLIGHT_BLOCKED_BY_GUARDRAIL'
    | 'PREFLIGHT_BLOCKED_BY_HASH_MISMATCH' | 'PREFLIGHT_BLOCKED_BY_WRITE_SCOPE'
    | 'PREFLIGHT_BLOCKED_BY_REDEEMABLE_TOKEN' | 'REQUIRE_STAGING_REVALIDATION'
    | 'ESCALATE_TO_SECURITY_COMMITTEE' | null;
  risk_level: string;
  confidence_level: string;
  projected_impact_score: number;
  rollback_feasibility_score: number;
  evidence_completeness_score: number;
  guardrail_status: 'PASS' | 'FAIL' | 'PENDING';
  write_scope_status: 'PASS' | 'FAIL' | 'PENDING';
  canary_envelope_json: Record<string, unknown>;
  non_execution_attestation_json: Record<string, unknown>;
  write_scope_attestation_json: Record<string, unknown>;
  preflight_signatures_json: { security_officer_confirmed?: boolean; compliance_officer_confirmed?: boolean; operations_director_confirmed?: boolean };
  preflight_metadata_json: Record<string, unknown>;
  source_activation_token_staging_hash: string | null;
  activation_token_preflight_hash: string | null;
  token_preflight_evidence_pack_hash: string | null;
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

export interface ActivationTokenPreflightRule {
  rule_id: string;
  activation_token_preflight_id: string;
  check_type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  description: string;
  created_at: string;
}

export interface PreflightSignatures {
  security_officer_confirmed: boolean;
  compliance_officer_confirmed: boolean;
  operations_director_confirmed: boolean;
}
