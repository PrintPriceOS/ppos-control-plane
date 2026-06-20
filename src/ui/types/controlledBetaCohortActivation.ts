export interface ControlledBetaCohortActivation {
  activation_id: string;
  gate_id: string;
  cohort_id: string;
  tenant_id: string;
  activation_status: string;
  beta_runtime_scoped_enabled: number;
  full_public_enabled: number;
  open_marketplace_enabled: number;
  payment_execution_enabled: number;
  refund_execution_enabled: number;
  payout_execution_enabled: number;
  provider_external_submission_enabled: number;
  external_tax_submission_enabled: number;
  external_accounting_submission_enabled: number;
  source_mutation_enabled: number;
  invite_only: number;
  cohort_scoped: number;
  tenant_scoped: number;
  participant_scoped: number;
  kill_switch_ready: number;
  rollback_ready: number;
  verified_from_phase128_1: number;
  verified_from_phase127_1: number;
  verified_from_db: number;
  runtime_truth_status: string;
  persistence_status: string | null;
  evidence_integrity_hash: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ControlledBetaActivationParticipant {
  participant_id: string;
  activation_id: string;
  participant_status: string;
  approved: number;
  terms_accepted: number;
  role_boundary_defined: number;
  created_at: string;
}

export interface ControlledBetaActivationInvite {
  invite_id: string;
  activation_id: string;
  participant_id: string;
  invite_code_hash: string;
  expires_at: string | null;
  revoked: number;
  created_at: string;
}

export interface ControlledBetaActivationScopeBinding {
  binding_id: string;
  activation_id: string;
  allowed_features_json: string;
  created_at: string;
}

export interface ControlledBetaActivationSessionLimit {
  limit_id: string;
  activation_id: string;
  max_participants: number;
  max_sessions_per_participant: number;
  max_total_active_sessions: number;
  max_runtime_minutes_per_session: number;
  max_actions_per_hour: number;
  created_at: string;
}

export interface ControlledBetaActivationMonitoringEvent {
  event_id: string;
  activation_id: string;
  event_type: string;
  details_json: string;
  created_at: string;
}

export interface ControlledBetaActivationSupportEvent {
  support_id: string;
  activation_id: string;
  ticket_details: string;
  status: string;
  created_at: string;
}

export interface ControlledBetaActivationIncidentEvent {
  incident_id: string;
  activation_id: string;
  incident_type: string;
  severity: string;
  summary: string;
  created_at: string;
}

export interface ControlledBetaActivationKillSwitchEvent {
  event_id: string;
  activation_id: string;
  triggered_by: string;
  reason: string;
  created_at: string;
}

export interface ControlledBetaActivationFinding {
  finding_id: string;
  activation_id: string;
  finding_status: string;
  severity: string;
  summary: string;
  details_json: string;
  blocks_runtime: number;
  created_at: string;
  resolved_at: string | null;
}

export interface ControlledBetaActivationEvidencePack {
  evidence_pack_id: string;
  activation_id: string;
  evidence_data_json: string;
  evidence_integrity_hash: string;
  evidence_schema_version: string;
  created_at: string;
}
