export interface CohortInterventionExecution {
  execution_id: string;
  source_approval_id: string;
  source_preparation_id: string;
  source_review_id: string;
  cohort_id: string;
  tenant_id: string;
  execution_type: string;
  execution_status: 'DRAFT' | 'READY_FOR_DRY_RUN' | 'DRY_RUN_COMPLETED' | 'READY_FOR_OPERATOR_CONFIRMATION' | 'CONFIRMED_FOR_EXECUTION' | 'EXECUTION_IN_PROGRESS' | 'EXECUTED' | 'EXECUTION_FAILED' | 'ROLLBACK_REQUIRED' | 'ROLLBACK_COMPLETED' | 'CANCELLED' | 'SUPERSEDED';
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence_level: 'LOW' | 'MEDIUM' | 'HIGH';
  dry_run_hash?: string;
  operator_confirmed: boolean;
  operator_confirmed_by?: string;
  operator_confirmed_at?: string;
  operator_confirmation_phrase?: string;
  operator_confirmation_signature?: string;
  safe_scope_attestation_json: {
    cohort_pause_executed: boolean;
    participant_access_restricted: boolean;
    invite_revoked: boolean;
    cohort_expanded: boolean;
    payment_action_triggered: boolean;
    provider_submission_triggered: boolean;
    tax_accounting_submission_triggered: boolean;
    public_marketplace_enabled: boolean;
    only_safe_scope_marker_or_task_created: boolean;
  };
  execution_blockers_json: {
    missing_dry_run: boolean;
    missing_rollback_plan: boolean;
    missing_operator_confirmation: boolean;
    guardrail_failed: boolean;
    already_executed: boolean;
  };
  execution_findings_json: any[];
  lineage_hashes_json: {
    source_approval_hash: string;
    source_approval_evidence_pack_hash: string;
    source_preparation_hash: string;
    source_preparation_evidence_pack_hash: string;
    source_review_evidence_pack_hash: string;
  };
  evidence_pack_hash?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  finished_at?: string;
  cancelled_at?: string;
  cancelled_by?: string;
  cancelled_reason?: string;
  superseded_at?: string;
  superseded_by_execution_id?: string;
  superseded_reason?: string;
}

export interface CohortInterventionExecutionStep {
  step_id: string;
  execution_id: string;
  step_key: string;
  description: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  completed_at: string | null;
}
