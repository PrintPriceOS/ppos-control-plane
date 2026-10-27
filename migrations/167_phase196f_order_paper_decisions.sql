-- migrations/167_phase196f_order_paper_decisions.sql
-- PrintPrice OS — Phase 196F: Governed Persistence for Printhouse Paper Decisions (BUDGET-02B-01)
--
-- Formal, auditable technical decisions by assigned printhouses for job paper availability:
-- 1. CONFIRM: Printhouse confirms requested material availability (Delta = 0).
-- 2. PROPOSE_ALTERNATIVE: Printhouse proposes alternative technical variant from paper_variants catalog.
-- 3. REJECT: Printhouse rejects availability, reverting to baseline standard specification.
--
-- Strict Relational & Security Guarantees:
-- - Internal SQL Foreign Keys to paper_variants(id) with ON DELETE RESTRICT.
-- - Immutable embedded snapshot of requested material specifications.
-- - External order reference isolation (no cross-database foreign keys to Budget App).
-- - Idempotency enforcement via unique index on (tenant_id, idempotency_key).
-- - Multi-tenant isolation and auditable operator metadata.

CREATE TABLE IF NOT EXISTS order_paper_decisions (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    
    -- Hybrid Order References (Budget App External Reference & Internal Canonical Order)
    external_order_intent_id VARCHAR(64) NOT NULL,
    canonical_order_id VARCHAR(64) NULL,
    printhouse_tenant_id VARCHAR(64) NOT NULL,
    operator_id VARCHAR(64) NOT NULL,
    
    -- Evaluated Material Role
    paper_role ENUM('INTERIOR', 'COVER', 'ENDPAPER') NOT NULL,
    
    -- Internal SQL References to Master Catalog
    requested_variant_id VARCHAR(64) NOT NULL,
    decision_action ENUM('CONFIRM', 'PROPOSE_ALTERNATIVE', 'REJECT') NOT NULL,
    alternative_variant_id VARCHAR(64) NULL,
    
    -- Immutable Technical Snapshot of Requested Paper
    snapshot_requested_gsm INT NOT NULL,
    snapshot_requested_width_mm DECIMAL(10, 2) NOT NULL,
    snapshot_requested_height_mm DECIMAL(10, 2) NOT NULL,
    snapshot_requested_finish VARCHAR(64) NULL,
    snapshot_requested_category VARCHAR(64) NOT NULL,
    
    -- Economic Decoupling (BUDGET-02B-01: Zero customer price mutation)
    estimated_cost_delta DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
    economic_status ENUM('DELTA_ZERO_CONFIRMED', 'REQUIRES_ECONOMIC_REVISION', 'REVISION_NOT_APPLICABLE') NOT NULL DEFAULT 'DELTA_ZERO_CONFIRMED',
    
    -- Technical Justification & Printhouse Notes
    technical_reason VARCHAR(255) NULL,
    printhouse_notes TEXT NULL,
    
    -- Versioning, Sequencing & State Machine
    decision_number INT NOT NULL DEFAULT 1,
    status ENUM('ACTIVE', 'SUPERSEDED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    idempotency_key VARCHAR(128) NOT NULL,
    
    -- Audit Metadata
    metadata_json JSON NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_opd_tenant (tenant_id),
    INDEX idx_opd_ext_intent (external_order_intent_id),
    INDEX idx_opd_order (canonical_order_id),
    INDEX idx_opd_printer (printhouse_tenant_id),
    INDEX idx_opd_variant (requested_variant_id),
    INDEX idx_opd_alt_variant (alternative_variant_id),
    INDEX idx_opd_order_role (tenant_id, external_order_intent_id, paper_role),
    INDEX idx_opd_created_at (created_at),
    UNIQUE KEY uk_opd_idempotency (tenant_id, idempotency_key),
    
    -- Relational Integrity inside Control Plane MySQL
    CONSTRAINT fk_opd_requested_variant FOREIGN KEY (requested_variant_id) REFERENCES paper_variants(id) ON DELETE RESTRICT,
    CONSTRAINT fk_opd_alternative_variant FOREIGN KEY (alternative_variant_id) REFERENCES paper_variants(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
