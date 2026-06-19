-- Phase 127: Limited Beta Preparation Gate
-- Defines invite-only cohort governance, tenant eligibility, terms acceptance, role boundaries, and rollback plans.

CREATE TABLE IF NOT EXISTS limited_beta_preparation_gates (
  gate_id VARCHAR(80) NOT NULL PRIMARY KEY,
  phase VARCHAR(40) NOT NULL DEFAULT 'PHASE_127',
  readiness_status VARCHAR(80) NOT NULL DEFAULT 'DRAFT',
  beta_runtime_enabled TINYINT(1) NOT NULL DEFAULT 0,
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
  invite_only TINYINT(1) NOT NULL DEFAULT 1,
  review_only TINYINT(1) NOT NULL DEFAULT 1,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS limited_beta_cohorts (
  cohort_id VARCHAR(80) NOT NULL PRIMARY KEY,
  gate_id VARCHAR(80) NOT NULL,
  cohort_name VARCHAR(200) NOT NULL,
  cohort_description TEXT DEFAULT NULL,
  max_participants INT NOT NULL DEFAULT 10,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS limited_beta_cohort_participants (
  participant_id VARCHAR(80) NOT NULL PRIMARY KEY,
  cohort_id VARCHAR(80) NOT NULL,
  tenant_id VARCHAR(80) NOT NULL,
  participant_type VARCHAR(80) NOT NULL, -- INTERNAL_ADMIN, INTERNAL_SUPPORT, FOUNDING_PRINTHOUSE, PILOT_CUSTOMER, OBSERVER, TECHNICAL_REVIEWER
  participant_status VARCHAR(80) NOT NULL, -- DRAFT, INVITED, TERMS_PENDING, ELIGIBILITY_REVIEW, APPROVED_FOR_LIMITED_BETA_PREPARATION, SUSPENDED, REVOKED, REJECTED
  registered_by VARCHAR(120) DEFAULT NULL,
  registered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS limited_beta_invite_codes (
  invite_id VARCHAR(80) NOT NULL PRIMARY KEY,
  cohort_id VARCHAR(80) NOT NULL,
  invite_code VARCHAR(120) NOT NULL UNIQUE,
  max_uses INT NOT NULL DEFAULT 1,
  uses_count INT NOT NULL DEFAULT 0,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS limited_beta_terms_acceptances (
  acceptance_id VARCHAR(80) NOT NULL PRIMARY KEY,
  participant_id VARCHAR(80) NOT NULL,
  terms_version VARCHAR(40) NOT NULL,
  accepted_by VARCHAR(120) NOT NULL,
  accepted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS limited_beta_role_boundaries (
  boundary_id VARCHAR(80) NOT NULL PRIMARY KEY,
  participant_id VARCHAR(80) NOT NULL,
  allowed_actions_json JSON DEFAULT NULL,
  restricted_actions_json JSON DEFAULT NULL,
  defined_by VARCHAR(120) DEFAULT NULL,
  defined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS limited_beta_support_escalations (
  escalation_id VARCHAR(80) NOT NULL PRIMARY KEY,
  gate_id VARCHAR(80) NOT NULL,
  path_name VARCHAR(200) NOT NULL,
  contact_details_json JSON DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS limited_beta_incident_rollback_plans (
  plan_id VARCHAR(80) NOT NULL PRIMARY KEY,
  gate_id VARCHAR(80) NOT NULL,
  rollback_steps_json JSON DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS limited_beta_findings (
  finding_id VARCHAR(80) NOT NULL PRIMARY KEY,
  gate_id VARCHAR(80) NOT NULL,
  finding_type VARCHAR(80) NOT NULL DEFAULT 'OBSERVATION',
  finding_status VARCHAR(80) NOT NULL DEFAULT 'OPEN',
  blocks_beta_preparation TINYINT(1) NOT NULL DEFAULT 0,
  severity VARCHAR(40) NOT NULL DEFAULT 'LOW',
  summary TEXT DEFAULT NULL,
  details_json JSON DEFAULT NULL,
  resolved_at TIMESTAMP NULL DEFAULT NULL,
  resolved_by VARCHAR(120) DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS limited_beta_audits (
  audit_id VARCHAR(80) NOT NULL PRIMARY KEY,
  gate_id VARCHAR(80) NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  event_detail_json JSON DEFAULT NULL,
  safety_snapshot_json JSON DEFAULT NULL,
  actor VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS limited_beta_evidence_packs (
  evidence_pack_id VARCHAR(80) NOT NULL PRIMARY KEY,
  gate_id VARCHAR(80) NOT NULL,
  evidence_status VARCHAR(80) NOT NULL DEFAULT 'DRAFT',
  evidence_data_json JSON DEFAULT NULL,
  evidence_hash VARCHAR(128) DEFAULT NULL,
  evidence_schema_version VARCHAR(20) NOT NULL DEFAULT '127.0',
  redaction_classification VARCHAR(40) NOT NULL DEFAULT 'INTERNAL_ONLY',
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  generated_by VARCHAR(120) DEFAULT NULL
);
