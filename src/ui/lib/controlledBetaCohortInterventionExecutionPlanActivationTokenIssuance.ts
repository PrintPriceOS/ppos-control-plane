// Phase 160 — Activation Token Issuance Gate — UI Types

export interface ActivationTokenIssuanceRecord {
  activation_token_issuance_id: string;
  source_activation_token_preflight_id: string;
  source_activation_token_staging_id: string;
  source_activation_token_final_apv_id: string;
  activation_token_issuance_status:
    | 'DRAFT' | 'READY_FOR_EVALUATION' | 'EVALUATED' | 'READY_FOR_DECISION'
    | 'ISSUANCE_RECORDED' | 'ISSUANCE_REJECTED' | 'FINALIZED' | 'BLOCKED' | 'FAILED' | 'SUPERSEDED';
  activation_token_issuance_result:
    | 'ISSUANCE_RECORDED_NOT_REDEEMABLE' | 'ISSUANCE_REJECTED_NOT_ISSUED'
    | 'ISSUANCE_BLOCKED_BY_PREFLIGHT' | 'ISSUANCE_BLOCKED_BY_GUARDRAIL'
    | 'ISSUANCE_BLOCKED_BY_HASH_MISMATCH' | 'ISSUANCE_BLOCKED_BY_WRITE_SCOPE'
    | 'ISSUANCE_BLOCKED_BY_REDEEMABLE_TOKEN' | 'ESCALATE_TO_BOARD_OF_DIRECTORS' | null;
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
  non_redeemable_token_record_json: Record<string, unknown>;
  issuance_signatures_json: { security_officer_confirmed?: boolean; compliance_officer_confirmed?: boolean; operations_director_confirmed?: boolean };
  issuance_metadata_json: Record<string, unknown>;
  source_activation_token_preflight_hash: string | null;
  source_activation_token_staging_hash: string | null;
  activation_token_issuance_hash: string | null;
  token_issuance_evidence_pack_hash: string | null;
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

export interface ActivationTokenIssuanceRule {
  rule_id: string;
  activation_token_issuance_id: string;
  check_type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  description: string;
  created_at: string;
}

export interface IssuanceSignatures {
  security_officer_confirmed: boolean;
  compliance_officer_confirmed: boolean;
  operations_director_confirmed: boolean;
}
