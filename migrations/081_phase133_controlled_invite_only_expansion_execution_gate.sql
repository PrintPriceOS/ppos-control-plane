-- Phase 133: Controlled Invite-Only Expansion Execution Gate
-- IDEMPOTENT SCHEMA MIGRATION

CREATE TABLE IF NOT EXISTS controlled_beta_invite_issuance_gates (
    issuance_gate_id VARCHAR(64) PRIMARY KEY,
    preparation_id VARCHAR(64) NOT NULL,
    phase132_evidence_pack_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    cohort_id VARCHAR(64) NOT NULL,
    gate_status VARCHAR(64) NOT NULL DEFAULT 'DRAFT',
    readiness_status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
    max_invites_allowed INT NOT NULL DEFAULT 0,
    max_invites_to_issue INT NOT NULL DEFAULT 0,
    invites_issued_count INT NOT NULL DEFAULT 0,
    invite_acceptance_deadline DATETIME NULL,
    invite_validity_hours INT NOT NULL DEFAULT 24,
    manual_approval_required TINYINT(1) NOT NULL DEFAULT 1,
    auto_issue_enabled TINYINT(1) NOT NULL DEFAULT 0,
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
    INDEX idx_cbiig_prep (preparation_id),
    INDEX idx_cbiig_tenant (tenant_id),
    INDEX idx_cbiig_cohort (cohort_id),
    INDEX idx_cbiig_status (gate_status),
    INDEX idx_cbiig_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_invite_issuance_batches (
    issuance_batch_id VARCHAR(64) PRIMARY KEY,
    issuance_gate_id VARCHAR(64) NOT NULL,
    preparation_id VARCHAR(64) NOT NULL,
    draft_invite_batch_id VARCHAR(64) NULL,
    tenant_id VARCHAR(64) NOT NULL,
    cohort_id VARCHAR(64) NOT NULL,
    batch_status VARCHAR(64) NOT NULL DEFAULT 'DRAFT',
    requested_invite_count INT NOT NULL DEFAULT 0,
    approved_invite_count INT NOT NULL DEFAULT 0,
    issued_invite_count INT NOT NULL DEFAULT 0,
    revoked_invite_count INT NOT NULL DEFAULT 0,
    invite_validity_hours INT NOT NULL DEFAULT 24,
    approval_status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cbiib_gate (issuance_gate_id),
    INDEX idx_cbiib_prep (preparation_id),
    INDEX idx_cbiib_tenant (tenant_id),
    INDEX idx_cbiib_cohort (cohort_id),
    INDEX idx_cbiib_status (batch_status),
    INDEX idx_cbiib_app_status (approval_status),
    INDEX idx_cbiib_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_invite_issuance_recipients (
    issuance_recipient_id VARCHAR(64) PRIMARY KEY,
    issuance_batch_id VARCHAR(64) NOT NULL,
    candidate_participant_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    cohort_id VARCHAR(64) NOT NULL,
    recipient_email_hash VARCHAR(255) NOT NULL,
    recipient_label VARCHAR(255) NOT NULL,
    recipient_status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
    invite_scope_json JSON NULL,
    invite_constraints_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cbiir_batch (issuance_batch_id),
    INDEX idx_cbiir_candidate (candidate_participant_id),
    INDEX idx_cbiir_tenant (tenant_id),
    INDEX idx_cbiir_cohort (cohort_id),
    INDEX idx_cbiir_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_invite_issuance_records (
    invite_record_id VARCHAR(64) PRIMARY KEY,
    issuance_gate_id VARCHAR(64) NOT NULL,
    issuance_batch_id VARCHAR(64) NOT NULL,
    issuance_recipient_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    cohort_id VARCHAR(64) NOT NULL,
    invite_code_hash VARCHAR(255) NOT NULL,
    invite_token_hash VARCHAR(255) NOT NULL,
    invite_status VARCHAR(64) NOT NULL DEFAULT 'ISSUED',
    issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    revoked_by VARCHAR(255) NULL,
    revoke_reason TEXT NULL,
    accepted_at DATETIME NULL,
    accepted_participant_id VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cbiirec_gate (issuance_gate_id),
    INDEX idx_cbiirec_batch (issuance_batch_id),
    INDEX idx_cbiirec_recip (issuance_recipient_id),
    INDEX idx_cbiirec_tenant (tenant_id),
    INDEX idx_cbiirec_cohort (cohort_id),
    INDEX idx_cbiirec_status (invite_status),
    INDEX idx_cbiirec_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_invite_issuance_guardrail_checks (
    check_id VARCHAR(64) PRIMARY KEY,
    issuance_gate_id VARCHAR(64) NOT NULL,
    check_key VARCHAR(128) NOT NULL,
    check_status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
    severity VARCHAR(64) NOT NULL DEFAULT 'BLOCKER',
    details_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbiigc_gate (issuance_gate_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_invite_issuance_findings (
    finding_id VARCHAR(64) PRIMARY KEY,
    issuance_gate_id VARCHAR(64) NOT NULL,
    severity VARCHAR(64) NOT NULL DEFAULT 'BLOCKER',
    finding_key VARCHAR(128) NOT NULL,
    finding_status VARCHAR(64) NOT NULL DEFAULT 'OPEN',
    details_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME NULL,
    resolved_by VARCHAR(255) NULL,
    INDEX idx_cbiif_gate (issuance_gate_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_invite_issuance_approvals (
    approval_id VARCHAR(64) PRIMARY KEY,
    issuance_gate_id VARCHAR(64) NOT NULL,
    approval_status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
    requested_by VARCHAR(255) NOT NULL,
    approved_by VARCHAR(255) NULL,
    rejected_by VARCHAR(255) NULL,
    approval_notes TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at DATETIME NULL,
    INDEX idx_cbiia_gate (issuance_gate_id),
    INDEX idx_cbiia_status (approval_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_invite_issuance_evidence_packs (
    evidence_pack_id VARCHAR(64) PRIMARY KEY,
    issuance_gate_id VARCHAR(64) NOT NULL,
    evidence_schema_version VARCHAR(32) NOT NULL,
    evidence_data_json JSON NOT NULL,
    evidence_integrity_hash VARCHAR(128) NOT NULL,
    redaction_status VARCHAR(64) NOT NULL DEFAULT 'REDACTED',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbiiep_gate (issuance_gate_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_invite_issuance_audits (
    audit_id VARCHAR(64) PRIMARY KEY,
    issuance_gate_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    details_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbiiaud_gate (issuance_gate_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Registry insert
INSERT INTO schema_versions (version, applied_at, description)
VALUES ('081', NOW(), 'Phase 133: Controlled Invite-Only Expansion Execution / Invite Issuance Gate')
ON DUPLICATE KEY UPDATE applied_at = NOW(), description = 'Phase 133: Controlled Invite-Only Expansion Execution / Invite Issuance Gate';
