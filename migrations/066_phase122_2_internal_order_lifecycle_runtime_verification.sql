-- Phase 122.2: Internal Order Lifecycle Runtime Verification / Restart Recovery Drill
-- This migration creates tables for runtime verification runs, checks, and audits.
-- No production activation, no real restart execution, no payment/refund/payout execution.

CREATE TABLE IF NOT EXISTS internal_order_lifecycle_runtime_verification_runs (
  verification_run_id VARCHAR(80) NOT NULL PRIMARY KEY,
  phase VARCHAR(40) NOT NULL DEFAULT 'PHASE_122_2',
  tenant_id VARCHAR(80) NOT NULL,
  linked_pilot_run_id VARCHAR(80) DEFAULT NULL,
  status VARCHAR(80) NOT NULL DEFAULT 'DRAFT',
  verification_scope_json JSON DEFAULT NULL,
  pilot_only TINYINT(1) NOT NULL DEFAULT 1,
  runtime_verification_only TINYINT(1) NOT NULL DEFAULT 1,
  review_only TINYINT(1) NOT NULL DEFAULT 1,
  full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
  open_marketplace_access_enabled TINYINT(1) NOT NULL DEFAULT 0,
  live_provider_connectivity_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  source_mutation_outside_pilot_scope TINYINT(1) NOT NULL DEFAULT 0,
  production_activation_enabled TINYINT(1) NOT NULL DEFAULT 0,
  service_restart_executed TINYINT(1) NOT NULL DEFAULT 0,
  real_restart_executed TINYINT(1) NOT NULL DEFAULT 0,
  requested_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS internal_order_lifecycle_runtime_verification_checks (
  check_id VARCHAR(80) NOT NULL PRIMARY KEY,
  verification_run_id VARCHAR(80) NOT NULL,
  check_type VARCHAR(80) NOT NULL,
  check_status VARCHAR(80) NOT NULL DEFAULT 'PENDING',
  check_result_json JSON DEFAULT NULL,
  persistence_mode VARCHAR(40) DEFAULT NULL,
  persistence_status VARCHAR(40) DEFAULT NULL,
  memory_fallback_production_valid TINYINT(1) NOT NULL DEFAULT 0,
  safety_snapshot_json JSON DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS internal_order_lifecycle_runtime_verification_audits (
  audit_id VARCHAR(80) NOT NULL PRIMARY KEY,
  verification_run_id VARCHAR(80) NOT NULL,
  check_id VARCHAR(80) DEFAULT NULL,
  event_type VARCHAR(120) NOT NULL,
  event_actor VARCHAR(120) DEFAULT NULL,
  event_payload_json JSON DEFAULT NULL,
  safety_snapshot_json JSON DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes on verification runs
CREATE INDEX idx_iolrv_runs_tenant_id ON internal_order_lifecycle_runtime_verification_runs (tenant_id);
CREATE INDEX idx_iolrv_runs_status ON internal_order_lifecycle_runtime_verification_runs (status);
CREATE INDEX idx_iolrv_runs_created_at ON internal_order_lifecycle_runtime_verification_runs (created_at);
CREATE INDEX idx_iolrv_runs_linked_pilot_run ON internal_order_lifecycle_runtime_verification_runs (linked_pilot_run_id);

-- Indexes on verification checks
CREATE INDEX idx_iolrv_checks_verification_run_id ON internal_order_lifecycle_runtime_verification_checks (verification_run_id);
CREATE INDEX idx_iolrv_checks_check_type ON internal_order_lifecycle_runtime_verification_checks (check_type);
CREATE INDEX idx_iolrv_checks_check_status ON internal_order_lifecycle_runtime_verification_checks (check_status);
CREATE INDEX idx_iolrv_checks_created_at ON internal_order_lifecycle_runtime_verification_checks (created_at);

-- Indexes on verification audits
CREATE INDEX idx_iolrv_audits_verification_run_id ON internal_order_lifecycle_runtime_verification_audits (verification_run_id);
CREATE INDEX idx_iolrv_audits_check_id ON internal_order_lifecycle_runtime_verification_audits (check_id);
CREATE INDEX idx_iolrv_audits_event_type ON internal_order_lifecycle_runtime_verification_audits (event_type);
CREATE INDEX idx_iolrv_audits_created_at ON internal_order_lifecycle_runtime_verification_audits (created_at);

-- Foreign keys
ALTER TABLE internal_order_lifecycle_runtime_verification_checks
  ADD CONSTRAINT fk_iolrv_checks_run FOREIGN KEY (verification_run_id)
  REFERENCES internal_order_lifecycle_runtime_verification_runs (verification_run_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE internal_order_lifecycle_runtime_verification_audits
  ADD CONSTRAINT fk_iolrv_audits_run FOREIGN KEY (verification_run_id)
  REFERENCES internal_order_lifecycle_runtime_verification_runs (verification_run_id) ON DELETE RESTRICT ON UPDATE CASCADE;
