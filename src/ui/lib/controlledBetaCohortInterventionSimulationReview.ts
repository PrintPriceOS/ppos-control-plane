export interface ReviewSummary {
  projected_impact_score: number;
  rollback_feasibility_score: number;
  evidence_completeness_score: number;
  risk_level: string;
  confidence_level: string;
  guardrail_status: string;
  write_scope_status: string;
  suggested_decision: string;
}

export interface ReviewRecord {
  review_id: string;
  source_simulation_id: string;
  source_execution_id: string;
  source_approval_id: string | null;
  source_preparation_id: string | null;
  source_review_id: string | null;
  cohort_id: string;
  tenant_id: string;
  simulation_type: string;
  review_status: 'DRAFT' | 'READY_FOR_REVIEW' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'ESCALATED' | 'BLOCKED' | 'FINALIZED' | 'SUPERSEDED';
  review_decision: string | null;
  risk_level: string;
  confidence_level: string;
  projected_impact_score: number | null;
  rollback_feasibility_score: number | null;
  evidence_completeness_score: number | null;
  guardrail_status: string;
  write_scope_status: string;
  reviewed_by: string | null;
  finalized_by: string | null;
  review_summary_json: any;
  impact_review_json: any;
  rollback_review_json: any;
  guardrail_review_json: any;
  write_scope_attestation_json: any;
  approval_readiness_json: any;
  review_blockers_json: any;
  non_execution_attestation_json: any;
  source_simulation_hash: string;
  source_simulation_evidence_pack_hash: string;
  source_execution_evidence_pack_hash: string;
  review_result_hash: string | null;
  evidence_pack_hash: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  finalized_at: string | null;
  superseded_at: string | null;
}

export interface ReviewFinding {
  finding_id: string;
  review_id: string;
  finding_type: string;
  severity: string;
  description: string;
  created_at: string;
}

export interface ReviewDecision {
  decision_id: string;
  review_id: string;
  decision: string;
  rationale: string;
  actor_id: string;
  created_at: string;
}

export interface ReviewEvidence {
  evidence_id: string;
  review_id: string;
  evidence_schema_version: string;
  evidence_pack_hash: string;
  evidence_payload_json: any;
  lineage_hash_chain_json: any;
  created_at: string;
}

export interface ReviewAuditLog {
  audit_event_id: string;
  review_id: string;
  event_type: string;
  actor_id: string;
  details_json: any;
  created_at: string;
}
