-- migrations/149_phase193h8c6111_calibration_run_status_domain_expansion.sql
--
-- Phase 193H.8C.6.11.1 — Calibration Run Status Schema Contract Alignment
--
-- Expands the status ENUM in printhouse_pricing_calibration_runs to include
-- 'ACCEPTABLE_CANDIDATE' and all canonical application statuses.
--
-- Design invariants:
--   - Additive / forward-only ALTER TABLE MODIFY COLUMN
--   - Preserves all existing rows and timestamps
--   - Does NOT rewrite historical run records automatically
--   - Does NOT touch activation grants or marketplace tables
--   - Idempotent and safe for execution on production schema

ALTER TABLE printhouse_pricing_calibration_runs
  MODIFY COLUMN status ENUM(
    'PENDING',
    'RUNNING',
    'SUCCEEDED',
    'CONVERGED',
    'UNDERDETERMINED_ANCHOR',
    'ACCEPTABLE_CANDIDATE',
    'NO_SOLUTION',
    'AMBIGUOUS',
    'FAILED'
  ) NOT NULL DEFAULT 'PENDING';
