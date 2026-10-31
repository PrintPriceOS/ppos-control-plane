-- Migration 157: Calibration Acceptances Nullable Provenance for Operator Adjustments
-- Phase 194G: Allows calibration_session_id and calibration_run_id to be NULL for direct operator adjustments.

ALTER TABLE printhouse_pricing_calibration_acceptances
  MODIFY COLUMN calibration_session_id VARCHAR(64) NULL,
  MODIFY COLUMN calibration_run_id VARCHAR(64) NULL;
