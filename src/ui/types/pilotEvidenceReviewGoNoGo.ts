export interface PilotEvidenceReviewSafetyMarkers {
  pilotOnly: boolean;
  reviewOnly: boolean;
  decisionOnly: boolean;
  fullPublicEnabled: boolean;
  openMarketplaceAccessEnabled: boolean;
  liveProviderConnectivityEnabled: boolean;
  paymentExecutionEnabled: boolean;
  refundExecutionEnabled: boolean;
  payoutExecutionEnabled: boolean;
  externalTaxSubmissionEnabled: boolean;
  externalAccountingSubmissionEnabled: boolean;
  providerExternalSubmissionEnabled: boolean;
  sourceMutationOutsidePilotScope: boolean;
  productionActivationEnabled: boolean;
  betaEnabled: boolean;
}

export interface PilotEvidenceReviewBoard {
  review_board_id: string;
  phase: string;
  board_status: string;
  board_name: string | null;
  board_description: string | null;
  review_scope_json: unknown;
  pilot_only: boolean;
  review_only: boolean;
  decision_only: boolean;
  beta_enabled: boolean;
  production_activation_enabled: boolean;
  full_public_enabled: boolean;
  open_marketplace_enabled: boolean;
  payment_execution_enabled: boolean;
  refund_execution_enabled: boolean;
  payout_execution_enabled: boolean;
  provider_external_submission_enabled: boolean;
  external_tax_submission_enabled: boolean;
  external_accounting_submission_enabled: boolean;
  source_mutation_enabled: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface PilotEvidenceReviewCheck {
  review_check_id: string;
  review_board_id: string;
  check_key: string;
  check_label: string;
  check_status: string;
  check_evidence_json: unknown;
  check_notes: string | null;
  phase_reference: string | null;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface PilotEvidenceReviewFinding {
  finding_id: string;
  review_board_id: string;
  finding_type: string;
  finding_status: string;
  blocks_go_decision: boolean;
  severity: string;
  summary: string | null;
  details_json: unknown;
  resolved_at: string | null;
  resolved_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface PilotEvidenceGoNoGoDecision {
  decision_id: string;
  review_board_id: string;
  decision_status: string;
  decision_outcome: string | null;
  decision_rationale: string | null;
  readiness_snapshot_json: unknown;
  unresolved_blockers_count: number;
  total_checks_count: number;
  passed_checks_count: number;
  failed_checks_count: number;
  betaEnabled: boolean;
  productionActivationEnabled: boolean;
  fullPublicEnabled: boolean;
  openMarketplaceEnabled: boolean;
  paymentExecutionEnabled: boolean;
  refundExecutionEnabled: boolean;
  payoutExecutionEnabled: boolean;
  providerExternalSubmissionEnabled: boolean;
  externalTaxSubmissionEnabled: boolean;
  externalAccountingSubmissionEnabled: boolean;
  sourceMutationEnabled: boolean;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface PilotEvidenceReviewAudit {
  audit_id: string;
  review_board_id: string;
  decision_id: string | null;
  event_type: string;
  event_detail_json: unknown;
  safety_snapshot_json: unknown;
  actor: string | null;
  created_at: string;
}

export interface PilotEvidenceReviewPack {
  evidence_pack_id: string;
  review_board_id: string;
  decision_id: string | null;
  evidence_status: string;
  evidence_data_json: unknown;
  evidence_hash: string | null;
  evidence_schema_version: string;
  redaction_classification: string;
  generated_at: string;
  generated_by: string | null;
}
