// Phase 163 — Activation Token Redemption Envelope Gate — UI Types

export interface ActivationTokenRedemptionEnvelopeRecord {
  activation_token_redemption_env_id: string;
  source_activation_token_redemption_auth_id: string;
  source_activation_token_redemption_readiness_id: string;
  source_activation_token_issuance_id: string;
  source_activation_token_preflight_id: string;
  source_activation_token_staging_id: string;
  source_activation_token_final_apv_id: string;
  activation_token_redemption_envelope_status:
    | 'DRAFT' | 'READY_FOR_EVALUATION' | 'EVALUATED' | 'READY_FOR_DECISION'
    | 'ENVELOPE_PASSED' | 'ENVELOPE_FAILED' | 'FINALIZED' | 'BLOCKED' | 'FAILED' | 'SUPERSEDED';
  activation_token_redemption_envelope_result:
    | 'REDEMPTION_ENVELOPE_PREPARED_NOT_REDEEMED' | 'REDEMPTION_ENVELOPE_FAILED'
    | 'REDEMPTION_ENVELOPE_BLOCKED_BY_AUTHORIZATION' | 'REDEMPTION_ENVELOPE_BLOCKED_BY_GUARDRAIL'
    | 'REDEMPTION_ENVELOPE_BLOCKED_BY_HASH_MISMATCH' | 'REDEMPTION_ENVELOPE_BLOCKED_BY_WRITE_SCOPE'
    | 'REDEMPTION_ENVELOPE_BLOCKED_BY_REDEEMABLE_TOKEN' | 'ESCALATE_TO_BOARD_OF_TRUSTEES' | null;
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
  redemption_envelope_signatures_json: { security_officer_confirmed?: boolean; compliance_officer_confirmed?: boolean; operations_director_confirmed?: boolean };
  redemption_envelope_metadata_json: Record<string, unknown>;
  source_activation_token_redemption_authorization_hash: string | null;
  source_activation_token_redemption_readiness_hash: string | null;
  source_activation_token_issuance_hash: string | null;
  source_activation_token_preflight_hash: string | null;
  source_activation_token_staging_hash: string | null;
  activation_token_redemption_envelope_hash: string | null;
  token_redemption_envelope_evidence_pack_hash: string | null;
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

export interface ActivationTokenRedemptionEnvelopeRule {
  rule_id: string;
  activation_token_redemption_envelope_id: string;
  check_type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  description: string;
  created_at: string;
}

export interface RedemptionEnvelopeSignatures {
  security_officer_confirmed: boolean;
  compliance_officer_confirmed: boolean;
  operations_director_confirmed: boolean;
}
