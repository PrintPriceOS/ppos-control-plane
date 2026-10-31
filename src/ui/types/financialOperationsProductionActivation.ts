export interface SafetyMarkers {
  production_activation_enabled: boolean;
  activation_execution_enabled: boolean;
  full_public_enabled: boolean;
  live_provider_connectivity_enabled: boolean;
  payment_execution_enabled: boolean;
  refund_execution_enabled: boolean;
  payout_execution_enabled: boolean;
  external_invoice_submission_enabled: boolean;
  tax_filing_enabled: boolean;
  vat_return_submission_enabled: boolean;
  external_report_submission_enabled: boolean;
  live_personal_data_export_enabled: boolean;
  source_record_mutation_enabled: boolean;
  is_review_only: boolean;
  safety_message: string;
}

export interface ProductionActivationGate {
  id: string;
  production_activation_gate_id: string;
  tenant_id: string | null;
  activation_gate_name: string;
  activation_gate_status: string;
  activation_gate_scope: string;
  activation_gate_mode: string;
  final_release_candidate_id: string | null;
  pre_production_runbook_id: string | null;
  go_live_simulation_id: string | null;
  activation_review_id: string | null;
  readiness_run_id: string | null;
  approval_status: string;
  activation_eligibility_status: string;
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
  source_snapshot_json: Record<string, any>;
  result_snapshot_json: Record<string, any>;
  metadata_json: Record<string, any>;
  created_at: string;
  created_by: string;
  updated_at: string;
}

export interface GateCheck {
  id: string;
  activation_gate_check_id: string;
  production_activation_gate_id: string;
  check_key: string;
  check_label: string;
  check_status: string;
  created_at: string;
  created_by: string;
  updated_at: string;
}

export interface GateApproval {
  id: string;
  activation_gate_approval_id: string;
  production_activation_gate_id: string;
  approval_role: string;
  approval_status: string;
  approver_reference: string | null;
  approver_reference_hash: string | null;
  approval_notes_json: { notes?: string } | null;
  created_at: string;
  created_by: string;
  updated_at: string;
}

export interface AuditTimelineEvent {
  id: string;
  event_type: string;
  actor_id: string;
  actor_type: string;
  production_activation_gate_id: string | null;
  activation_gate_check_id: string | null;
  activation_gate_approval_id: string | null;
  payload_json: { message?: string };
  created_at: string;
}

export interface RedactedExportRecord {
  tx_id: string;
  tenant_id: string;
  amount_gross: string;
  amount_net: string;
  tax_vat_amount: string;
  routing_provider_id: string;
  payout_reference: string;
  compliance_status: string;
}

export interface RedactedExportPreview {
  export_timestamp: string;
  export_scope: string;
  total_records: number;
  integrity_hash: string;
  records: RedactedExportRecord[];
}
