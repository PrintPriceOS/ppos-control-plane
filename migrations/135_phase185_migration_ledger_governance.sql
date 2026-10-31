-- migrations/135_phase185_migration_ledger_governance.sql
--
-- Phase 185: Migration Ledger Governance & Database-State Verification
--
-- Safe upgrade of the schema_versions table structure without breaking historical rows.
-- Uses an idempotent expand-and-backfill pattern.

-- 1. Idempotently add new ledger columns as nullable (Expand Phase)
ALTER TABLE schema_versions
  ADD COLUMN record_type ENUM('MIGRATION', 'BASELINE_MARKER', 'PHASE_MARKER') NOT NULL DEFAULT 'MIGRATION',
  ADD COLUMN migration_path VARCHAR(512) NULL,
  ADD COLUMN state ENUM('STARTED', 'APPLIED', 'FAILED') NULL,
  ADD COLUMN execution_id CHAR(36) NULL,
  ADD COLUMN runner_id VARCHAR(255) NULL,
  ADD COLUMN repository_commit CHAR(40) NULL,
  ADD COLUMN normalization VARCHAR(32) NOT NULL DEFAULT 'utf8-lf-v1',
  ADD COLUMN started_at DATETIME(3) NULL,
  ADD COLUMN heartbeat_at DATETIME(3) NULL,
  ADD COLUMN failed_at DATETIME(3) NULL,
  ADD COLUMN execution_time_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN failure_code VARCHAR(128) NULL,
  ADD COLUMN failure_message TEXT NULL,
  ADD COLUMN failed_statement_index INT NULL;

-- 2. Backfill existing legacy rows (Backfill Phase)
-- The backfill is orchestrator-driven from the CLI, but we establish defaults here.
UPDATE schema_versions
SET
  state = 'APPLIED',
  execution_id = COALESCE(execution_id, '00000000-0000-0000-0000-000000000000'),
  started_at = COALESCE(applied_at, CURRENT_TIMESTAMP(3)),
  applied_at = COALESCE(applied_at, CURRENT_TIMESTAMP(3))
WHERE state IS NULL;

-- 3. Apply constraints and defaults (Contract Phase)
-- migration_path is kept NULLABLE globally to accommodate non-MIGRATION markers,
-- but we add indexes for fast reads.
ALTER TABLE schema_versions
  MODIFY COLUMN state ENUM('STARTED', 'APPLIED', 'FAILED') NOT NULL DEFAULT 'STARTED',
  MODIFY COLUMN execution_id CHAR(36) NOT NULL,
  MODIFY COLUMN started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD UNIQUE KEY uq_schema_versions_migration_path (migration_path),
  ADD KEY idx_schema_versions_state (state),
  ADD KEY idx_schema_versions_execution_id (execution_id),
  ADD KEY idx_schema_versions_record_type (record_type);
