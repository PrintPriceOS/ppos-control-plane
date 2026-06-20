export interface RuntimeActivityObservationGate {
  observation_gate_id: string;
  session_gate_id: string;
  runtime_session_id: string;
  acceptance_gate_id: string;
  participant_id: string;
  tenant_id: string;
  cohort_id: string;
  gate_status: string;
  readiness_status: string;
  observation_enabled: boolean;
  manual_review_required: boolean;
  auto_enforcement_enabled: boolean;
  auto_expansion_enabled: boolean;
  auto_revocation_enabled: boolean;
  full_public_enabled: boolean;
  open_marketplace_enabled: boolean;
  public_signup_enabled: boolean;
  public_beta_enabled: boolean;
  payment_execution_enabled: boolean;
  provider_external_submission_enabled: boolean;
  source_mutation_enabled: boolean;
  kill_switch_active: boolean;
  created_at: string;
  updated_at: string;
  blocked_at?: string;
  blocked_by?: string;
  blocked_reasons_json?: string[];
}

export interface RuntimeActivityEvent {
  activity_event_id: string;
  observation_gate_id: string;
  runtime_session_id: string;
  session_gate_id: string;
  participant_id: string;
  tenant_id: string;
  cohort_id: string;
  event_type: string;
  event_status: string;
  feature_key?: string;
  action_key?: string;
  normalized_event_key?: string;
  event_severity: string;
  occurred_at: string;
  ingested_at: string;
  metadata_json?: any;
  redaction_status: string;
}

export interface RuntimeActivityFeatureUsage {
  feature_usage_id: string;
  observation_gate_id: string;
  runtime_session_id: string;
  participant_id: string;
  tenant_id: string;
  cohort_id: string;
  feature_key: string;
  usage_count: number;
  blocked_count: number;
  allowed_count: number;
  denied_count: number;
  first_used_at: string;
  last_used_at: string;
}

export interface RuntimeActivityDailyCounter {
  daily_counter_id: string;
  observation_gate_id: string;
  participant_id: string;
  tenant_id: string;
  cohort_id: string;
  usage_date: string;
  total_events: number;
  allowed_events: number;
  blocked_events: number;
  denied_events: number;
  feature_count: number;
  daily_action_limit: number;
  daily_action_limit_status: string;
}

export interface RuntimeActivityBlockedAttempt {
  blocked_attempt_id: string;
  observation_gate_id: string;
  runtime_session_id: string;
  participant_id: string;
  tenant_id: string;
  cohort_id: string;
  feature_key: string;
  action_key?: string;
  blocked_reason: string;
  blocked_severity: string;
  occurred_at: string;
}

export interface RuntimeActivityAnomalySignal {
  anomaly_signal_id: string;
  observation_gate_id: string;
  runtime_session_id: string;
  participant_id: string;
  tenant_id: string;
  cohort_id: string;
  anomaly_key: string;
  anomaly_severity: string;
  anomaly_status: string;
  observed_count: number;
  threshold_value: number;
  created_at: string;
}

export interface RuntimeActivityHealthSignal {
  health_signal_id: string;
  observation_gate_id: string;
  runtime_session_id: string;
  participant_id: string;
  tenant_id: string;
  cohort_id: string;
  signal_key: string;
  signal_status: string;
  severity: string;
  observed_at: string;
}

export interface ParticipantUsageSummary {
  participant_summary_id: string;
  observation_gate_id: string;
  participant_id: string;
  total_sessions: number;
  total_events: number;
  allowed_events: number;
  blocked_events: number;
  denied_events: number;
  features_used_count: number;
  anomaly_count: number;
  health_warning_count: number;
  adoption_status: string;
  risk_status: string;
}

export interface CohortUsageSummary {
  cohort_summary_id: string;
  tenant_id: string;
  cohort_id: string;
  participant_count: number;
  active_participant_count: number;
  total_sessions: number;
  total_events: number;
  allowed_events: number;
  blocked_events: number;
  denied_events: number;
}
