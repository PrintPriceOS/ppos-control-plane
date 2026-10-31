export interface InviteAcceptanceGate {
  acceptance_gate_id: string;
  invite_record_id: string;
  issuance_gate_id: string;
  issuance_batch_id: string;
  tenant_id: string;
  cohort_id: string;
  participant_id?: string;
  gate_status: string;
  readiness_status: string;
  invite_status_at_claim?: string;
  terms_required: boolean;
  terms_accepted: boolean;
  identity_bound: boolean;
  onboarding_approved: boolean;
  runtime_access_eligible: boolean;
  runtime_access_granted: boolean;
  manual_approval_required: boolean;
  auto_onboarding_enabled: boolean;
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

export interface InviteAcceptanceClaim {
  claim_id: string;
  acceptance_gate_id: string;
  invite_record_id: string;
  tenant_id: string;
  cohort_id: string;
  invite_code_hash: string;
  invite_token_hash: string;
  claim_status: string;
  claim_attempt_hash: string;
  claimed_at: string;
  claim_ip_hash: string;
  user_agent_hash: string;
  rejection_reason?: string;
}

export interface OnboardingParticipant {
  participant_id: string;
  acceptance_gate_id: string;
  invite_record_id: string;
  tenant_id: string;
  cohort_id: string;
  participant_external_ref_hash: string;
  participant_email_hash: string;
  participant_label: string;
  participant_status: string;
  role_key: string;
  scope_json?: any;
}

export interface TermsAcceptance {
  terms_acceptance_id: string;
  acceptance_gate_id: string;
  participant_id: string;
  terms_version: string;
  terms_hash: string;
  accepted_at: string;
  accepted_by_hash: string;
  acceptance_method: string;
}

export interface SessionLimits {
  session_limit_id: string;
  acceptance_gate_id: string;
  participant_id: string;
  tenant_id: string;
  cohort_id: string;
  max_sessions: number;
  max_concurrent_sessions: number;
  session_ttl_minutes: number;
  daily_action_limit: number;
  feature_scope_json?: any;
}

export interface AccessPolicy {
  access_policy_id: string;
  acceptance_gate_id: string;
  participant_id: string;
  tenant_id: string;
  cohort_id: string;
  policy_status: string;
  allowed_features_json?: string[];
  denied_features_json?: string[];
  runtime_scope_json?: any;
}

export interface InviteAcceptanceReadiness {
  ok: boolean;
  readiness_status: string;
  blocked_reasons: string[];
  checks: Record<string, boolean>;
}
