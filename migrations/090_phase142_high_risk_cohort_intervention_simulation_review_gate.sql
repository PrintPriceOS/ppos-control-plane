-- Phase 142: High-Risk Cohort Intervention Simulation Review Gate
-- Migration 090
-- Safety invariant: review-only schema. Zero operational mutations or execution capability.

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_sim_reviews (
    review_id VARCHAR(64) PRIMARY KEY,
    source_simulation_id VARCHAR(64) NOT NULL,
    source_execution_id VARCHAR(64) NOT NULL,
    source_approval_id VARCHAR(64) NULL,
    source_preparation_id VARCHAR(64) NULL,
    source_review_id VARCHAR(64) NULL,
    cohort_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    simulation_type VARCHAR(128) NOT NULL,
    review_status VARCHAR(64) NOT NULL DEFAULT 'DRAFT',
    review_decision VARCHAR(128) NULL,
    risk_level VARCHAR(64) NOT NULL DEFAULT 'LOW',
    confidence_level VARCHAR(64) NOT NULL DEFAULT 'HIGH',
    projected_impact_score DECIMAL(5,2) NULL,
    rollback_feasibility_score DECIMAL(5,2) NULL,
    evidence_completeness_score DECIMAL(5,2) NULL,
    guardrail_status VARCHAR(64) NOT NULL DEFAULT 'PASS',
    write_scope_status VARCHAR(64) NOT NULL DEFAULT 'PASS',
    reviewed_by VARCHAR(255) NULL,
    finalized_by VARCHAR(255) NULL,
    review_summary_json JSON NOT NULL,
    impact_review_json JSON NOT NULL,
    rollback_review_json JSON NOT NULL,
    guardrail_review_json JSON NOT NULL,
    write_scope_attestation_json JSON NOT NULL,
    approval_readiness_json JSON NOT NULL,
    review_blockers_json JSON NOT NULL,
    non_execution_attestation_json JSON NOT NULL,
    source_simulation_hash VARCHAR(64) NOT NULL,
    source_simulation_evidence_pack_hash VARCHAR(64) NOT NULL,
    source_execution_evidence_pack_hash VARCHAR(64) NOT NULL,
    review_result_hash VARCHAR(64) NULL,
    evidence_pack_hash VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    reviewed_at DATETIME NULL,
    finalized_at DATETIME NULL,
    superseded_at DATETIME NULL,
    INDEX idx_cbcisr_source_sim (source_simulation_id),
    INDEX idx_cbcisr_tenant (tenant_id),
    INDEX idx_cbcisr_cohort (cohort_id),
    INDEX idx_cbcisr_status (review_status),
    INDEX idx_cbcisr_decision (review_decision),
    INDEX idx_cbcisr_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_sim_review_findings (
    finding_id VARCHAR(64) PRIMARY KEY,
    review_id VARCHAR(64) NOT NULL,
    finding_type VARCHAR(128) NOT NULL,
    severity VARCHAR(64) NOT NULL DEFAULT 'INFO',
    description TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbcisrf_review (review_id),
    INDEX idx_cbcisrf_type (finding_type),
    INDEX idx_cbcisrf_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_sim_review_decisions (
    decision_id VARCHAR(64) PRIMARY KEY,
    review_id VARCHAR(64) NOT NULL,
    decision VARCHAR(128) NOT NULL,
    rationale TEXT NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbcisrd_review (review_id),
    INDEX idx_cbcisrd_decision (decision),
    INDEX idx_cbcisrd_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_sim_review_evidence (
    evidence_id VARCHAR(64) PRIMARY KEY,
    review_id VARCHAR(64) NOT NULL,
    evidence_schema_version VARCHAR(16) NOT NULL DEFAULT '142.0',
    evidence_pack_hash VARCHAR(64) NOT NULL,
    evidence_payload_json JSON NOT NULL,
    lineage_hash_chain_json JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbcisre_review (review_id),
    INDEX idx_cbcisre_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_sim_review_audit_events (
    audit_event_id VARCHAR(64) PRIMARY KEY,
    review_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    details_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbcisrae_review (review_id),
    INDEX idx_cbcisrae_event (event_type),
    INDEX idx_cbcisrae_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Register migration
INSERT INTO schema_versions (version, applied_at, description)
VALUES ('090', NOW(), 'Phase 142: High-Risk Cohort Intervention Simulation Review Gate')
ON DUPLICATE KEY UPDATE applied_at = NOW(), description = 'Phase 142: High-Risk Cohort Intervention Simulation Review Gate';
