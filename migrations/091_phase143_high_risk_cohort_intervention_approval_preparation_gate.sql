-- Phase 143: High-Risk Cohort Intervention Approval Preparation Gate
-- Migration 091
-- Safety invariant: preparation-only schema. Zero operational mutations or execution capability.

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_app_preps (
    prep_id VARCHAR(64) PRIMARY KEY,
    source_review_id VARCHAR(64) NOT NULL,
    source_simulation_id VARCHAR(64) NOT NULL,
    source_execution_id VARCHAR(64) NOT NULL,
    cohort_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    simulation_type VARCHAR(128) NOT NULL,
    prep_status VARCHAR(64) NOT NULL DEFAULT 'DRAFT',
    prep_outcome VARCHAR(128) NULL,
    risk_level VARCHAR(64) NOT NULL DEFAULT 'LOW',
    confidence_level VARCHAR(64) NOT NULL DEFAULT 'HIGH',
    projected_impact_score DECIMAL(5,2) NULL,
    rollback_feasibility_score DECIMAL(5,2) NULL,
    evidence_completeness_score DECIMAL(5,2) NULL,
    guardrail_status VARCHAR(64) NOT NULL DEFAULT 'PASS',
    write_scope_status VARCHAR(64) NOT NULL DEFAULT 'PASS',
    prepared_by VARCHAR(255) NULL,
    finalized_by VARCHAR(255) NULL,
    prep_summary_json JSON NOT NULL,
    impact_review_json JSON NOT NULL,
    rollback_review_json JSON NOT NULL,
    guardrail_review_json JSON NOT NULL,
    write_scope_attestation_json JSON NOT NULL,
    approval_readiness_json JSON NOT NULL,
    prep_blockers_json JSON NOT NULL,
    non_execution_attestation_json JSON NOT NULL,
    source_review_hash VARCHAR(64) NOT NULL,
    source_review_evidence_pack_hash VARCHAR(64) NOT NULL,
    prep_result_hash VARCHAR(64) NULL,
    evidence_pack_hash VARCHAR(64) NULL,
    execution_capability_status VARCHAR(64) NOT NULL DEFAULT 'EXECUTION_NOT_ENABLED',
    approval_execution_status VARCHAR(64) NOT NULL DEFAULT 'NOT_APPROVED_NOT_EXECUTED_PREPARATION_ONLY',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    prepared_at DATETIME NULL,
    finalized_at DATETIME NULL,
    superseded_at DATETIME NULL,
    INDEX idx_cbcisap_source_rev (source_review_id),
    INDEX idx_cbcisap_tenant (tenant_id),
    INDEX idx_cbcisap_cohort (cohort_id),
    INDEX idx_cbcisap_status (prep_status),
    INDEX idx_cbcisap_outcome (prep_outcome),
    INDEX idx_cbcisap_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_app_prep_findings (
    finding_id VARCHAR(64) PRIMARY KEY,
    prep_id VARCHAR(64) NOT NULL,
    finding_type VARCHAR(128) NOT NULL,
    severity VARCHAR(64) NOT NULL DEFAULT 'INFO',
    description TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbcisapf_prep (prep_id),
    INDEX idx_cbcisapf_type (finding_type),
    INDEX idx_cbcisapf_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_app_prep_evidence (
    evidence_id VARCHAR(64) PRIMARY KEY,
    prep_id VARCHAR(64) NOT NULL,
    evidence_schema_version VARCHAR(16) NOT NULL DEFAULT '143.0',
    evidence_pack_hash VARCHAR(64) NOT NULL,
    evidence_payload_json JSON NOT NULL,
    lineage_hash_chain_json JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbcisape_prep (prep_id),
    INDEX idx_cbcisape_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_app_prep_audit_events (
    audit_event_id VARCHAR(64) PRIMARY KEY,
    prep_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    details_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbcisapae_prep (prep_id),
    INDEX idx_cbcisapae_event (event_type),
    INDEX idx_cbcisapae_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Register migration
INSERT INTO schema_versions (version, applied_at, description)
VALUES ('091', NOW(), 'Phase 143: High-Risk Cohort Intervention Approval Preparation Gate')
ON DUPLICATE KEY UPDATE applied_at = NOW(), description = 'Phase 143: High-Risk Cohort Intervention Approval Preparation Gate';
