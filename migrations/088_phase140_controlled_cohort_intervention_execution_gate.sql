-- Phase 140 — Controlled Cohort Intervention Execution Gate
-- IDEMPOTENT SCHEMA MIGRATION

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_executions (
    execution_id VARCHAR(64) PRIMARY KEY,
    source_approval_id VARCHAR(64) NOT NULL,
    source_preparation_id VARCHAR(64) NOT NULL,
    source_review_id VARCHAR(64) NOT NULL,
    cohort_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    execution_type VARCHAR(64) NOT NULL,
    execution_status VARCHAR(64) NOT NULL DEFAULT 'DRAFT', -- DRAFT, READY_FOR_DRY_RUN, DRY_RUN_COMPLETED, READY_FOR_OPERATOR_CONFIRMATION, CONFIRMED_FOR_EXECUTION, EXECUTION_IN_PROGRESS, EXECUTED, EXECUTION_FAILED, ROLLBACK_REQUIRED, ROLLBACK_COMPLETED, CANCELLED, SUPERSEDED
    risk_level VARCHAR(64) NOT NULL DEFAULT 'LOW',
    confidence_level VARCHAR(64) NOT NULL DEFAULT 'HIGH',
    dry_run_hash VARCHAR(128) NULL,
    operator_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    operator_confirmed_by VARCHAR(255) NULL,
    operator_confirmed_at DATETIME NULL,
    operator_confirmation_phrase VARCHAR(255) NULL,
    operator_confirmation_signature VARCHAR(255) NULL,
    safe_scope_attestation_json JSON NOT NULL,
    execution_blockers_json JSON NOT NULL,
    execution_findings_json JSON NOT NULL,
    lineage_hashes_json JSON NOT NULL,
    evidence_pack_hash VARCHAR(128) NULL,
    requested_by VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    started_at DATETIME NULL,
    finished_at DATETIME NULL,
    cancelled_at DATETIME NULL,
    cancelled_by VARCHAR(255) NULL,
    cancelled_reason VARCHAR(512) NULL,
    superseded_at DATETIME NULL,
    superseded_by_execution_id VARCHAR(64) NULL,
    superseded_reason VARCHAR(512) NULL,
    INDEX idx_cbcie_cohort (cohort_id),
    INDEX idx_cbcie_tenant (tenant_id),
    INDEX idx_cbcie_status (execution_status),
    INDEX idx_cbcie_approval (source_approval_id),
    INDEX idx_cbcie_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_execution_steps (
    step_id VARCHAR(64) PRIMARY KEY,
    execution_id VARCHAR(64) NOT NULL,
    step_key VARCHAR(64) NOT NULL,
    description VARCHAR(255) NOT NULL,
    status VARCHAR(64) NOT NULL DEFAULT 'PENDING', -- PENDING, COMPLETED, FAILED
    completed_at DATETIME NULL,
    INDEX idx_cbcies_exec (execution_id),
    INDEX idx_cbcies_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_execution_dry_runs (
    dry_run_id VARCHAR(64) PRIMARY KEY,
    execution_id VARCHAR(64) NOT NULL,
    dry_run_hash VARCHAR(128) NOT NULL,
    dry_run_payload_json JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbcied_exec (execution_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_execution_results (
    result_id VARCHAR(64) PRIMARY KEY,
    execution_id VARCHAR(64) NOT NULL,
    result_status VARCHAR(64) NOT NULL, -- SUCCESS, PARTIAL_SUCCESS, FAILED, CANCELLED, ROLLBACK_REQUIRED, ROLLBACK_COMPLETED
    result_payload_json JSON NOT NULL,
    execution_result_hash VARCHAR(128) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbcier_exec (execution_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_execution_rollback_plans (
    rollback_plan_id VARCHAR(64) PRIMARY KEY,
    execution_id VARCHAR(64) NOT NULL,
    rollback_status VARCHAR(64) NOT NULL DEFAULT 'PENDING', -- PENDING, EXECUTED, FAILED
    rollback_payload_json JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbcierp_exec (execution_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_execution_evidence (
    evidence_id VARCHAR(64) PRIMARY KEY,
    execution_id VARCHAR(64) NOT NULL,
    source_approval_hash VARCHAR(128) NOT NULL,
    dry_run_hash VARCHAR(128) NOT NULL,
    execution_result_hash VARCHAR(128) NOT NULL,
    evidence_pack_hash VARCHAR(128) NOT NULL,
    evidence_schema_version VARCHAR(32) NOT NULL DEFAULT '140.0',
    evidence_data_json JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbciee_exec (execution_id),
    INDEX idx_cbciee_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_execution_audit_events (
    audit_event_id VARCHAR(64) PRIMARY KEY,
    execution_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    details_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbcieae_exec (execution_id),
    INDEX idx_cbcieae_event (event_type),
    INDEX idx_cbcieae_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Register migration in database version history table
INSERT INTO schema_versions (version, applied_at, description)
VALUES ('088', NOW(), 'Phase 140: Controlled Cohort Intervention Execution Gate')
ON DUPLICATE KEY UPDATE applied_at = NOW(), description = 'Phase 140: Controlled Cohort Intervention Execution Gate';
