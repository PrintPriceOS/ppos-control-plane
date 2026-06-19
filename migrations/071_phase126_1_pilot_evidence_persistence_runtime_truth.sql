-- Migration: 071_phase126_1_pilot_evidence_persistence_runtime_truth
-- Hardens Phase 126 schema for DB persistence & runtime truth tracking.

ALTER TABLE pilot_evidence_review_checks
  ADD COLUMN IF NOT EXISTS evidence_source_type VARCHAR(80) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS evidence_source_reference VARCHAR(120) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS evidence_integrity_hash VARCHAR(128) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS verified_from_db TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verified_from_acceptance_pack TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verified_from_schema_versions TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS runtime_truth_status VARCHAR(80) NOT NULL DEFAULT 'DEGRADED';

ALTER TABLE pilot_evidence_review_boards
  ADD COLUMN IF NOT EXISTS runtime_truth_status VARCHAR(80) NOT NULL DEFAULT 'DEGRADED';

ALTER TABLE pilot_evidence_go_no_go_decisions
  ADD COLUMN IF NOT EXISTS runtime_truth_status VARCHAR(80) NOT NULL DEFAULT 'DEGRADED';

ALTER TABLE pilot_evidence_review_packs
  ADD COLUMN IF NOT EXISTS runtime_truth_status VARCHAR(80) NOT NULL DEFAULT 'DEGRADED',
  ADD COLUMN IF NOT EXISTS persistence_status VARCHAR(80) DEFAULT NULL;
