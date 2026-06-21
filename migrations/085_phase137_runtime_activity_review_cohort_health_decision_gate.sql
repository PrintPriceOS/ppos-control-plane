-- Phase 137 — Runtime Activity Review / Cohort Health Decision Gate
-- IDEMPOTENT SCHEMA MIGRATION

CREATE TABLE IF NOT EXISTS controlled_beta_runtime_activity_reviews (
    review_id VARCHAR(64) PRIMARY KEY,
    cohort_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    review_window_start DATETIME NOT NULL,
    review_window_end DATETIME NOT NULL,
    reviewed_by VARCHAR(255) NULL,
    review_status VARCHAR(64) NOT NULL DEFAULT 'DRAFT', -- DRAFT, READY_FOR_REVIEW, UNDER_REVIEW, FINALIZED, SUPERSEDED
    risk_level VARCHAR(64) NOT NULL DEFAULT 'LOW', -- LOW, MEDIUM, HIGH, CRITICAL
    confidence_level VARCHAR(64) NOT NULL DEFAULT 'HIGH',
    non_mutation_attestation_json JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    finalized_at DATETIME NULL,
    superseded_at DATETIME NULL,
    superseded_by_review_id VARCHAR(64) NULL,
    superseded_reason VARCHAR(512) NULL,
    INDEX idx_cbrar_cohort (cohort_id),
    INDEX idx_cbrar_tenant (tenant_id),
    INDEX idx_cbrar_status (review_status),
    INDEX idx_cbrar_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_runtime_activity_review_decisions (
    decision_id VARCHAR(64) PRIMARY KEY,
    review_id VARCHAR(64) NOT NULL,
    recommended_decision VARCHAR(64) NOT NULL,
    decision_execution_status VARCHAR(64) NOT NULL DEFAULT 'NOT_EXECUTED_REVIEW_ONLY',
    execution_blocked_reason VARCHAR(255) NOT NULL DEFAULT 'PHASE_137_IS_READONLY_RECOMMENDATION_GATE',
    rationale TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbrard_review (review_id),
    INDEX idx_cbrard_decision (recommended_decision),
    INDEX idx_cbrard_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_runtime_activity_review_findings (
    finding_id VARCHAR(64) PRIMARY KEY,
    review_id VARCHAR(64) NOT NULL,
    finding_key VARCHAR(128) NOT NULL,
    severity VARCHAR(64) NOT NULL DEFAULT 'MEDIUM',
    details_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbrarf_review (review_id),
    INDEX idx_cbrarf_key (finding_key),
    INDEX idx_cbrarf_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_runtime_activity_review_evidence (
    evidence_id VARCHAR(64) PRIMARY KEY,
    review_id VARCHAR(64) NOT NULL,
    input_snapshot_hash VARCHAR(128) NOT NULL,
    evaluation_result_hash VARCHAR(128) NOT NULL,
    evidence_pack_hash VARCHAR(128) NOT NULL,
    evidence_schema_version VARCHAR(32) NOT NULL DEFAULT '137.0',
    evidence_data_json JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbrare_review (review_id),
    INDEX idx_cbrare_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_runtime_activity_review_audit_events (
    audit_event_id VARCHAR(64) PRIMARY KEY,
    review_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    details_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbrarae_review (review_id),
    INDEX idx_cbrarae_event (event_type),
    INDEX idx_cbrarae_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Register migration in database version history table
INSERT INTO schema_versions (version, applied_at, description)
VALUES ('085', NOW(), 'Phase 137: Runtime Activity Review / Cohort Health Decision Gate')
ON DUPLICATE KEY UPDATE applied_at = NOW(), description = 'Phase 137: Runtime Activity Review / Cohort Health Decision Gate';
