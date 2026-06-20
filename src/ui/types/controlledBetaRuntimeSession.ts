export interface RuntimeSessionGate {
  session_gate_id: string;
  acceptance_gate_id: string;
  participant_id: string;
  tenant_id: string;
  cohort_id: string;
  gate_status: string;
  readiness_status: string;
  runtime_access_eligible: boolean;
  runtime_access_granted: boolean;
  manual_approval_required: boolean;
  session_creation_enabled: boolean;
  auto_session_creation_enabled: boolean;
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
  approved_at?: string;
  approved_by?: string;
  blocked_at?: string;
  blocked_by?: string;
  blocked_reasons_json?: string[];
}

export interface RuntimeSession {
  runtime_session_id: string;
  session_gate_id: string;
  acceptance_gate_id: string;
  participant_id: string;
  tenant_id: string;
  cohort_id: string;
  session_status: string;
  session_token_hash: string;
  session_scope_json?: any;
  allowed_features_json?: string[];
  denied_features_json?: string[];
  created_at: string;
  started_at: string;
  last_heartbeat_at: string;
  expires_at: string;
  closed_at?: string;
  closed_by?: string;
  closure_reason?: string;
  revoked_at?: string;
  revoked_by?: string;
  revoke_reason?: string;
}

export interface RuntimeSessionLimits {
  runtime_session_limit_id: string;
  session_gate_id: string;
  participant_id: string;
  tenant_id: string;
  cohort_id: string;
  max_sessions: number;
  max_concurrent_sessions: number;
  session_ttl_minutes: number;
  daily_action_limit: number;
  feature_scope_json?: any;
  created_at: string;
  updated_at: string;
}

export interface RuntimeSessionReadiness {
  ok: boolean;
  readiness_status: string;
  blocked_reasons: string[];
  checks: Record<string, boolean>;
}
