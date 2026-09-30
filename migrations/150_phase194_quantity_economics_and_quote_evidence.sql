-- migrations/150_phase194_quantity_economics_and_quote_evidence.sql
--
-- Phase 194A — Quote Evidence Persistence Layer & Evidence Integrity Foundation
--
-- Creates the durable, immutable source evidence persistence model for storing
-- raw quotation extractions, normalized quotation JSON, and deterministic
-- arithmetic consistency validation results.
--
-- Design invariants:
--   - Additive / forward-only DDL
--   - Document SHA-256 for evidence idempotency and duplicate detection
--   - Strict tenant isolation (tenant_id foreign key)
--   - No active printer_nodes.rates_json mutation
--   - Separates source values from derived values for audit traceability

CREATE TABLE IF NOT EXISTS quote_evidence_documents (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  printer_node_id VARCHAR(64) NULL,

  source_type ENUM('PDF', 'CHAT_TEXT', 'MANUAL_JSON') NOT NULL DEFAULT 'MANUAL_JSON',
  original_filename VARCHAR(255) NULL,
  document_sha256 VARCHAR(128) NOT NULL,
  detected_language VARCHAR(10) NULL DEFAULT 'de',
  raw_text LONGTEXT NULL,

  status ENUM('INGESTED', 'EXTRACTED', 'VALIDATED', 'REVIEWED', 'REJECTED') NOT NULL DEFAULT 'INGESTED',

  created_by_json JSON NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

  INDEX idx_qed_tenant (tenant_id),
  INDEX idx_qed_tenant_node (tenant_id, printer_node_id),
  INDEX idx_qed_sha (document_sha256),
  INDEX idx_qed_status (status),

  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (printer_node_id) REFERENCES printer_nodes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quote_evidence_extractions (
  id VARCHAR(64) PRIMARY KEY,
  quote_evidence_document_id VARCHAR(64) NOT NULL,
  tenant_id VARCHAR(64) NOT NULL,

  extracted_json JSON NOT NULL,
  normalized_json JSON NOT NULL,

  validation_status ENUM(
    'CONSISTENT',
    'INCONSISTENT_TOTAL',
    'INCONSISTENT_UNIT_PRICE',
    'INCOMPLETE',
    'AMBIGUOUS',
    'UNSUPPORTED',
    'REQUIRES_REVIEW'
  ) NOT NULL DEFAULT 'INCOMPLETE',

  validation_errors_json JSON NULL,
  validation_metrics_json JSON NULL,

  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

  INDEX idx_qee_tenant (tenant_id),
  INDEX idx_qee_doc (quote_evidence_document_id),
  INDEX idx_qee_status (validation_status),

  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (quote_evidence_document_id) REFERENCES quote_evidence_documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
