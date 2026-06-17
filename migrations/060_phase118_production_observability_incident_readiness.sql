-- Phase 118: Production Observability & Incident Readiness
-- Safety: No production activation. No external alert spam. No financial/provider execution.

CREATE TABLE IF NOT EXISTS production_observability_checks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  check_id VARCHAR(64) NOT NULL UNIQUE,
  run_id VARCHAR(64) NOT NULL,
  check_name VARCHAR(128) NOT NULL,
  check_category VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  result_json JSON NULL,
  simulated_only TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS production_incident_readiness_runs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  run_id VARCHAR(64) NOT NULL UNIQUE,
  requested_by VARCHAR(128) NOT NULL DEFAULT 'system',
  status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
  observability_status VARCHAR(64) NULL,
  incident_categories_json JSON NULL,
  evidence_metadata_json JSON NULL,
  -- Safety columns
  simulation_only TINYINT(1) NOT NULL DEFAULT 1,
  real_alert_dispatched TINYINT(1) NOT NULL DEFAULT 0,
  production_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0,
  external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
  live_provider_connectivity_enabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS production_incident_simulations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  simulation_id VARCHAR(64) NOT NULL UNIQUE,
  run_id VARCHAR(64) NOT NULL,
  incident_category VARCHAR(64) NOT NULL,
  severity VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
  status VARCHAR(32) NOT NULL DEFAULT 'SIMULATED',
  alert_dispatch_simulated TINYINT(1) NOT NULL DEFAULT 1,
  real_alert_dispatched TINYINT(1) NOT NULL DEFAULT 0,
  runbook_reference VARCHAR(256) NULL,
  simulation_result_json JSON NULL,
  findings_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS production_incident_audits (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  audit_id VARCHAR(64) NOT NULL UNIQUE,
  run_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  actor VARCHAR(128) NOT NULL DEFAULT 'system',
  details_json JSON NULL,
  simulation_only TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
