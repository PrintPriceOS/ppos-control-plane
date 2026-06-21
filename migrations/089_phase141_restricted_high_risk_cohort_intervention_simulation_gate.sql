-- Phase 141: Restricted High-Risk Cohort Intervention Simulation Gate
-- Migration 089
-- Safety invariant: writes ONLY to Phase 141 simulation tables. Zero writes to Phase 128-140 operational tables.

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_simulations (
    simulation_id VARCHAR(64) PRIMARY KEY,
    source_execution_id VARCHAR(64) NOT NULL,
    source_execution_type VARCHAR(128) NOT NULL,
    source_execution_hash VARCHAR(64) NOT NULL,
    source_execution_evidence_pack_hash VARCHAR(64) NOT NULL,
    source_approval_hash VARCHAR(64) NOT NULL,
    source_preparation_hash VARCHAR(64) NOT NULL,
    source_review_hash VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    cohort_id VARCHAR(255) NOT NULL,
    simulation_type VARCHAR(128) NOT NULL,
    simulation_status VARCHAR(64) NOT NULL DEFAULT 'DRAFT',
    operator_confirmed TINYINT(1) NOT NULL DEFAULT 0,
    operator_confirmation_phrase VARCHAR(255) NULL,
    operator_signatory_name VARCHAR(255) NULL,
    safe_scope_simulation_attestation VARCHAR(64) NOT NULL DEFAULT 'PHASE_141_SIMULATION_ONLY_NO_OPERATIONAL_MUTATION',
    simulation_write_scope_attestation_json JSON NOT NULL,
    simulation_blockers_json JSON NOT NULL,
    impact_projection_hash VARCHAR(64) NULL,
    rollback_preview_hash VARCHAR(64) NULL,
    simulation_result_hash VARCHAR(64) NULL,
    evidence_pack_hash VARCHAR(64) NULL,
    requested_by VARCHAR(255) NOT NULL,
    started_at DATETIME NULL,
    finished_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cbcis_tenant (tenant_id),
    INDEX idx_cbcis_cohort (cohort_id),
    INDEX idx_cbcis_source_exec (source_execution_id),
    INDEX idx_cbcis_status (simulation_status),
    INDEX idx_cbcis_type (simulation_type),
    INDEX idx_cbcis_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_simulation_steps (
    step_id VARCHAR(64) PRIMARY KEY,
    simulation_id VARCHAR(64) NOT NULL,
    step_key VARCHAR(128) NOT NULL,
    step_label VARCHAR(255) NOT NULL,
    status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
    required TINYINT(1) NOT NULL DEFAULT 1,
    completed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbciss_sim (simulation_id),
    INDEX idx_cbciss_key (step_key),
    INDEX idx_cbciss_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_simulation_impact_projections (
    projection_id VARCHAR(64) PRIMARY KEY,
    simulation_id VARCHAR(64) NOT NULL,
    simulation_type VARCHAR(128) NOT NULL,
    impact_projection_json JSON NOT NULL,
    impact_projection_hash VARCHAR(64) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbcisip_sim (simulation_id),
    INDEX idx_cbcisip_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_simulation_results (
    result_id VARCHAR(64) PRIMARY KEY,
    simulation_id VARCHAR(64) NOT NULL,
    simulation_type VARCHAR(128) NOT NULL,
    result_status VARCHAR(64) NOT NULL DEFAULT 'SUCCESS',
    simulation_result_json JSON NOT NULL,
    simulation_result_hash VARCHAR(64) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbcisr_sim (simulation_id),
    INDEX idx_cbcisr_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_simulation_evidence (
    evidence_id VARCHAR(64) PRIMARY KEY,
    simulation_id VARCHAR(64) NOT NULL,
    evidence_schema_version VARCHAR(16) NOT NULL DEFAULT '141.0',
    evidence_pack_hash VARCHAR(64) NOT NULL,
    evidence_payload_json JSON NOT NULL,
    lineage_hash_chain_json JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbcise_sim (simulation_id),
    INDEX idx_cbcise_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_simulation_audit_events (
    audit_event_id VARCHAR(64) PRIMARY KEY,
    simulation_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    details_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbcisae_sim (simulation_id),
    INDEX idx_cbcisae_event (event_type),
    INDEX idx_cbcisae_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Register migration
INSERT INTO schema_versions (version, applied_at, description)
VALUES ('089', NOW(), 'Phase 141: Restricted High-Risk Cohort Intervention Simulation Gate')
ON DUPLICATE KEY UPDATE applied_at = NOW(), description = 'Phase 141: Restricted High-Risk Cohort Intervention Simulation Gate';
