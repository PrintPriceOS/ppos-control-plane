export interface ApprovalSummary {
  projected_impact_score: number;
  rollback_feasibility_score: number;
  evidence_completeness_score: number;
  risk_level: string;
  confidence_level: string;
  guardrail_status: string;
  write_scope_status: string;
  outcome_decision: string;
}

export interface ApprovalRecord {
  approval_id: string;
  source_prep_id: string;
  source_review_id: string;
  source_simulation_id: string;
  source_execution_id: string;
  cohort_id: string;
  tenant_id: string;
  simulation_type: string;
  approval_status: 'DRAFT' | 'READY_FOR_EVALUATION' | 'EVALUATED' | 'READY_FOR_DECISION' | 'APPROVED' | 'REJECTED' | 'BLOCKED' | 'ESCALATED' | 'SUPERSEDED' | 'FINALIZED';
  approval_decision: string | null;
  risk_level: string;
  confidence_level: string;
  projected_impact_score: number | null;
  rollback_feasibility_score: number | null;
  evidence_completeness_score: number | null;
  guardrail_status: string;
  write_scope_status: string;
  approved_by: string | null;
  finalized_by: string | null;
  approval_summary_json: any;
  impact_review_json: any;
  rollback_review_json: any;
  guardrail_review_json: any;
  write_scope_attestation_json: any;
  approval_readiness_json: any;
  approval_blockers_json: any;
  non_execution_attestation_json: any;
  source_prep_hash: string;
  source_prep_evidence_pack_hash: string;
  approval_result_hash: string | null;
  evidence_pack_hash: string | null;
  execution_capability_status: string;
  approval_execution_status: string;
  future_execution_eligibility_status: string;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  finalized_at: string | null;
  superseded_at: string | null;
}

export interface ApprovalFinding {
  finding_id: string;
  approval_id: string;
  finding_type: string;
  severity: string;
  description: string;
  created_at: string;
}

export interface ApprovalEvidence {
  evidence_id: string;
  approval_id: string;
  evidence_schema_version: string;
  evidence_pack_hash: string;
  evidence_payload_json: any;
  lineage_hash_chain_json: any;
  created_at: string;
}

export interface ApprovalAuditLog {
  audit_event_id: string;
  approval_id: string;
  event_type: string;
  actor_id: string;
  details_json: any;
  created_at: string;
}
