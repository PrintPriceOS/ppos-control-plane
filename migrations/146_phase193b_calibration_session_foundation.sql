-- migrations/146_phase193b_calibration_session_foundation.sql
--
-- Phase 193B — Reference Book Calibration Session & Provenance Foundation
--
-- Creates the durable persistence model for storing structured known-book
-- examples against owned printer nodes, with immutable provenance for
-- future deterministic calibration.
--
-- Design decisions:
--   - includes_* columns are NULL by default (B9 ambiguity detection)
--   - Actor stored as JSON (project convention from Phase 191H)
--   - No solver output columns (deferred to 193C calibration_runs table)
--   - Rates snapshot taken only at READY transition, immutable after
--   - printer_node_name_snapshot for human provenance (no slug column exists)

CREATE TABLE IF NOT EXISTS printhouse_pricing_calibration_sessions (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  printer_node_id VARCHAR(64) NOT NULL,
  printer_node_name_snapshot VARCHAR(255) NULL,
  created_by_json JSON NOT NULL,

  status ENUM('DRAFT','READY','CALCULATED','ACCEPTED','REJECTED')
    NOT NULL DEFAULT 'DRAFT',

  -- B1: Reference Book Structured Spec (canonical BPE taxonomy)
  book_spec_json JSON NOT NULL,

  -- B2: Target Price — manufacturing and transport separated
  target_manufacturing_price DECIMAL(12,4) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
  transport_price_per_kg DECIMAL(12,4) NULL,
  transport_currency VARCHAR(10) NULL,

  -- B9: Price inclusion semantics — NULL = unanswered, explicit before READY
  includes_paper    BOOLEAN NULL DEFAULT NULL,
  includes_binding  BOOLEAN NULL DEFAULT NULL,
  includes_finishing BOOLEAN NULL DEFAULT NULL,
  includes_packaging BOOLEAN NULL DEFAULT NULL,

  -- B6/B7: Immutable rates snapshot (taken at READY transition only)
  current_rates_snapshot_json JSON NULL,
  current_rates_checksum VARCHAR(128) NULL,
  rates_snapshot_at TIMESTAMP(6) NULL,

  -- Timestamps
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  accepted_at TIMESTAMP(6) NULL,
  rejected_at TIMESTAMP(6) NULL,
  rejection_reason TEXT NULL,

  -- Indexes
  INDEX idx_cal_tenant (tenant_id),
  INDEX idx_cal_tenant_node (tenant_id, printer_node_id),
  INDEX idx_cal_status (status),

  -- Foreign keys
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (printer_node_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
