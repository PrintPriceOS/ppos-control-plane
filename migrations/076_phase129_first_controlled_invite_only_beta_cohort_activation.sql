-- Phase 129: First Controlled Invite-Only Beta Cohort Activation Tables

-- controlled_beta_cohort_activations
CREATE TABLE IF NOT EXISTS controlled_beta_cohort_activations (
  activation_id VARCHAR(80) PRIMARY KEY,
  gate_id VARCHAR(80) NOT NULL,
  cohort_id VARCHAR(80) NOT NULL,
  tenant_id VARCHAR(80) NOT NULL,
  activation_status VARCHAR(80) NOT NULL DEFAULT 'DRAFT',
  beta_runtime_scoped_enabled TINYINT(1) NOT NULL DEFAULT 0,
  full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
  open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0,
  invite_only TINYINT(1) NOT NULL DEFAULT 1,
  cohort_scoped TINYINT(1) NOT NULL DEFAULT 1,
  tenant_scoped TINYINT(1) NOT NULL DEFAULT 1,
  participant_scoped TINYINT(1) NOT NULL DEFAULT 1,
  kill_switch_ready TINYINT(1) NOT NULL DEFAULT 1,
  rollback_ready TINYINT(1) NOT NULL DEFAULT 0,
  verified_from_phase128_1 TINYINT(1) NOT NULL DEFAULT 0,
  verified_from_phase127_1 TINYINT(1) NOT NULL DEFAULT 0,
  verified_from_db TINYINT(1) NOT NULL DEFAULT 0,
  runtime_truth_status VARCHAR(80) NOT NULL DEFAULT 'DEGRADED',
  persistence_status VARCHAR(80) DEFAULT NULL,
  evidence_integrity_hash VARCHAR(128) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL
);

CREATE INDEX idx_cbca_gate ON controlled_beta_cohort_activations(gate_id);
CREATE INDEX idx_cbca_cohort ON controlled_beta_cohort_activations(cohort_id);
CREATE INDEX idx_cbca_tenant ON controlled_beta_cohort_activations(tenant_id);

-- controlled_beta_activation_participants
CREATE TABLE IF NOT EXISTS controlled_beta_activation_participants (
  participant_id VARCHAR(80) PRIMARY KEY,
  activation_id VARCHAR(80) NOT NULL,
  participant_status VARCHAR(80) NOT NULL DEFAULT 'PENDING',
  approved TINYINT(1) NOT NULL DEFAULT 0,
  terms_accepted TINYINT(1) NOT NULL DEFAULT 0,
  role_boundary_defined TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cbap_act ON controlled_beta_activation_participants(activation_id);

-- controlled_beta_activation_invites
CREATE TABLE IF NOT EXISTS controlled_beta_activation_invites (
  invite_id VARCHAR(80) PRIMARY KEY,
  activation_id VARCHAR(80) NOT NULL,
  participant_id VARCHAR(80) NOT NULL,
  invite_code_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cbai_act ON controlled_beta_activation_invites(activation_id);
CREATE INDEX idx_cbai_part ON controlled_beta_activation_invites(participant_id);

-- controlled_beta_activation_scope_bindings
CREATE TABLE IF NOT EXISTS controlled_beta_activation_scope_bindings (
  binding_id VARCHAR(80) PRIMARY KEY,
  activation_id VARCHAR(80) NOT NULL,
  allowed_features_json TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- controlled_beta_activation_session_limits
CREATE TABLE IF NOT EXISTS controlled_beta_activation_session_limits (
  limit_id VARCHAR(80) PRIMARY KEY,
  activation_id VARCHAR(80) NOT NULL,
  max_participants INT NOT NULL DEFAULT 5,
  max_sessions_per_participant INT NOT NULL DEFAULT 2,
  max_total_active_sessions INT NOT NULL DEFAULT 10,
  max_runtime_minutes_per_session INT NOT NULL DEFAULT 60,
  max_actions_per_hour INT NOT NULL DEFAULT 100,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cbasl_act ON controlled_beta_activation_session_limits(activation_id);

-- controlled_beta_activation_monitoring_events
CREATE TABLE IF NOT EXISTS controlled_beta_activation_monitoring_events (
  event_id VARCHAR(80) PRIMARY KEY,
  activation_id VARCHAR(80) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  details_json TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cbame_act ON controlled_beta_activation_monitoring_events(activation_id);

-- controlled_beta_activation_support_events
CREATE TABLE IF NOT EXISTS controlled_beta_activation_support_events (
  support_id VARCHAR(80) PRIMARY KEY,
  activation_id VARCHAR(80) NOT NULL,
  ticket_details TEXT NOT NULL,
  status VARCHAR(80) NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- controlled_beta_activation_incident_events
CREATE TABLE IF NOT EXISTS controlled_beta_activation_incident_events (
  incident_id VARCHAR(80) PRIMARY KEY,
  activation_id VARCHAR(80) NOT NULL,
  incident_type VARCHAR(80) NOT NULL,
  severity VARCHAR(80) NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- controlled_beta_activation_kill_switch_events
CREATE TABLE IF NOT EXISTS controlled_beta_activation_kill_switch_events (
  event_id VARCHAR(80) PRIMARY KEY,
  activation_id VARCHAR(80) NOT NULL,
  triggered_by VARCHAR(80) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- controlled_beta_activation_findings
CREATE TABLE IF NOT EXISTS controlled_beta_activation_findings (
  finding_id VARCHAR(80) PRIMARY KEY,
  activation_id VARCHAR(80) NOT NULL,
  finding_status VARCHAR(80) NOT NULL DEFAULT 'OPEN',
  severity VARCHAR(80) NOT NULL,
  summary VARCHAR(255) NOT NULL,
  details_json TEXT NOT NULL,
  blocks_runtime TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL DEFAULT NULL
);

-- controlled_beta_activation_evidence_packs
CREATE TABLE IF NOT EXISTS controlled_beta_activation_evidence_packs (
  evidence_pack_id VARCHAR(80) PRIMARY KEY,
  activation_id VARCHAR(80) NOT NULL,
  evidence_data_json LONGTEXT NOT NULL,
  evidence_integrity_hash VARCHAR(128) NOT NULL,
  evidence_schema_version VARCHAR(20) NOT NULL DEFAULT '129.0',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
