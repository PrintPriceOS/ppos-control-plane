export interface ReadinessRecord {
  readiness_id: string;
  source_approval_id: string;
  source_prep_id: string;
  source_review_id: string;
  source_simulation_id: string;
  source_execution_id: string;
  cohort_id: string;
  tenant_id: string;
  simulation_type: string;
  readiness_status: 'DRAFT' | 'READY_FOR_EVALUATION' | 'EVALUATED' | 'READY_FOR_DECISION' | 'READINESS_APPROVED' | 'READINESS_REJECTED' | 'BLOCKED' | 'FINALIZED' | 'SUPERSEDED';
  readiness_decision: string | null;
  risk_level: string;
  confidence_level: string;
  projected_impact_score: number | null;
  rollback_feasibility_score: number | null;
  evidence_completeness_score: number | null;
  guardrail_status: string;
  write_scope_status: string;
  kill_switch_status: string;
  rollback_authority_status: string;
  readiness_summary_json: any;
  impact_review_json: any;
  rollback_review_json: any;
  guardrail_review_json: any;
  readiness_checks_json: any;
  readiness_blockers_json: any;
  non_execution_attestation_json: any;
  write_scope_attestation_json: any;
  source_approval_hash: string;
  source_approval_evidence_pack_hash: string;
  readiness_result_hash: string | null;
  evidence_pack_hash: string | null;
  lineage_hash_chain_json: any;
  execution_capability_status: string;
  execution_readiness_status: string;
  readiness_execution_status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  finalized_by: string | null;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReadinessCheck {
  check_id: string;
  readiness_id: string;
  check_type: string;
  severity: string;
  description: string;
  created_at: string;
}

export interface ReadinessEvidence {
  evidence_id: string;
  readiness_id: string;
  evidence_schema_version: string;
  evidence_pack_hash: string;
  evidence_payload_json: any;
  lineage_hash_chain_json: any;
  created_at: string;
}

export interface ReadinessAuditLog {
  audit_event_id: string;
  readiness_id: string;
  event_type: string;
  actor_id: string;
  details_json: any;
  created_at: string;
}
