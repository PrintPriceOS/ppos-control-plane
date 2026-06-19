-- Phase 128: Invite-Only Limited Beta Runtime Tables

-- limited_beta_runtime_scope_policies
CREATE TABLE IF NOT EXISTS limited_beta_runtime_scope_policies (
  policy_id VARCHAR(80) PRIMARY KEY,
  gate_id VARCHAR(80) NOT NULL,
  policy_name VARCHAR(80) NOT NULL,
  allowed_features_json TEXT NOT NULL,
  created_by VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL
);

CREATE INDEX idx_lbrsp_gate_id ON limited_beta_runtime_scope_policies(gate_id);

-- limited_beta_runtime_sessions
CREATE TABLE IF NOT EXISTS limited_beta_runtime_sessions (
  session_id VARCHAR(80) PRIMARY KEY,
  gate_id VARCHAR(80) NOT NULL,
  cohort_id VARCHAR(80) NOT NULL,
  participant_id VARCHAR(80) NOT NULL,
  tenant_id VARCHAR(80) NOT NULL,
  scope_policy_id VARCHAR(80) NOT NULL,
  access_status VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  terminated_at TIMESTAMP NULL DEFAULT NULL,
  termination_reason VARCHAR(255) DEFAULT NULL,
  beta_runtime_enabled TINYINT(1) NOT NULL DEFAULT 0,
  invite_only TINYINT(1) NOT NULL DEFAULT 1,
  cohort_scoped TINYINT(1) NOT NULL DEFAULT 1,
  tenant_scoped TINYINT(1) NOT NULL DEFAULT 1,
  participant_scoped TINYINT(1) NOT NULL DEFAULT 1,
  kill_switch_enabled TINYINT(1) NOT NULL DEFAULT 1,
  full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
  open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  live_provider_connectivity_enabled TINYINT(1) NOT NULL DEFAULT 0,
  provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0,
  runtime_truth_status VARCHAR(80) NOT NULL DEFAULT 'DEGRADED',
  persistence_status VARCHAR(80) DEFAULT NULL,
  evidence_integrity_hash VARCHAR(128) DEFAULT NULL,
  verified_from_phase127_1 TINYINT(1) NOT NULL DEFAULT 0,
  verified_from_db TINYINT(1) NOT NULL DEFAULT 0,
  fail_closed_verified TINYINT(1) NOT NULL DEFAULT 0,
  rollback_ready TINYINT(1) NOT NULL DEFAULT 0
);

CREATE INDEX idx_lbrs_session_id ON limited_beta_runtime_sessions(session_id);
CREATE INDEX idx_lbrs_gate_id ON limited_beta_runtime_sessions(gate_id);
CREATE INDEX idx_lbrs_cohort_id ON limited_beta_runtime_sessions(cohort_id);
CREATE INDEX idx_lbrs_participant_id ON limited_beta_runtime_sessions(participant_id);
CREATE INDEX idx_lbrs_tenant_id ON limited_beta_runtime_sessions(tenant_id);
CREATE INDEX idx_lbrs_access_status ON limited_beta_runtime_sessions(access_status);
CREATE INDEX idx_lbrs_created_at ON limited_beta_runtime_sessions(created_at);

-- limited_beta_runtime_access_grants
CREATE TABLE IF NOT EXISTS limited_beta_runtime_access_grants (
  grant_id VARCHAR(80) PRIMARY KEY,
  gate_id VARCHAR(80) NOT NULL,
  cohort_id VARCHAR(80) NOT NULL,
  participant_id VARCHAR(80) NOT NULL,
  tenant_id VARCHAR(80) NOT NULL,
  scope_policy_id VARCHAR(80) NOT NULL,
  granted_by VARCHAR(80) NOT NULL,
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  revoked_by VARCHAR(80) DEFAULT NULL,
  revoked_at TIMESTAMP NULL DEFAULT NULL
);

CREATE INDEX idx_lbrag_gate_id ON limited_beta_runtime_access_grants(gate_id);
CREATE INDEX idx_lbrag_cohort_id ON limited_beta_runtime_access_grants(cohort_id);
CREATE INDEX idx_lbrag_participant_id ON limited_beta_runtime_access_grants(participant_id);
CREATE INDEX idx_lbrag_tenant_id ON limited_beta_runtime_access_grants(tenant_id);

-- limited_beta_runtime_access_denials
CREATE TABLE IF NOT EXISTS limited_beta_runtime_access_denials (
  denial_id VARCHAR(80) PRIMARY KEY,
  gate_id VARCHAR(80) NOT NULL,
  cohort_id VARCHAR(80) DEFAULT NULL,
  participant_id VARCHAR(80) DEFAULT NULL,
  tenant_id VARCHAR(80) DEFAULT NULL,
  feature_key VARCHAR(80) NOT NULL,
  denial_reason VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lbrad_gate_id ON limited_beta_runtime_access_denials(gate_id);
CREATE INDEX idx_lbrad_cohort_id ON limited_beta_runtime_access_denials(cohort_id);
CREATE INDEX idx_lbrad_participant_id ON limited_beta_runtime_access_denials(participant_id);
CREATE INDEX idx_lbrad_tenant_id ON limited_beta_runtime_access_denials(tenant_id);
CREATE INDEX idx_lbrad_denial_reason ON limited_beta_runtime_access_denials(denial_reason);
CREATE INDEX idx_lbrad_created_at ON limited_beta_runtime_access_denials(created_at);

-- limited_beta_runtime_kill_switches
CREATE TABLE IF NOT EXISTS limited_beta_runtime_kill_switches (
  kill_switch_id VARCHAR(80) PRIMARY KEY,
  gate_id VARCHAR(80) NOT NULL,
  kill_switch_enabled TINYINT(1) NOT NULL DEFAULT 1,
  triggered_by VARCHAR(80) NOT NULL,
  triggered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason VARCHAR(255) DEFAULT NULL,
  cleared_by VARCHAR(80) DEFAULT NULL,
  cleared_at TIMESTAMP NULL DEFAULT NULL
);

CREATE INDEX idx_lbrks_gate_id ON limited_beta_runtime_kill_switches(gate_id);
CREATE INDEX idx_lbrks_status ON limited_beta_runtime_kill_switches(kill_switch_enabled);

-- limited_beta_runtime_feature_flags
CREATE TABLE IF NOT EXISTS limited_beta_runtime_feature_flags (
  flag_id VARCHAR(80) PRIMARY KEY,
  feature_flag_key VARCHAR(80) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lbrff_key ON limited_beta_runtime_feature_flags(feature_flag_key);

-- limited_beta_runtime_activity_logs
CREATE TABLE IF NOT EXISTS limited_beta_runtime_activity_logs (
  activity_id VARCHAR(80) PRIMARY KEY,
  session_id VARCHAR(80) DEFAULT NULL,
  gate_id VARCHAR(80) NOT NULL,
  tenant_id VARCHAR(80) NOT NULL,
  participant_id VARCHAR(80) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  action_details_json TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lbral_gate_id ON limited_beta_runtime_activity_logs(gate_id);
CREATE INDEX idx_lbral_tenant_id ON limited_beta_runtime_activity_logs(tenant_id);
CREATE INDEX idx_lbral_participant_id ON limited_beta_runtime_activity_logs(participant_id);
CREATE INDEX idx_lbral_event_type ON limited_beta_runtime_activity_logs(event_type);
CREATE INDEX idx_lbral_created_at ON limited_beta_runtime_activity_logs(created_at);

-- limited_beta_runtime_guardrail_events
CREATE TABLE IF NOT EXISTS limited_beta_runtime_guardrail_events (
  event_id VARCHAR(80) PRIMARY KEY,
  gate_id VARCHAR(80) NOT NULL,
  tenant_id VARCHAR(80) NOT NULL,
  participant_id VARCHAR(80) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  violation_details_json TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lbrge_gate_id ON limited_beta_runtime_guardrail_events(gate_id);
CREATE INDEX idx_lbrge_event_type ON limited_beta_runtime_guardrail_events(event_type);
CREATE INDEX idx_lbrge_created_at ON limited_beta_runtime_guardrail_events(created_at);

-- limited_beta_runtime_rollback_events
CREATE TABLE IF NOT EXISTS limited_beta_runtime_rollback_events (
  rollback_id VARCHAR(80) PRIMARY KEY,
  gate_id VARCHAR(80) NOT NULL,
  triggered_by VARCHAR(80) NOT NULL,
  rollback_steps_json TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lbrre_gate_id ON limited_beta_runtime_rollback_events(gate_id);
CREATE INDEX idx_lbrre_created_at ON limited_beta_runtime_rollback_events(created_at);

-- limited_beta_runtime_findings
CREATE TABLE IF NOT EXISTS limited_beta_runtime_findings (
  finding_id VARCHAR(80) PRIMARY KEY,
  gate_id VARCHAR(80) NOT NULL,
  finding_status VARCHAR(80) NOT NULL DEFAULT 'OPEN',
  severity VARCHAR(80) NOT NULL,
  summary VARCHAR(255) NOT NULL,
  details_json TEXT NOT NULL,
  blocks_runtime TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL DEFAULT NULL,
  resolved_by VARCHAR(80) DEFAULT NULL
);

CREATE INDEX idx_lbrf_gate_id ON limited_beta_runtime_findings(gate_id);
CREATE INDEX idx_lbrf_status ON limited_beta_runtime_findings(finding_status);
CREATE INDEX idx_lbrf_severity ON limited_beta_runtime_findings(severity);
CREATE INDEX idx_lbrf_created_at ON limited_beta_runtime_findings(created_at);

-- limited_beta_runtime_evidence_packs
CREATE TABLE IF NOT EXISTS limited_beta_runtime_evidence_packs (
  evidence_pack_id VARCHAR(80) PRIMARY KEY,
  gate_id VARCHAR(80) NOT NULL,
  evidence_data_json LONGTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  beta_runtime_enabled TINYINT(1) NOT NULL DEFAULT 0,
  invite_only TINYINT(1) NOT NULL DEFAULT 1,
  cohort_scoped TINYINT(1) NOT NULL DEFAULT 1,
  tenant_scoped TINYINT(1) NOT NULL DEFAULT 1,
  participant_scoped TINYINT(1) NOT NULL DEFAULT 1,
  kill_switch_enabled TINYINT(1) NOT NULL DEFAULT 1,
  full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
  open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  live_provider_connectivity_enabled TINYINT(1) NOT NULL DEFAULT 0,
  provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0,
  runtime_truth_status VARCHAR(80) NOT NULL DEFAULT 'DEGRADED',
  persistence_status VARCHAR(80) DEFAULT NULL,
  evidence_integrity_hash VARCHAR(128) DEFAULT NULL,
  verified_from_phase127_1 TINYINT(1) NOT NULL DEFAULT 0,
  verified_from_db TINYINT(1) NOT NULL DEFAULT 0,
  fail_closed_verified TINYINT(1) NOT NULL DEFAULT 0,
  rollback_ready TINYINT(1) NOT NULL DEFAULT 0,
  evidence_schema_version VARCHAR(20) NOT NULL DEFAULT '128.0'
);

CREATE INDEX idx_lbrep_gate_id ON limited_beta_runtime_evidence_packs(gate_id);
CREATE INDEX idx_lbrep_created_at ON limited_beta_runtime_evidence_packs(created_at);
