export interface RuntimeActivityReview {
  review_id: string;
  cohort_id: string;
  tenant_id: string;
  review_window_start: string;
  review_window_end: string;
  reviewed_by?: string;
  review_status: 'DRAFT' | 'READY_FOR_REVIEW' | 'UNDER_REVIEW' | 'FINALIZED' | 'SUPERSEDED';
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence_level: 'LOW' | 'MEDIUM' | 'HIGH';
  non_mutation_attestation_json: {
    cohort_access_mutated: boolean;
    participant_access_mutated: boolean;
    invite_access_mutated: boolean;
    billing_state_mutated: boolean;
    payment_execution_triggered: boolean;
    provider_submission_triggered: boolean;
    marketplace_scope_changed: boolean;
    auto_enforcement_triggered: boolean;
  };
  created_at: string;
  updated_at: string;
  finalized_at?: string;
  superseded_at?: string;
  superseded_by_review_id?: string;
  superseded_reason?: string;
}

export interface RuntimeActivityReviewDecision {
  decision_id: string;
  review_id: string;
  recommended_decision: 'CONTINUE_COHORT' | 'PAUSE_COHORT' | 'REQUIRE_MANUAL_INTERVENTION' | 'MARK_OPERATIONAL_RISK' | 'PREPARE_CONTROLLED_EXPANSION' | 'REQUEST_MORE_OBSERVATION';
  decision_execution_status: 'NOT_EXECUTED_REVIEW_ONLY';
  execution_blocked_reason: string;
  rationale?: string;
  created_at: string;
}

export interface RuntimeActivityReviewFinding {
  finding_id: string;
  review_id: string;
  finding_key: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details_json?: any;
  created_at: string;
}

export interface RuntimeActivityReviewEvidence {
  evidence_id: string;
  review_id: string;
  input_snapshot_hash: string;
  evaluation_result_hash: string;
  evidence_pack_hash: string;
  evidence_schema_version: string;
  evidence_data_json: any;
  created_at: string;
}

export interface RuntimeActivityReviewAudit {
  audit_event_id: string;
  review_id: string;
  event_type: string;
  actor_id: string;
  details_json?: any;
  created_at: string;
}
