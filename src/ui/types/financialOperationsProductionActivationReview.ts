export interface ProductionActivationGate {
  id: string;
  production_activation_gate_id: string;
  tenant_id: string | null;
  activation_gate_name: string;
  activation_gate_status: string;
  activation_gate_scope: string | null;
  activation_gate_mode: string | null;
  final_release_candidate_id: string | null;
  pre_production_runbook_id: string | null;
  go_live_simulation_id: string | null;
  activation_review_id: string | null;
  readiness_run_id: string | null;
  approval_status: string | null;
  activation_eligibility_status: string | null;
  production_activation_enabled: boolean;
  activation_execution_enabled: boolean;
  full_public_enabled: boolean;
  live_provider_connectivity_enabled: boolean;
  live_credentials_enabled: boolean;
  payment_execution_enabled: boolean;
  refund_execution_enabled: boolean;
  payout_execution_enabled: boolean;
  external_invoice_submission_enabled: boolean;
  tax_filing_enabled: boolean;
  vat_return_submission_enabled: boolean;
  external_report_submission_enabled: boolean;
  live_personal_data_export_enabled: boolean;
  source_record_mutation_enabled: boolean;
  blockers_json: string[];
  warnings_json: string[];
  evidence_json: Record<string, any>;
  source_snapshot_json?: Record<string, any>;
  result_snapshot_json?: Record<string, any>;
  metadata_json?: Record<string, any>;
  created_at: string;
  created_by: string;
  updated_at: string;
  completed_at?: string | null;
  completed_by?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  revoked_at?: string | null;
  revoked_by?: string | null;
}

export interface ProductionActivationGateCheck {
  id: string;
  activation_gate_check_id: string;
  production_activation_gate_id: string;
  check_key: string;
  check_label: string;
  check_status: string;
  check_order?: number;
  category?: string;
  required_for_activation_gate?: boolean;
  blockers_json?: string[];
  warnings_json?: string[];
  evidence_json?: Record<string, any>;
  created_at: string;
  created_by: string;
  updated_at: string;
  completed_at?: string | null;
  completed_by?: string | null;
}

export interface ProductionActivationGateApproval {
  id: string;
  activation_gate_approval_id: string;
  production_activation_gate_id: string;
  approval_role: string;
  approval_status: string;
  approver_reference: string | null;
  approver_reference_hash: string | null;
  approval_notes_json: { notes?: string } | null;
  evidence_json?: Record<string, any>;
  created_at: string;
  created_by: string;
  updated_at: string;
  approved_at?: string | null;
  approved_by?: string | null;
  rejected_at?: string | null;
  rejected_by?: string | null;
  revoked_at?: string | null;
  revoked_by?: string | null;
}

export interface ProductionActivationGateFinding {
  id: string;
  production_activation_gate_id: string;
  activation_gate_check_id?: string | null;
  activation_gate_approval_id?: string | null;
  finding_code: string;
  severity: string;
  category: string;
  message: string;
  recommended_action?: string | null;
  evidence_json?: Record<string, any> | null;
  status: string;
  created_at: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
}

export interface ProductionActivationGateAuditEvent {
  id: string;
  event_type: string;
  actor_id?: string | null;
  actor_type: string;
  production_activation_gate_id?: string | null;
  activation_gate_check_id?: string | null;
  activation_gate_approval_id?: string | null;
  tenant_id?: string | null;
  payload_json: Record<string, any>;
  created_at: string;
}
