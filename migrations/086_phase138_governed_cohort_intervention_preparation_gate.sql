-- Phase 138 — Governed Cohort Intervention Preparation Gate
-- IDEMPOTENT SCHEMA MIGRATION

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_preparations (
    preparation_id VARCHAR(64) PRIMARY KEY,
    source_review_id VARCHAR(64) NOT NULL,
    cohort_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    recommended_decision_from_phase137 VARCHAR(64) NOT NULL,
    preparation_type VARCHAR(64) NOT NULL, -- e.g. PREPARE_COHORT_PAUSE, PREPARE_MANUAL_INTERVENTION, etc.
    preparation_status VARCHAR(64) NOT NULL DEFAULT 'DRAFT', -- DRAFT, READY_FOR_REVIEW, UNDER_REVIEW, FINALIZED, SUPERSEDED, REJECTED
    preparation_execution_status VARCHAR(64) NOT NULL DEFAULT 'NOT_EXECUTED_PREPARATION_ONLY',
    source_review_evidence_pack_hash VARCHAR(128) NULL,
    source_review_evaluation_result_hash VARCHAR(128) NULL,
    source_review_input_snapshot_hash VARCHAR(128) NULL,
    finalization_blockers_json JSON NULL,
    risk_level VARCHAR(64) NOT NULL DEFAULT 'LOW',
    confidence_level VARCHAR(64) NOT NULL DEFAULT 'HIGH',
    prepared_by VARCHAR(255) NULL,
    reviewed_by VARCHAR(255) NULL,
    preparation_window_start DATETIME NOT NULL,
    preparation_window_end DATETIME NOT NULL,
    intervention_summary_json JSON NOT NULL,
    proposed_actions_json JSON NOT NULL,
    required_approvals_json JSON NOT NULL,
    rollback_considerations_json JSON NOT NULL,
    communication_plan_json JSON NOT NULL,
    non_execution_attestation_json JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    reviewed_at DATETIME NULL,
    finalized_at DATETIME NULL,
    superseded_at DATETIME NULL,
    superseded_by_preparation_id VARCHAR(64) NULL,
    superseded_reason VARCHAR(512) NULL,
    rejected_at DATETIME NULL,
    rejected_reason VARCHAR(512) NULL,
    INDEX idx_cbcip_cohort (cohort_id),
    INDEX idx_cbcip_tenant (tenant_id),
    INDEX idx_cbcip_status (preparation_status),
    INDEX idx_cbcip_review (source_review_id),
    INDEX idx_cbcip_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_preparation_items (
    item_id VARCHAR(64) PRIMARY KEY,
    preparation_id VARCHAR(64) NOT NULL,
    action_key VARCHAR(128) NOT NULL,
    description VARCHAR(255) NOT NULL,
    item_status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbcipi_prep (preparation_id),
    INDEX idx_cbcipi_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_preparation_evidence (
    evidence_id VARCHAR(64) PRIMARY KEY,
    preparation_id VARCHAR(64) NOT NULL,
    input_review_hash VARCHAR(128) NOT NULL,
    preparation_result_hash VARCHAR(128) NOT NULL,
    evidence_pack_hash VARCHAR(128) NOT NULL,
    evidence_schema_version VARCHAR(32) NOT NULL DEFAULT '138.0',
    evidence_data_json JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbcipe_prep (preparation_id),
    INDEX idx_cbcipe_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_preparation_audit_events (
    audit_event_id VARCHAR(64) PRIMARY KEY,
    preparation_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    details_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbcipae_prep (preparation_id),
    INDEX idx_cbcipae_event (event_type),
    INDEX idx_cbcipae_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Register migration in database version history table
INSERT INTO schema_versions (version, applied_at, description)
VALUES ('086', NOW(), 'Phase 138: Governed Cohort Intervention Preparation Gate')
ON DUPLICATE KEY UPDATE applied_at = NOW(), description = 'Phase 138: Governed Cohort Intervention Preparation Gate';
