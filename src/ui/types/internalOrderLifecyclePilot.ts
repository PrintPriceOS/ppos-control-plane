export interface InternalOrderLifecyclePilotSafetyMarkers {
  pilotOnly: boolean;
  internalOrderLifecycleOnly: boolean;
  reviewOnly: boolean;
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
}

export interface InternalOrderLifecyclePilotRun {
  pilot_run_id: string;
  phase: string;
  tenant_id: string;
  pilot_activation_reference_id: string | null;
  status: string;
  pilot_only: boolean;
  internal_order_lifecycle_only: boolean;
  review_only: boolean;
  full_public_enabled: boolean;
  open_marketplace_access_enabled: boolean;
  live_provider_connectivity_enabled: boolean;
  payment_execution_enabled: boolean;
  refund_execution_enabled: boolean;
  payout_execution_enabled: boolean;
  external_tax_submission_enabled: boolean;
  external_accounting_submission_enabled: boolean;
  provider_external_submission_enabled: boolean;
  source_mutation_outside_pilot_scope: boolean;
  requested_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface InternalOrderLifecyclePilotOrder {
  pilot_order_id: string;
  pilot_run_id: string;
  tenant_id: string;
  internal_customer_reference: string | null;
  pricing_snapshot_reference: string | null;
  file_package_reference: string | null;
  preflight_reference: string | null;
  invoice_readiness_reference: string | null;
  production_readiness_reference: string | null;
  order_status: string;
  lifecycle_snapshot_json: Record<string, unknown> | null;
  safety_snapshot_json: InternalOrderLifecyclePilotSafetyMarkers | null;
  created_at: string;
  updated_at: string | null;
}

export interface InternalOrderLifecyclePilotStep {
  step_id: string;
  pilot_run_id: string;
  pilot_order_id: string | null;
  step_key: string;
  step_status: string;
  step_result_json: Record<string, unknown> | null;
  safety_snapshot_json: InternalOrderLifecyclePilotSafetyMarkers | null;
  created_at: string;
  updated_at: string | null;
}

export interface InternalOrderLifecyclePilotFinding {
  finding_id: string;
  pilot_run_id: string;
  pilot_order_id: string | null;
  severity: string;
  finding_key: string;
  finding_status: string;
  blocks_lifecycle: boolean;
  finding_details_json: Record<string, unknown> | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface InternalOrderLifecyclePilotAudit {
  audit_id: string;
  pilot_run_id: string;
  pilot_order_id: string | null;
  event_type: string;
  event_actor: string | null;
  event_payload_json: Record<string, unknown> | null;
  safety_snapshot_json: InternalOrderLifecyclePilotSafetyMarkers | null;
  created_at: string;
}

export interface InternalOrderLifecyclePilotEvidencePack {
  evidence_pack_id: string;
  pilot_run_id: string;
  pilot_order_id: string | null;
  evidence_status: string;
  evidence_pack_json: Record<string, unknown>;
  redacted_preview_json: Record<string, unknown> | null;
  generated_at: string;
  generated_by: string | null;
}
