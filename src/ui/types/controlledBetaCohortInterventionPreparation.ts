export interface CohortInterventionPreparation {
  preparation_id: string;
  source_review_id: string;
  cohort_id: string;
  tenant_id: string;
  recommended_decision_from_phase137: string;
  preparation_type: string;
  preparation_status: 'DRAFT' | 'READY_FOR_REVIEW' | 'UNDER_REVIEW' | 'FINALIZED' | 'SUPERSEDED' | 'REJECTED';
  preparation_execution_status: string;
  source_review_evidence_pack_hash?: string;
  source_review_evaluation_result_hash?: string;
  source_review_input_snapshot_hash?: string;
  finalization_blockers_json?: {
    missing_evidence_pack: boolean;
    missing_required_approvals: boolean;
    non_execution_attestation_invalid: boolean;
    guardrail_failed: boolean;
    source_review_not_finalized: boolean;
  };
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence_level: 'LOW' | 'MEDIUM' | 'HIGH';
  prepared_by?: string;
  reviewed_by?: string;
  preparation_window_start: string;
  preparation_window_end: string;
  intervention_summary_json: {
    summary: string;
  };
  proposed_actions_json: Array<{
    action_key: string;
    description: string;
  }>;
  required_approvals_json: Array<{
    role: string;
    approved: boolean;
    approved_by: string | null;
    approved_at?: string;
  }>;
  rollback_considerations_json: string[];
  communication_plan_json: string[];
  non_execution_attestation_json: {
    non_execution_acknowledged: boolean;
    readiness_only_attested: boolean;
    timestamp: string;
    attested_by: string;
  };
  created_at: string;
  updated_at: string;
  reviewed_at?: string;
  finalized_at?: string;
  superseded_at?: string;
  superseded_by_preparation_id?: string;
  superseded_reason?: string;
  rejected_at?: string;
  rejected_reason?: string;
}

export interface CohortInterventionPreparationItem {
  item_id: string;
  preparation_id: string;
  action_key: string;
  description: string;
  item_status: 'PENDING' | 'COMPLETED' | 'SKIPPED';
  created_at: string;
}

export interface CohortInterventionPreparationEvidence {
  evidence_id: string;
  preparation_id: string;
  input_review_hash: string;
  preparation_result_hash: string;
  evidence_pack_hash: string;
  evidence_schema_version: string;
  evidence_data_json: any;
  created_at: string;
}
