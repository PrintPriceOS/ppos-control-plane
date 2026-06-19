-- Phase 128.1: Runtime Persistence / Restart Recovery / Live Kill-Switch Drill

-- Alter limited_beta_runtime_sessions
ALTER TABLE limited_beta_runtime_sessions
  ADD COLUMN restart_recovery_status VARCHAR(80) DEFAULT NULL,
  ADD COLUMN last_verified_after_restart_at DATETIME DEFAULT NULL,
  ADD COLUMN recovered_from_db TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN memory_state_detected TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN restart_safe TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN kill_switch_survived_restart TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN access_policy_survived_restart TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN session_state_survived_restart TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN evidence_pack_survived_restart TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN recovery_integrity_hash VARCHAR(128) DEFAULT NULL;

-- Alter limited_beta_runtime_evidence_packs
ALTER TABLE limited_beta_runtime_evidence_packs
  ADD COLUMN restart_recovery_status VARCHAR(80) DEFAULT NULL,
  ADD COLUMN last_verified_after_restart_at DATETIME DEFAULT NULL,
  ADD COLUMN recovered_from_db TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN memory_state_detected TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN restart_safe TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN kill_switch_survived_restart TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN access_policy_survived_restart TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN session_state_survived_restart TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN evidence_pack_survived_restart TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN recovery_integrity_hash VARCHAR(128) DEFAULT NULL;

-- Alter limited_beta_runtime_kill_switches
ALTER TABLE limited_beta_runtime_kill_switches
  ADD COLUMN kill_switch_survived_restart TINYINT(1) NOT NULL DEFAULT 0;

-- Alter limited_beta_runtime_scope_policies
ALTER TABLE limited_beta_runtime_scope_policies
  ADD COLUMN access_policy_survived_restart TINYINT(1) NOT NULL DEFAULT 0;

-- Create restart recovery drill table
CREATE TABLE IF NOT EXISTS limited_beta_runtime_restart_drills (
  drill_id VARCHAR(80) PRIMARY KEY,
  gate_id VARCHAR(80) NOT NULL,
  cohort_id VARCHAR(80) NOT NULL,
  participant_id VARCHAR(80) NOT NULL,
  tenant_id VARCHAR(80) NOT NULL,
  before_restart_snapshot_hash VARCHAR(128) DEFAULT NULL,
  after_restart_snapshot_hash VARCHAR(128) DEFAULT NULL,
  recovery_integrity_hash VARCHAR(128) DEFAULT NULL,
  restart_recovery_status VARCHAR(80) NOT NULL,
  runtime_truth_status VARCHAR(80) NOT NULL,
  persistence_status VARCHAR(80) NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP NULL DEFAULT NULL,
  verified_by VARCHAR(80) DEFAULT NULL,
  findings TEXT DEFAULT NULL
);

-- Indexes
CREATE INDEX idx_lbrs_rec ON limited_beta_runtime_sessions(restart_recovery_status);
CREATE INDEX idx_lbrep_rec ON limited_beta_runtime_evidence_packs(restart_recovery_status);
CREATE INDEX idx_lbrrd_gate_id ON limited_beta_runtime_restart_drills(gate_id);
