export interface ControlledPrinthouseHandoffSafetyMarkers {
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
  productionDispatchEnabled: boolean;
  automaticProductionDispatch: boolean;
  unrestrictedFileAccess: boolean;
  permanentPublicUrl: boolean;
}

export interface ControlledPrinthouseHandoffPackage {
  handoff_package_id: string;
  phase: string;
  pilot_program_id: string;
  participant_id: string;
  pilot_order_id: string | null;
  order_link_id: string | null;
  printhouse_tenant_id: string;
  package_status: string;
  file_access_scope: string;
  file_access_expires_at: string | null;
  file_download_audit_required: boolean;
  pilot_only: boolean;
  founding_printhouse_only: boolean;
  review_only: boolean;
  production_dispatch_enabled: boolean;
  provider_submission_enabled: boolean;
  payment_execution_enabled: boolean;
  full_public_enabled: boolean;
  open_marketplace_enabled: boolean;
  unrestricted_file_access: boolean;
  permanent_public_url: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ControlledPrinthouseHandoffPackageFile {
  package_file_id: string;
  handoff_package_id: string;
  file_name: string | null;
  file_type: string | null;
  file_size_bytes: number | null;
  file_scope: string;
  file_metadata_json: Record<string, unknown> | null;
  preflight_status: string;
  production_constraints_json: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
}

export interface ControlledPrinthouseHandoffAccessGrant {
  access_grant_id: string;
  handoff_package_id: string;
  participant_id: string;
  printhouse_tenant_id: string;
  pilot_order_id: string | null;
  grant_status: string;
  access_scope: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  download_audit_required: boolean;
  unrestricted_file_access: boolean;
  permanent_public_url: boolean;
  created_by: string | null;
  created_at: string;
}

export interface ControlledPrinthouseHandoffFinding {
  finding_id: string;
  handoff_package_id: string;
  pilot_program_id: string;
  participant_id: string | null;
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

export interface ControlledPrinthouseHandoffAudit {
  audit_id: string;
  handoff_package_id: string | null;
  pilot_program_id: string | null;
  participant_id: string | null;
  access_grant_id: string | null;
  event_type: string;
  event_actor: string | null;
  event_payload_json: Record<string, unknown> | null;
  safety_snapshot_json: ControlledPrinthouseHandoffSafetyMarkers | null;
  created_at: string;
}
