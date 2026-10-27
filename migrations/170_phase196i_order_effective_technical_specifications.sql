-- migrations/170_phase196i_order_effective_technical_specifications.sql
-- PrintPrice OS — Phase 196I: Governed Effective Technical Specifications for Manufacturing (BUDGET-02D-01)
--
-- Strict Relational, Manufacturing & Audit Guarantees:
-- 1. Preservation of Original Snapshot: The original order_pricing_snapshots record is never mutated or overwritten.
-- 2. Single Authoritative Effective Technical Version: Exactly one ACTIVE effective technical specification per order intent.
-- 3. Cryptographic & Contractual Provenance: Explicitly binds canonical order, paper decision, accepted quote revision,
--    revised BPE calculation breakdown, forensic consent record, and financial reconciliation status.
-- 4. Industrial Handoff Gate: Manufacturing dispatch consumes exclusively ACTIVE effective technical specifications.
-- 5. Multi-Tenant Isolation: tenant_id strictly indexed and partitioned.

CREATE TABLE IF NOT EXISTS order_effective_technical_specifications (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    canonical_order_id VARCHAR(128) NOT NULL,
    external_order_intent_id VARCHAR(128) NOT NULL,
    paper_decision_id VARCHAR(64) NULL,
    revision_id VARCHAR(64) NULL,
    bpe_calculation_id VARCHAR(128) NULL,
    pricing_snapshot_id VARCHAR(64) NULL,
    effective_status ENUM('ACTIVE', 'SUPERSEDED', 'CANCELLED', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    specs_json JSON NOT NULL,
    pricing_summary_json JSON NOT NULL,
    consent_record_json JSON NOT NULL,
    financial_reconciliation_status VARCHAR(64) NOT NULL,
    industrial_gate_status VARCHAR(64) NOT NULL DEFAULT 'PREFLIGHT_PENDING',
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    INDEX idx_oets_tenant_order (tenant_id, canonical_order_id),
    INDEX idx_oets_intent (external_order_intent_id),
    INDEX idx_oets_status (effective_status),
    INDEX idx_oets_revision (revision_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
