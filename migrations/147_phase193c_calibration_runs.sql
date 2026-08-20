-- migrations/147_phase193c_calibration_runs.sql
--
-- Phase 193C — Deterministic Inverse Pricing Solver & Calibration Runs
--
-- Creates the persistence model for deterministic solver executions.
-- Every run captures complete provenance (input checksum, rate snapshot checksum,
-- solver version, residuals, candidate parameter overrides, and canonical results).
--
-- Design invariants:
--   - Additive DDL only
--   - Strict foreign keys to tenants, printhouse_pricing_calibration_sessions, printer_nodes
--   - No active rate mutation or marketplace activation columns
--   - Immutable provenance for replayability and auditing

CREATE TABLE IF NOT EXISTS printhouse_pricing_calibration_runs (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  calibration_session_id VARCHAR(64) NOT NULL,
  printer_node_id VARCHAR(64) NOT NULL,

  solver_version VARCHAR(64) NOT NULL DEFAULT '193C_v1_deterministic',
  solver_config_json JSON NOT NULL,
  status ENUM('PENDING','RUNNING','SUCCEEDED','NO_SOLUTION','AMBIGUOUS','FAILED') NOT NULL DEFAULT 'PENDING',

  -- Inputs Provenance
  session_input_checksum VARCHAR(128) NOT NULL,
  rate_snapshot_checksum VARCHAR(128) NOT NULL,

  -- Solver Performance Metrics
  evaluations_count INT UNSIGNED NOT NULL DEFAULT 0,
  execution_duration_ms INT UNSIGNED NOT NULL DEFAULT 0,

  -- Predictions & Residuals
  engine_price_before DECIMAL(12,4) NOT NULL,
  engine_price_after DECIMAL(12,4) NOT NULL,
  target_price DECIMAL(12,4) NOT NULL,
  absolute_residual DECIMAL(12,6) NOT NULL,
  percent_residual DECIMAL(8,4) NOT NULL,

  -- Calibrated Parameters & Solution Artifacts
  active_rate_paths_json JSON NOT NULL,
  proposed_patch_json JSON NOT NULL,
  proposed_patch_checksum VARCHAR(128) NOT NULL,
  candidate_parameters_json JSON NOT NULL,
  identifiability_report_json JSON NOT NULL,
  warnings_json JSON NULL,
  error_json JSON NULL,

  -- Actor and Timestamps
  created_by_json JSON NOT NULL,
  started_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  completed_at TIMESTAMP(6) NULL,

  -- Indexes
  INDEX idx_cal_run_tenant (tenant_id),
  INDEX idx_cal_run_session (calibration_session_id),
  INDEX idx_cal_run_status (status),

  -- Foreign Keys
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (calibration_session_id) REFERENCES printhouse_pricing_calibration_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (printer_node_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
