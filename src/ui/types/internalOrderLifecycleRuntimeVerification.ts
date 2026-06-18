export interface RuntimeVerificationSafetyMarkers {
  pilotOnly: boolean;
  runtimeVerificationOnly: boolean;
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
  productionActivationEnabled: boolean;
  serviceRestartExecuted: boolean;
  realRestartExecuted: boolean;
}

export interface RuntimeVerificationRun {
  verification_run_id: string;
  phase: string;
  tenant_id: string;
  linked_pilot_run_id: string | null;
  status: string;
  pilot_only: boolean;
  runtime_verification_only: boolean;
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
  production_activation_enabled: boolean;
  service_restart_executed: boolean;
  real_restart_executed: boolean;
  requested_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface RuntimeVerificationCheck {
  check_id: string;
  verification_run_id: string;
  check_type: string;
  check_status: string;
  check_result_json: Record<string, unknown> | null;
  persistence_mode: string | null;
  persistence_status: string | null;
  memory_fallback_production_valid: boolean;
  safety_snapshot_json: RuntimeVerificationSafetyMarkers | null;
  created_at: string;
  updated_at: string | null;
}

export interface RuntimeVerificationAudit {
  audit_id: string;
  verification_run_id: string;
  check_id: string | null;
  event_type: string;
  event_actor: string | null;
  event_payload_json: Record<string, unknown> | null;
  safety_snapshot_json: RuntimeVerificationSafetyMarkers | null;
  created_at: string;
}
