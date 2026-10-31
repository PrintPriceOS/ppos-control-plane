-- Phase 132: Controlled Beta Invite-Only Expansion Preparation Gate
-- This schema establishes the preparation lifecycle following an approved operational review.

-- 1. Preparation Gates (Root context)
CREATE TABLE controlled_beta_expansion_preparation_gates (
    preparation_id VARCHAR(64) PRIMARY KEY,
    review_id VARCHAR(64) NOT NULL,
    decision_id VARCHAR(64) NOT NULL,
    activation_id VARCHAR(64) NOT NULL,
    gate_id VARCHAR(64) NOT NULL,
    cohort_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    
    preparation_status VARCHAR(64) NOT NULL DEFAULT 'DRAFT',
    
    -- Invariants strictly disabled by default
    full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
    open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_signup_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_beta_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0,
    auto_expansion_enabled TINYINT(1) NOT NULL DEFAULT 0,
    invite_sending_enabled TINYINT(1) NOT NULL DEFAULT 0,
    active_invite_creation_enabled TINYINT(1) NOT NULL DEFAULT 0,
    participant_auto_add_enabled TINYINT(1) NOT NULL DEFAULT 0,
    scope_auto_broaden_enabled TINYINT(1) NOT NULL DEFAULT 0,
    
    invite_only TINYINT(1) NOT NULL DEFAULT 1,
    cohort_scoped TINYINT(1) NOT NULL DEFAULT 1,
    tenant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    participant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    manual_approval_required TINYINT(1) NOT NULL DEFAULT 1,

    prepared_at DATETIME NULL,
    prepared_by VARCHAR(255) NULL,
    
    runtime_truth_status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
    persistence_status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
    
    verified_from_phase131 TINYINT(1) NOT NULL DEFAULT 0,
    verified_from_phase130 TINYINT(1) NOT NULL DEFAULT 0,
    verified_from_phase129 TINYINT(1) NOT NULL DEFAULT 0,
    verified_from_phase128_1 TINYINT(1) NOT NULL DEFAULT 0,
    
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_cb_ex_prep_rev (review_id),
    INDEX idx_cb_ex_prep_dec (decision_id),
    INDEX idx_cb_ex_prep_act (activation_id),
    INDEX idx_cb_ex_prep_gate (gate_id),
    INDEX idx_cb_ex_prep_stat (preparation_status),
    INDEX idx_cb_ex_prep_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Preparation Inputs (from Operational Review)
CREATE TABLE controlled_beta_expansion_preparation_inputs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    preparation_id VARCHAR(64) NOT NULL,
    review_id VARCHAR(64) NOT NULL,
    review_period_start DATETIME NOT NULL,
    review_period_end DATETIME NOT NULL,
    verified_from_db TINYINT(1) NOT NULL DEFAULT 0,
    
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cb_ex_in_prep (preparation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Expansion Scope Drafts
CREATE TABLE controlled_beta_expansion_scope_drafts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    preparation_id VARCHAR(64) NOT NULL,
    expansion_scope_status VARCHAR(64) NOT NULL DEFAULT 'DRAFT',
    
    -- Proposed limits
    proposed_cohort_id VARCHAR(64) NULL,
    proposed_tenant_ids JSON NULL,
    proposed_participant_roles JSON NULL,
    proposed_feature_set JSON NULL,
    proposed_max_participants INT NOT NULL DEFAULT 0,
    proposed_observation_period_days INT NOT NULL DEFAULT 14,
    
    -- Invariants explicitly restated in scope
    invite_only TINYINT(1) NOT NULL DEFAULT 1,
    cohort_scoped TINYINT(1) NOT NULL DEFAULT 1,
    tenant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    participant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    public_beta_enabled TINYINT(1) NOT NULL DEFAULT 0,
    open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
    auto_expansion_enabled TINYINT(1) NOT NULL DEFAULT 0,
    
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_cb_ex_sc_prep (preparation_id),
    INDEX idx_cb_ex_sc_stat (expansion_scope_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Capacity Assessments (Safe Limits)
CREATE TABLE controlled_beta_expansion_capacity_assessments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    preparation_id VARCHAR(64) NOT NULL,
    
    max_additional_participants INT NOT NULL DEFAULT 0,
    max_additional_tenants INT NOT NULL DEFAULT 0,
    max_additional_cohorts INT NOT NULL DEFAULT 0,
    
    allowed_feature_scope JSON NULL,
    allowed_tenant_scope JSON NULL,
    allowed_cohort_scope JSON NULL,
    allowed_participant_roles JSON NULL,
    
    expansion_rate_limit VARCHAR(128) NULL,
    support_capacity_limit VARCHAR(128) NULL,
    sla_capacity_limit VARCHAR(128) NULL,
    rollback_capacity_limit VARCHAR(128) NULL,
    risk_adjusted_limit VARCHAR(128) NULL,
    recommended_limit INT NOT NULL DEFAULT 0,
    limit_reasoning TEXT NULL,
    
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cb_ex_cap_prep (preparation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Candidate Segments
CREATE TABLE controlled_beta_expansion_candidate_segments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    preparation_id VARCHAR(64) NOT NULL,
    segment_name VARCHAR(128) NOT NULL,
    segment_criteria JSON NULL,
    
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cb_ex_seg_prep (preparation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Candidate Participants
CREATE TABLE controlled_beta_expansion_candidate_participants (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    preparation_id VARCHAR(64) NOT NULL,
    segment_id BIGINT NOT NULL,
    candidate_status VARCHAR(64) NOT NULL DEFAULT 'DRAFT',
    
    redacted_identifier VARCHAR(255) NULL,
    hashed_email VARCHAR(255) NULL,
    
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_cb_ex_cand_prep (preparation_id),
    INDEX idx_cb_ex_cand_seg (segment_id),
    INDEX idx_cb_ex_cand_stat (candidate_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Draft Invite Batches
CREATE TABLE controlled_beta_expansion_draft_invite_batches (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    preparation_id VARCHAR(64) NOT NULL,
    batch_name VARCHAR(128) NOT NULL,
    draft_invite_status VARCHAR(64) NOT NULL DEFAULT 'DRAFT',
    
    invite_sending_enabled TINYINT(1) NOT NULL DEFAULT 0,
    active_invite_creation_enabled TINYINT(1) NOT NULL DEFAULT 0,
    
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_cb_ex_dib_prep (preparation_id),
    INDEX idx_cb_ex_dib_stat (draft_invite_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Draft Invite Recipients
CREATE TABLE controlled_beta_expansion_draft_invite_recipients (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    batch_id BIGINT NOT NULL,
    candidate_id BIGINT NULL,
    draft_invite_status VARCHAR(64) NOT NULL DEFAULT 'DRAFT',
    
    redacted_contact VARCHAR(255) NULL,
    hashed_contact VARCHAR(255) NULL,
    
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_cb_ex_dir_batch (batch_id),
    INDEX idx_cb_ex_dir_stat (draft_invite_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Guardrail Checks
CREATE TABLE controlled_beta_expansion_guardrail_checks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    preparation_id VARCHAR(64) NOT NULL,
    check_name VARCHAR(128) NOT NULL,
    is_safe TINYINT(1) NOT NULL DEFAULT 0,
    check_message TEXT NULL,
    
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cb_ex_gr_prep (preparation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Preparation Findings
CREATE TABLE controlled_beta_expansion_preparation_findings (
    finding_id VARCHAR(64) PRIMARY KEY,
    preparation_id VARCHAR(64) NOT NULL,
    activation_id VARCHAR(64) NOT NULL,
    finding_severity VARCHAR(32) NOT NULL,
    finding_description TEXT NOT NULL,
    is_resolved TINYINT(1) NOT NULL DEFAULT 0,
    blocks_readiness TINYINT(1) NOT NULL DEFAULT 0,
    
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME NULL,
    
    INDEX idx_cb_ex_find_prep (preparation_id),
    INDEX idx_cb_ex_find_act (activation_id),
    INDEX idx_cb_ex_find_res (is_resolved)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Preparation Approvals
CREATE TABLE controlled_beta_expansion_preparation_approvals (
    approval_id VARCHAR(64) PRIMARY KEY,
    preparation_id VARCHAR(64) NOT NULL,
    approval_status VARCHAR(64) NOT NULL DEFAULT 'DRAFT',
    preparation_decision_status VARCHAR(64) NOT NULL DEFAULT 'DRAFT',
    
    approved_by VARCHAR(255) NULL,
    rejected_by VARCHAR(255) NULL,
    blocked_reason TEXT NULL,
    
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_cb_ex_app_prep (preparation_id),
    INDEX idx_cb_ex_app_stat (approval_status),
    INDEX idx_cb_ex_app_dec (preparation_decision_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Evidence Packs
CREATE TABLE controlled_beta_expansion_preparation_evidence_packs (
    pack_id VARCHAR(64) PRIMARY KEY,
    preparation_id VARCHAR(64) NOT NULL,
    evidence_schema_version VARCHAR(16) NOT NULL,
    evidence_payload JSON NOT NULL,
    evidence_integrity_hash VARCHAR(128) NOT NULL,
    
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cb_ex_ev_prep (preparation_id),
    INDEX idx_cb_ex_ev_hash (evidence_integrity_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Audits
CREATE TABLE controlled_beta_expansion_preparation_audits (
    audit_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    preparation_id VARCHAR(64) NOT NULL,
    action_type VARCHAR(64) NOT NULL,
    actor VARCHAR(255) NOT NULL,
    audit_details JSON NULL,
    
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cb_ex_aud_prep (preparation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Registry insert
INSERT INTO schema_versions (version, applied_at, description) 
VALUES ('080', NOW(), 'Phase 132: Controlled Invite-Only Expansion Preparation Gate');
