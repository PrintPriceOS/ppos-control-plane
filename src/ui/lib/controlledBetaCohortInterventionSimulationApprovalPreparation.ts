export interface PrepSummary {
  projected_impact_score: number;
  rollback_feasibility_score: number;
  evidence_completeness_score: number;
  risk_level: string;
  confidence_level: string;
  guardrail_status: string;
  write_scope_status: string;
  outcome_suggestion: string;
}

export interface PrepRecord {
  prep_id: string;
  source_review_id: string;
  source_simulation_id: string;
  source_execution_id: string;
  cohort_id: string;
  tenant_id: string;
  simulation_type: string;
  prep_status: 'DRAFT' | 'READY_FOR_EVALUATION' | 'EVALUATED' | 'READY_FOR_FINALIZATION' | 'FINALIZED' | 'RE_SIMULATION_REQUESTED' | 'ESCALATED' | 'REJECTED' | 'SUPERSEDED';
  prep_outcome: string | null;
  risk_level: string;
  confidence_level: string;
  projected_impact_score: number | null;
  rollback_feasibility_score: number | null;
  evidence_completeness_score: number | null;
  guardrail_status: string;
  write_scope_status: string;
  prepared_by: string | null;
  finalized_by: string | null;
  prep_summary_json: any;
  impact_review_json: any;
  rollback_review_json: any;
  guardrail_review_json: any;
  write_scope_attestation_json: any;
  approval_readiness_json: any;
  prep_blockers_json: any;
  non_execution_attestation_json: any;
  source_review_hash: string;
  source_review_evidence_pack_hash: string;
  prep_result_hash: string | null;
  evidence_pack_hash: string | null;
  execution_capability_status: string;
  approval_execution_status: string;
  created_at: string;
  updated_at: string;
  prepared_at: string | null;
  finalized_at: string | null;
  superseded_at: string | null;
}

export interface PrepFinding {
  finding_id: string;
  prep_id: string;
  finding_type: string;
  severity: string;
  description: string;
  created_at: string;
}

export interface PrepEvidence {
  evidence_id: string;
  prep_id: string;
  evidence_schema_version: string;
  evidence_pack_hash: string;
  evidence_payload_json: any;
  lineage_hash_chain_json: any;
  created_at: string;
}

export interface PrepAuditLog {
  audit_event_id: string;
  prep_id: string;
  event_type: string;
  actor_id: string;
  details_json: any;
  created_at: string;
}
