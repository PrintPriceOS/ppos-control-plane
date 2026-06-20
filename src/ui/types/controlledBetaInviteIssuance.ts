export interface InviteIssuanceGate {
  issuance_gate_id: string;
  preparation_id: string;
  phase132_evidence_pack_id: string;
  tenant_id: string;
  cohort_id: string;
  gate_status: string;
  readiness_status: string;
  max_invites_allowed: number;
  max_invites_to_issue: number;
  invites_issued_count: number;
  invite_acceptance_deadline?: string;
  invite_validity_hours: number;
  manual_approval_required: boolean;
  auto_issue_enabled: boolean;
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
}

export interface InviteIssuanceBatch {
  issuance_batch_id: string;
  issuance_gate_id: string;
  preparation_id: string;
  draft_invite_batch_id?: string;
  tenant_id: string;
  cohort_id: string;
  batch_status: string;
  requested_invite_count: number;
  approved_invite_count: number;
  issued_invite_count: number;
  revoked_invite_count: number;
  invite_validity_hours: number;
  approval_status: string;
  created_at: string;
  updated_at: string;
}

export interface InviteIssuanceRecipient {
  issuance_recipient_id: string;
  issuance_batch_id: string;
  candidate_participant_id: string;
  tenant_id: string;
  cohort_id: string;
  recipient_email_hash: string;
  recipient_label: string;
  recipient_status: string;
  invite_scope_json?: any;
  invite_constraints_json?: any;
}

export interface InviteRecord {
  invite_record_id: string;
  issuance_gate_id: string;
  issuance_batch_id: string;
  issuance_recipient_id: string;
  tenant_id: string;
  cohort_id: string;
  invite_code_hash: string;
  invite_token_hash: string;
  invite_status: string;
  issued_at: string;
  expires_at: string;
  revoked_at?: string;
  revoked_by?: string;
  revoke_reason?: string;
  accepted_at?: string;
  accepted_participant_id?: string;
}

export interface InviteIssuanceReadiness {
  ok: boolean;
  readiness_status: string;
  blocked_reasons: string[];
  checks: Record<string, boolean>;
}
