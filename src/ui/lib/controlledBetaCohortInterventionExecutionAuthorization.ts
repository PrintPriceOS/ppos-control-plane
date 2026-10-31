export interface AuthRecord {
  auth_id: string;
  source_readiness_id: string;
  source_approval_id: string;
  source_prep_id: string;
  source_review_id: string;
  source_simulation_id: string;
  source_execution_id: string;
  cohort_id: string;
  tenant_id: string;
  simulation_type: string;
  auth_status: 'DRAFT' | 'READY_FOR_EVALUATION' | 'EVALUATED' | 'READY_FOR_DECISION' | 'AUTHORIZED' | 'REJECTED' | 'BLOCKED' | 'FINALIZED' | 'SUPERSEDED';
  auth_decision: string | null;
  risk_level: string;
  confidence_level: string;
  projected_impact_score: number | null;
  rollback_feasibility_score: number | null;
  evidence_completeness_score: number | null;
  guardrail_status: string;
  write_scope_status: string;
  canary_envelope_json: any;
  auth_summary_json: any;
  impact_review_json: any;
  rollback_review_json: any;
  guardrail_review_json: any;
  auth_rules_json: any;
  auth_blockers_json: any;
  non_execution_attestation_json: any;
  write_scope_attestation_json: any;
  source_readiness_hash: string;
  source_readiness_evidence_pack_hash: string;
  auth_result_hash: string | null;
  evidence_pack_hash: string | null;
  lineage_hash_chain_json: any;
  execution_capability_status: string;
  execution_authorization_status: string;
  auth_execution_status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  finalized_by: string | null;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthRuleCheck {
  rule_id: string;
  auth_id: string;
  check_type: string;
  severity: string;
  description: string;
  created_at: string;
}

export interface AuthEvidence {
  evidence_id: string;
  auth_id: string;
  evidence_schema_version: string;
  evidence_pack_hash: string;
  evidence_payload_json: any;
  lineage_hash_chain_json: any;
  created_at: string;
}

export interface AuthAuditLog {
  audit_event_id: string;
  auth_id: string;
  event_type: string;
  actor_id: string;
  details_json: any;
  created_at: string;
}
