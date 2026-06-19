export interface LimitedBetaPreparationSafetyMarkers {
  pilotOnly: boolean;
  reviewOnly: boolean;
  betaRuntimeEnabled: boolean;
  fullPublicEnabled: boolean;
  openMarketplaceEnabled: boolean;
  liveProviderConnectivityEnabled: boolean;
  paymentExecutionEnabled: boolean;
  refundExecutionEnabled: boolean;
  payoutExecutionEnabled: boolean;
  providerExternalSubmissionEnabled: boolean;
  externalTaxSubmissionEnabled: boolean;
  externalAccountingSubmissionEnabled: boolean;
  sourceMutationEnabled: boolean;
}

export interface LimitedBetaPreparationGate {
  gate_id: string;
  phase: string;
  readiness_status: string;
  beta_runtime_enabled: number;
  full_public_enabled: number;
  open_marketplace_enabled: number;
  payment_execution_enabled: number;
  refund_execution_enabled: number;
  payout_execution_enabled: number;
  live_provider_connectivity_enabled: number;
  provider_external_submission_enabled: number;
  external_tax_submission_enabled: number;
  external_accounting_submission_enabled: number;
  source_mutation_enabled: number;
  invite_only: number;
  review_only: number;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface LimitedBetaCohort {
  cohort_id: string;
  gate_id: string;
  cohort_name: string;
  cohort_description: string | null;
  max_participants: number;
  created_at: string;
}

export interface LimitedBetaCohortParticipant {
  participant_id: string;
  cohort_id: string;
  tenant_id: string;
  participant_type: string; // INTERNAL_ADMIN, INTERNAL_SUPPORT, FOUNDING_PRINTHOUSE, PILOT_CUSTOMER, OBSERVER, TECHNICAL_REVIEWER
  participant_status: string; // DRAFT, INVITED, TERMS_PENDING, ELIGIBILITY_REVIEW, APPROVED_FOR_LIMITED_BETA_PREPARATION, SUSPENDED, REVOKED, REJECTED
  registered_by: string | null;
  registered_at: string;
  updated_at: string | null;
}

export interface LimitedBetaInviteCode {
  invite_id: string;
  cohort_id: string;
  invite_code: string;
  max_uses: number;
  uses_count: number;
  revoked: number;
  created_by: string | null;
  created_at: string;
}

export interface LimitedBetaTermsAcceptance {
  acceptance_id: string;
  participant_id: string;
  terms_version: string;
  accepted_by: string;
  accepted_at: string;
}

export interface LimitedBetaRoleBoundary {
  boundary_id: string;
  participant_id: string;
  allowed_actions_json: unknown;
  restricted_actions_json: unknown;
  defined_by: string | null;
  defined_at: string;
}

export interface LimitedBetaSupportEscalation {
  escalation_id: string;
  gate_id: string;
  path_name: string;
  contact_details_json: unknown;
  created_by: string | null;
  created_at: string;
}

export interface LimitedBetaIncidentRollbackPlan {
  plan_id: string;
  gate_id: string;
  rollback_steps_json: unknown;
  created_by: string | null;
  created_at: string;
}

export interface LimitedBetaFinding {
  finding_id: string;
  gate_id: string;
  finding_type: string;
  finding_status: string;
  blocks_beta_preparation: number;
  severity: string;
  summary: string | null;
  details_json: unknown;
  resolved_at: string | null;
  resolved_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface LimitedBetaAudit {
  audit_id: string;
  gate_id: string;
  event_type: string;
  event_detail_json: unknown;
  safety_snapshot_json: unknown;
  actor: string | null;
  created_at: string;
}

export interface LimitedBetaEvidencePack {
  evidence_pack_id: string;
  gate_id: string;
  evidence_status: string;
  evidence_data_json: unknown;
  evidence_hash: string | null;
  evidence_schema_version: string;
  redaction_classification: string;
  generated_at: string;
  generated_by: string | null;
}
