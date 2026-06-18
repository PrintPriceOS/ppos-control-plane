export interface SandboxCommercialSafetyMarkers {
  pilotOnly: boolean;
  sandboxOnly: boolean;
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
  providerLiveCaptureEnabled: boolean;
  sourceMutationOutsidePilotScope: boolean;
  productionActivationEnabled: boolean;
  invoiceIssued: boolean;
  invoicePreviewOnly: boolean;
  paymentSimulationOnly: boolean;
  payoutPreviewOnly: boolean;
}

export interface SandboxCommercialPilotRun {
  sandbox_run_id: string;
  phase: string;
  pilot_program_id: string | null;
  participant_id: string | null;
  pilot_order_id: string;
  handoff_package_id: string | null;
  printhouse_tenant_id: string | null;
  run_status: string;
  sandbox_only: boolean;
  pilot_only: boolean;
  review_only: boolean;
  payment_execution_enabled: boolean;
  refund_execution_enabled: boolean;
  payout_execution_enabled: boolean;
  external_tax_submission_enabled: boolean;
  external_accounting_submission_enabled: boolean;
  provider_live_capture_enabled: boolean;
  provider_external_submission_enabled: boolean;
  source_mutation_enabled: boolean;
  full_public_enabled: boolean;
  open_marketplace_enabled: boolean;
  production_activation_enabled: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface SandboxCommercialInvoicePreview {
  invoice_preview_id: string;
  sandbox_run_id: string;
  pilot_order_id: string | null;
  invoice_preview_status: string;
  invoice_preview_only: boolean;
  invoice_issued: boolean;
  source_mutation: boolean;
  invoice_data_json: Record<string, unknown> | null;
  currency: string | null;
  total_amount_preview: number | null;
  line_items_json: Record<string, unknown>[] | null;
  created_by: string | null;
  created_at: string;
}

export interface SandboxCommercialPaymentSimulation {
  payment_simulation_id: string;
  sandbox_run_id: string;
  pilot_order_id: string | null;
  simulation_type: string;
  simulation_status: string;
  payment_simulation_only: boolean;
  payment_execution_enabled: boolean;
  refund_execution_enabled: boolean;
  payout_execution_enabled: boolean;
  live_provider_connectivity_enabled: boolean;
  simulated_amount: number | null;
  simulated_currency: string | null;
  simulated_provider: string | null;
  simulation_result_json: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
}

export interface SandboxCommercialSettlementPreview {
  settlement_preview_id: string;
  sandbox_run_id: string;
  pilot_order_id: string | null;
  settlement_status: string;
  payout_preview_only: boolean;
  payout_execution_enabled: boolean;
  settlement_amount_preview: number | null;
  settlement_currency: string | null;
  printhouse_payout_preview: number | null;
  platform_fee_preview: number | null;
  settlement_data_json: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
}

export interface SandboxCommercialPrinthouseConfirmation {
  confirmation_id: string;
  sandbox_run_id: string;
  participant_id: string | null;
  printhouse_tenant_id: string | null;
  confirmation_status: string;
  confirmation_type: string;
  confirmation_notes: string | null;
  confirmed_by: string | null;
  created_at: string;
}

export interface SandboxCommercialFinding {
  finding_id: string;
  sandbox_run_id: string;
  pilot_order_id: string | null;
  finding_type: string;
  finding_status: string;
  blocks_commercial: boolean;
  severity: string;
  summary: string | null;
  details_json: Record<string, unknown> | null;
  created_by: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface SandboxCommercialAudit {
  audit_id: string;
  sandbox_run_id: string | null;
  pilot_order_id: string | null;
  event_type: string;
  event_actor: string | null;
  event_payload_json: Record<string, unknown> | null;
  safety_snapshot_json: SandboxCommercialSafetyMarkers | null;
  created_at: string;
}
