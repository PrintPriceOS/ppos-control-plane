-- Phase 134: Controlled Invite Acceptance / Participant Onboarding Gate
-- IDEMPOTENT SCHEMA MIGRATION

CREATE TABLE IF NOT EXISTS controlled_beta_invite_acceptance_gates (
    acceptance_gate_id VARCHAR(64) PRIMARY KEY,
    invite_record_id VARCHAR(64) NOT NULL,
    issuance_gate_id VARCHAR(64) NOT NULL,
    issuance_batch_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    cohort_id VARCHAR(64) NOT NULL,
    participant_id VARCHAR(64) NULL,
    gate_status VARCHAR(64) NOT NULL DEFAULT 'DRAFT',
    readiness_status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
    invite_status_at_claim VARCHAR(64) NULL,
    terms_required TINYINT(1) NOT NULL DEFAULT 1,
    terms_accepted TINYINT(1) NOT NULL DEFAULT 0,
    identity_bound TINYINT(1) NOT NULL DEFAULT 0,
    onboarding_approved TINYINT(1) NOT NULL DEFAULT 0,
    runtime_access_eligible TINYINT(1) NOT NULL DEFAULT 0,
    runtime_access_granted TINYINT(1) NOT NULL DEFAULT 0,
    manual_approval_required TINYINT(1) NOT NULL DEFAULT 1,
    auto_onboarding_enabled TINYINT(1) NOT NULL DEFAULT 0,
    full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
    open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_signup_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_beta_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0,
    kill_switch_active TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    approved_at DATETIME NULL,
    approved_by VARCHAR(255) NULL,
    blocked_at DATETIME NULL,
    blocked_by VARCHAR(255) NULL,
    blocked_reasons_json JSON NULL,
    INDEX idx_cbiag_invite (invite_record_id),
    INDEX idx_cbiag_iss_gate (issuance_gate_id),
    INDEX idx_cbiag_iss_batch (issuance_batch_id),
    INDEX idx_cbiag_tenant (tenant_id),
    INDEX idx_cbiag_cohort (cohort_id),
    INDEX idx_cbiag_part (participant_id),
    INDEX idx_cbiag_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_invite_acceptance_claims (
    claim_id VARCHAR(64) PRIMARY KEY,
    acceptance_gate_id VARCHAR(64) NOT NULL,
    invite_record_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    cohort_id VARCHAR(64) NOT NULL,
    invite_code_hash VARCHAR(255) NOT NULL,
    invite_token_hash VARCHAR(255) NOT NULL,
    claim_status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
    claim_attempt_hash VARCHAR(255) NOT NULL,
    claimed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    claim_ip_hash VARCHAR(255) NOT NULL,
    user_agent_hash VARCHAR(255) NOT NULL,
    rejection_reason VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbiac_gate (acceptance_gate_id),
    INDEX idx_cbiac_invite (invite_record_id),
    INDEX idx_cbiac_tenant (tenant_id),
    INDEX idx_cbiac_cohort (cohort_id),
    INDEX idx_cbiac_status (claim_status),
    INDEX idx_cbiac_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_onboarding_participants (
    participant_id VARCHAR(64) PRIMARY KEY,
    acceptance_gate_id VARCHAR(64) NOT NULL,
    invite_record_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    cohort_id VARCHAR(64) NOT NULL,
    participant_external_ref_hash VARCHAR(255) NOT NULL,
    participant_email_hash VARCHAR(255) NOT NULL,
    participant_label VARCHAR(255) NOT NULL,
    participant_status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
    role_key VARCHAR(64) NOT NULL,
    scope_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cbop_gate (acceptance_gate_id),
    INDEX idx_cbop_invite (invite_record_id),
    INDEX idx_cbop_tenant (tenant_id),
    INDEX idx_cbop_cohort (cohort_id),
    INDEX idx_cbop_status (participant_status),
    INDEX idx_cbop_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_onboarding_terms_acceptance (
    terms_acceptance_id VARCHAR(64) PRIMARY KEY,
    acceptance_gate_id VARCHAR(64) NOT NULL,
    participant_id VARCHAR(64) NOT NULL,
    terms_version VARCHAR(32) NOT NULL,
    terms_hash VARCHAR(255) NOT NULL,
    accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accepted_by_hash VARCHAR(255) NOT NULL,
    acceptance_method VARCHAR(64) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbota_gate (acceptance_gate_id),
    INDEX idx_cbota_part (participant_id),
    INDEX idx_cbota_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_onboarding_session_limits (
    session_limit_id VARCHAR(64) PRIMARY KEY,
    acceptance_gate_id VARCHAR(64) NOT NULL,
    participant_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    cohort_id VARCHAR(64) NOT NULL,
    max_sessions INT NOT NULL DEFAULT 1,
    max_concurrent_sessions INT NOT NULL DEFAULT 1,
    session_ttl_minutes INT NOT NULL DEFAULT 60,
    daily_action_limit INT NOT NULL DEFAULT 100,
    feature_scope_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cbosl_gate (acceptance_gate_id),
    INDEX idx_cbosl_part (participant_id),
    INDEX idx_cbosl_tenant (tenant_id),
    INDEX idx_cbosl_cohort (cohort_id),
    INDEX idx_cbosl_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_onboarding_access_policies (
    access_policy_id VARCHAR(64) PRIMARY KEY,
    acceptance_gate_id VARCHAR(64) NOT NULL,
    participant_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    cohort_id VARCHAR(64) NOT NULL,
    policy_status VARCHAR(64) NOT NULL DEFAULT 'ACTIVE',
    allowed_features_json JSON NULL,
    denied_features_json JSON NULL,
    runtime_scope_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cboap_gate (acceptance_gate_id),
    INDEX idx_cboap_part (participant_id),
    INDEX idx_cboap_tenant (tenant_id),
    INDEX idx_cboap_cohort (cohort_id),
    INDEX idx_cboap_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_onboarding_guardrail_checks (
    check_id VARCHAR(64) PRIMARY KEY,
    acceptance_gate_id VARCHAR(64) NOT NULL,
    check_key VARCHAR(128) NOT NULL,
    check_status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
    severity VARCHAR(64) NOT NULL DEFAULT 'BLOCKER',
    details_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbogc_gate (acceptance_gate_id),
    INDEX idx_cbogc_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_onboarding_findings (
    finding_id VARCHAR(64) PRIMARY KEY,
    acceptance_gate_id VARCHAR(64) NOT NULL,
    severity VARCHAR(64) NOT NULL DEFAULT 'BLOCKER',
    finding_key VARCHAR(128) NOT NULL,
    finding_status VARCHAR(64) NOT NULL DEFAULT 'OPEN',
    details_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME NULL,
    resolved_by VARCHAR(255) NULL,
    INDEX idx_cbof_gate (acceptance_gate_id),
    INDEX idx_cbof_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_onboarding_approvals (
    approval_id VARCHAR(64) PRIMARY KEY,
    acceptance_gate_id VARCHAR(64) NOT NULL,
    approval_status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
    requested_by VARCHAR(255) NOT NULL,
    approved_by VARCHAR(255) NULL,
    rejected_by VARCHAR(255) NULL,
    approval_notes TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at DATETIME NULL,
    INDEX idx_cboa_gate (acceptance_gate_id),
    INDEX idx_cboa_status (approval_status),
    INDEX idx_cboa_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_onboarding_evidence_packs (
    evidence_pack_id VARCHAR(64) PRIMARY KEY,
    acceptance_gate_id VARCHAR(64) NOT NULL,
    evidence_schema_version VARCHAR(32) NOT NULL,
    evidence_data_json JSON NOT NULL,
    evidence_integrity_hash VARCHAR(128) NOT NULL,
    redaction_status VARCHAR(64) NOT NULL DEFAULT 'REDACTED',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cboep_gate (acceptance_gate_id),
    INDEX idx_cboep_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_onboarding_audits (
    audit_id VARCHAR(64) PRIMARY KEY,
    acceptance_gate_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    details_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cboaud_gate (acceptance_gate_id),
    INDEX idx_cboaud_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Registry insert
INSERT INTO schema_versions (version, applied_at, description)
VALUES ('082', NOW(), 'Phase 134: Controlled Invite Acceptance / Participant Onboarding Gate')
ON DUPLICATE KEY UPDATE applied_at = NOW(), description = 'Phase 134: Controlled Invite Acceptance / Participant Onboarding Gate';
