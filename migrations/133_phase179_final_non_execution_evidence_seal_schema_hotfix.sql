-- Migration 133: Phase 179 - Final Non-Execution Evidence Seal Schema Hotfix

ALTER TABLE cb_cohort_intervention_activation_token_redempt_unlock_fnees
  ADD COLUMN IF NOT EXISTS non_execution_invariant_snapshot_json LONGTEXT NULL,
  ADD COLUMN IF NOT EXISTS final_non_execution_evidence_snapshot_json LONGTEXT NULL;
