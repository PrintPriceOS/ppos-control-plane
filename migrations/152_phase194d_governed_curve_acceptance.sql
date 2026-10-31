-- Migration 152: Governed Curve Acceptance Schema Extension
-- Phase 194D: Multi-quantity curve validation, midpoint structural probes, and structural audit persistence.

ALTER TABLE printhouse_pricing_calibration_acceptances
  ADD COLUMN curve_acceptance_json JSON NULL,
  ADD COLUMN acceptance_mode VARCHAR(32) NOT NULL DEFAULT 'SINGLE_POINT';
