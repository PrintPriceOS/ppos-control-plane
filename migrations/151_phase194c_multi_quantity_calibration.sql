-- migrations/151_phase194c_multi_quantity_calibration.sql
--
-- Phase 194C — Multi-Quantity Calibration Persistence & Curve Metrics Schema Expansion
--
-- Adds additive support for multi-quantity calibration targets, per-point solver
-- evaluation results, curve residual metrics, and mathematical identifiability diagnostics.
--
-- Design invariants:
--   - Additive / forward-only ALTER TABLE
--   - Preserves all existing Phase 193 single-target sessions and runs
--   - Strict foreign key to quote_evidence_documents (nullable)
--   - No active printer_nodes.rates_json mutation

ALTER TABLE printhouse_pricing_calibration_sessions
  ADD COLUMN multi_targets_json JSON NULL AFTER target_manufacturing_price,
  ADD COLUMN target_count INT UNSIGNED NULL DEFAULT 1 AFTER multi_targets_json,
  ADD COLUMN quote_evidence_id VARCHAR(64) NULL AFTER printer_node_name_snapshot,
  ADD CONSTRAINT fk_ppcs_quote_evidence
    FOREIGN KEY (quote_evidence_id) REFERENCES quote_evidence_documents(id)
    ON DELETE SET NULL;

ALTER TABLE printhouse_pricing_calibration_runs
  ADD COLUMN point_results_json JSON NULL AFTER candidate_parameters_json,
  ADD COLUMN curve_metrics_json JSON NULL AFTER point_results_json,
  ADD COLUMN identifiability_json JSON NULL AFTER curve_metrics_json;
