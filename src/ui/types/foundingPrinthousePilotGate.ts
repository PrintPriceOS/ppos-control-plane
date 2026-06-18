export interface FoundingPrinthousePilotSafetyMarkers {
  pilotOnly: boolean;
  foundingPrinthouseOnly: boolean;
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
  productionHandoffAllowed: boolean;
  automaticProductionDispatch: boolean;
}

export interface FoundingPrinthousePilotProgram {
  pilot_program_id: string;
  phase: string;
  tenant_id: string;
  program_name: string;
  program_status: string;
  program_scope_json: Record<string, unknown> | null;
  allowed_order_types_json: Record<string, unknown> | null;
  pilot_only: boolean;
  founding_printhouse_only: boolean;
  review_only: boolean;
  full_public_enabled: boolean;
  open_marketplace_enabled: boolean;
  payment_execution_enabled: boolean;
  production_handoff_allowed: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface FoundingPrinthousePilotParticipant {
  participant_id: string;
  pilot_program_id: string;
  printhouse_tenant_id: string;
  printhouse_name: string;
  participant_status: string;
  pilot_scope_json: Record<string, unknown> | null;
  allowed_order_types_json: Record<string, unknown> | null;
  allowed_file_access_level: string;
  production_handoff_allowed: boolean;
  payment_execution_allowed: boolean;
  provider_submission_allowed: boolean;
  full_public_enabled: boolean;
  open_marketplace_enabled: boolean;
  review_only: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface FoundingPrinthousePilotOrderLink {
  order_link_id: string;
  pilot_program_id: string;
  participant_id: string;
  pilot_run_id: string | null;
  pilot_order_id: string | null;
  printhouse_tenant_id: string;
  link_status: string;
  order_handoff_readiness: string;
  review_only: boolean;
  production_handoff_allowed: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface FoundingPrinthousePilotFinding {
  finding_id: string;
  pilot_program_id: string;
  participant_id: string | null;
  order_link_id: string | null;
  finding_type: string;
  finding_status: string;
  blocks_handoff: boolean;
  severity: string;
  summary: string | null;
  details_json: Record<string, unknown> | null;
  created_by: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface FoundingPrinthousePilotAudit {
  audit_id: string;
  pilot_program_id: string | null;
  participant_id: string | null;
  order_link_id: string | null;
  event_type: string;
  event_actor: string | null;
  event_payload_json: Record<string, unknown> | null;
  safety_snapshot_json: FoundingPrinthousePilotSafetyMarkers | null;
  created_at: string;
}
