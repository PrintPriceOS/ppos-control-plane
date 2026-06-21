-- Phase 139 — Governed Cohort Intervention Approval Gate
-- IDEMPOTENT SCHEMA MIGRATION

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_approvals (
    approval_id VARCHAR(64) PRIMARY KEY,
    source_preparation_id VARCHAR(64) NOT NULL,
    source_review_id VARCHAR(64) NOT NULL,
    cohort_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    preparation_type VARCHAR(64) NOT NULL,
    recommended_decision_from_phase137 VARCHAR(64) NOT NULL,
    approval_status VARCHAR(64) NOT NULL DEFAULT 'DRAFT', -- DRAFT, READY_FOR_APPROVAL, UNDER_APPROVAL, APPROVED, REJECTED, CHANGES_REQUESTED, RETURNED_TO_PREPARATION, ESCALATED, FINALIZED, SUPERSEDED
    approval_decision VARCHAR(64) NULL, -- APPROVE_FOR_FUTURE_EXECUTION, REJECT_INTERVENTION, REQUEST_CHANGES, RETURN_TO_PREPARATION, ESCALATE_FOR_MANUAL_REVIEW, REQUIRE_ADDITIONAL_EVIDENCE
    risk_level VARCHAR(64) NOT NULL DEFAULT 'LOW',
    confidence_level VARCHAR(64) NOT NULL DEFAULT 'HIGH',
    approval_policy_json JSON NOT NULL,
    required_approvers_json JSON NOT NULL,
    approval_steps_json JSON NOT NULL,
    approval_findings_json JSON NOT NULL,
    approval_blockers_json JSON NOT NULL,
    non_execution_attestation_json JSON NOT NULL,
    source_preparation_hash VARCHAR(128) NOT NULL,
    source_preparation_evidence_pack_hash VARCHAR(128) NOT NULL,
    source_review_evidence_pack_hash VARCHAR(128) NOT NULL,
    approval_result_hash VARCHAR(128) NULL,
    evidence_pack_hash VARCHAR(128) NULL,
    requested_by VARCHAR(255) NULL,
    reviewed_by VARCHAR(255) NULL,
    approved_by VARCHAR(255) NULL,
    rejected_by VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    reviewed_at DATETIME NULL,
    approved_at DATETIME NULL,
    rejected_at DATETIME NULL,
    finalized_at DATETIME NULL,
    superseded_at DATETIME NULL,
    superseded_by_approval_id VARCHAR(64) NULL,
    superseded_reason VARCHAR(512) NULL,
    rejected_reason VARCHAR(512) NULL,
    INDEX idx_cbcia_cohort (cohort_id),
    INDEX idx_cbcia_tenant (tenant_id),
    INDEX idx_cbcia_status (approval_status),
    INDEX idx_cbcia_prep (source_preparation_id),
    INDEX idx_cbcia_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_approval_steps (
    step_id VARCHAR(64) PRIMARY KEY,
    approval_id VARCHAR(64) NOT NULL,
    role VARCHAR(64) NOT NULL,
    approver_id VARCHAR(255) NULL,
    status VARCHAR(64) NOT NULL DEFAULT 'PENDING', -- PENDING, SIGNED, BYPASSED
    signed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbcias_app (approval_id),
    INDEX idx_cbcias_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_approval_evidence (
    evidence_id VARCHAR(64) PRIMARY KEY,
    approval_id VARCHAR(64) NOT NULL,
    input_preparation_hash VARCHAR(128) NOT NULL,
    approval_result_hash VARCHAR(128) NOT NULL,
    evidence_pack_hash VARCHAR(128) NOT NULL,
    evidence_schema_version VARCHAR(32) NOT NULL DEFAULT '139.0',
    evidence_data_json JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbciae_app (approval_id),
    INDEX idx_cbciae_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_approval_audit_events (
    audit_event_id VARCHAR(64) PRIMARY KEY,
    approval_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    details_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbciaae_app (approval_id),
    INDEX idx_cbciaae_event (event_type),
    INDEX idx_cbciaae_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Register migration in database version history table
INSERT INTO schema_versions (version, applied_at, description)
VALUES ('087', NOW(), 'Phase 139: Governed Cohort Intervention Approval Gate')
ON DUPLICATE KEY UPDATE applied_at = NOW(), description = 'Phase 139: Governed Cohort Intervention Approval Gate';
