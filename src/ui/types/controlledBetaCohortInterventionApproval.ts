export interface CohortInterventionApproval {
  approval_id: string;
  source_preparation_id: string;
  source_review_id: string;
  cohort_id: string;
  tenant_id: string;
  preparation_type: string;
  recommended_decision_from_phase137: string;
  approval_status: 'DRAFT' | 'READY_FOR_APPROVAL' | 'UNDER_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'RETURNED_TO_PREPARATION' | 'ESCALATED' | 'FINALIZED' | 'SUPERSEDED';
  approval_decision?: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence_level: 'LOW' | 'MEDIUM' | 'HIGH';
  approval_policy_json: {
    policy_name: string;
    required_roles: string[];
  };
  required_approvers_json: Array<{
    role: string;
    signed: boolean;
    signed_by: string | null;
    signed_at?: string;
  }>;
  approval_steps_json: Array<{
    step_key: string;
    description: string;
    status: 'PENDING' | 'SIGNED' | 'BYPASSED';
  }>;
  approval_findings_json: any[];
  approval_blockers_json?: {
    missing_evidence_pack: boolean;
    missing_required_signatures: boolean;
    non_execution_attestation_invalid: boolean;
    guardrail_failed: boolean;
    source_preparation_not_finalized: boolean;
  };
  non_execution_attestation_json: {
    approval_executed_intervention: boolean;
    cohort_access_mutated: boolean;
    participant_access_mutated: boolean;
    invite_access_mutated: boolean;
    billing_state_mutated: boolean;
    payment_execution_triggered: boolean;
    refund_execution_triggered: boolean;
    payout_execution_triggered: boolean;
    provider_submission_triggered: boolean;
    tax_submission_triggered: boolean;
    accounting_submission_triggered: boolean;
    marketplace_scope_changed: boolean;
    public_signup_enabled: boolean;
    public_beta_enabled: boolean;
    auto_expansion_triggered: boolean;
    auto_revocation_triggered: boolean;
    auto_enforcement_triggered: boolean;
    source_mutation_triggered: boolean;
    execution_job_created: boolean;
  };
  source_preparation_hash: string;
  source_preparation_evidence_pack_hash: string;
  source_review_evidence_pack_hash: string;
  approval_result_hash?: string;
  evidence_pack_hash?: string;
  requested_by?: string;
  reviewed_by?: string;
  approved_by?: string;
  rejected_by?: string;
  created_at: string;
  updated_at: string;
  reviewed_at?: string;
  approved_at?: string;
  rejected_at?: string;
  finalized_at?: string;
  superseded_at?: string;
  superseded_by_approval_id?: string;
  superseded_reason?: string;
  rejected_reason?: string;
}

export interface CohortInterventionApprovalStep {
  step_id: string;
  approval_id: string;
  role: string;
  approver_id: string | null;
  status: 'PENDING' | 'SIGNED' | 'BYPASSED';
  signed_at: string | null;
  created_at: string;
}

export interface CohortInterventionApprovalEvidence {
  evidence_id: string;
  approval_id: string;
  input_preparation_hash: string;
  approval_result_hash: string;
  evidence_pack_hash: string;
  evidence_schema_version: string;
  evidence_data_json: any;
  created_at: string;
}
