-- Phase 135: Controlled Runtime Access Session Gate
-- IDEMPOTENT SCHEMA MIGRATION

CREATE TABLE IF NOT EXISTS controlled_beta_runtime_session_gates (
    session_gate_id VARCHAR(64) PRIMARY KEY,
    acceptance_gate_id VARCHAR(64) NOT NULL,
    participant_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    cohort_id VARCHAR(64) NOT NULL,
    gate_status VARCHAR(64) NOT NULL DEFAULT 'DRAFT',
    readiness_status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
    runtime_access_eligible TINYINT(1) NOT NULL DEFAULT 0,
    runtime_access_granted TINYINT(1) NOT NULL DEFAULT 0,
    manual_approval_required TINYINT(1) NOT NULL DEFAULT 1,
    session_creation_enabled TINYINT(1) NOT NULL DEFAULT 0,
    auto_session_creation_enabled TINYINT(1) NOT NULL DEFAULT 0,
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
    INDEX idx_cbrsg_acceptance (acceptance_gate_id),
    INDEX idx_cbrsg_part (participant_id),
    INDEX idx_cbrsg_tenant (tenant_id),
    INDEX idx_cbrsg_cohort (cohort_id),
    INDEX idx_cbrsg_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_runtime_sessions (
    runtime_session_id VARCHAR(64) PRIMARY KEY,
    session_gate_id VARCHAR(64) NOT NULL,
    acceptance_gate_id VARCHAR(64) NOT NULL,
    participant_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    cohort_id VARCHAR(64) NOT NULL,
    session_status VARCHAR(64) NOT NULL DEFAULT 'ACTIVE',
    session_token_hash VARCHAR(255) NOT NULL,
    session_scope_json JSON NULL,
    allowed_features_json JSON NULL,
    denied_features_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_heartbeat_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    closed_at DATETIME NULL,
    closed_by VARCHAR(255) NULL,
    closure_reason VARCHAR(255) NULL,
    revoked_at DATETIME NULL,
    revoked_by VARCHAR(255) NULL,
    revoke_reason VARCHAR(255) NULL,
    INDEX idx_cbrs_gate (session_gate_id),
    INDEX idx_cbrs_acceptance (acceptance_gate_id),
    INDEX idx_cbrs_part (participant_id),
    INDEX idx_cbrs_tenant (tenant_id),
    INDEX idx_cbrs_cohort (cohort_id),
    INDEX idx_cbrs_status (session_status),
    INDEX idx_cbrs_expires (expires_at),
    INDEX idx_cbrs_heartbeat (last_heartbeat_at),
    INDEX idx_cbrs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_runtime_session_limits (
    runtime_session_limit_id VARCHAR(64) PRIMARY KEY,
    session_gate_id VARCHAR(64) NOT NULL,
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
    INDEX idx_cbrsl_gate (session_gate_id),
    INDEX idx_cbrsl_part (participant_id),
    INDEX idx_cbrsl_tenant (tenant_id),
    INDEX idx_cbrsl_cohort (cohort_id),
    INDEX idx_cbrsl_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_runtime_session_feature_access (
    feature_access_id VARCHAR(64) PRIMARY KEY,
    runtime_session_id VARCHAR(64) NOT NULL,
    session_gate_id VARCHAR(64) NOT NULL,
    participant_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    cohort_id VARCHAR(64) NOT NULL,
    feature_key VARCHAR(128) NOT NULL,
    access_status VARCHAR(64) NOT NULL DEFAULT 'DENIED',
    access_reason VARCHAR(255) NULL,
    evaluated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    details_json JSON NULL,
    INDEX idx_cbrsfa_session (runtime_session_id),
    INDEX idx_cbrsfa_gate (session_gate_id),
    INDEX idx_cbrsfa_part (participant_id),
    INDEX idx_cbrsfa_tenant (tenant_id),
    INDEX idx_cbrsfa_cohort (cohort_id),
    INDEX idx_cbrsfa_feature (feature_key),
    INDEX idx_cbrsfa_evaluated (evaluated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_runtime_session_heartbeats (
    heartbeat_id VARCHAR(64) PRIMARY KEY,
    runtime_session_id VARCHAR(64) NOT NULL,
    session_gate_id VARCHAR(64) NOT NULL,
    participant_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    cohort_id VARCHAR(64) NOT NULL,
    heartbeat_status VARCHAR(64) NOT NULL DEFAULT 'OK',
    observed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata_json JSON NULL,
    INDEX idx_cbrsh_session (runtime_session_id),
    INDEX idx_cbrsh_gate (session_gate_id),
    INDEX idx_cbrsh_part (participant_id),
    INDEX idx_cbrsh_tenant (tenant_id),
    INDEX idx_cbrsh_cohort (cohort_id),
    INDEX idx_cbrsh_observed (observed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_runtime_session_events (
    event_id VARCHAR(64) PRIMARY KEY,
    runtime_session_id VARCHAR(64) NOT NULL,
    session_gate_id VARCHAR(64) NOT NULL,
    participant_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    cohort_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    event_status VARCHAR(64) NOT NULL,
    feature_key VARCHAR(128) NULL,
    details_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbrse_session (runtime_session_id),
    INDEX idx_cbrse_gate (session_gate_id),
    INDEX idx_cbrse_part (participant_id),
    INDEX idx_cbrse_tenant (tenant_id),
    INDEX idx_cbrse_cohort (cohort_id),
    INDEX idx_cbrse_feature (feature_key),
    INDEX idx_cbrse_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_runtime_session_guardrail_checks (
    check_id VARCHAR(64) PRIMARY KEY,
    session_gate_id VARCHAR(64) NOT NULL,
    check_key VARCHAR(128) NOT NULL,
    check_status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
    severity VARCHAR(64) NOT NULL DEFAULT 'BLOCKER',
    details_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbrsgc_gate (session_gate_id),
    INDEX idx_cbrsgc_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_runtime_session_findings (
    finding_id VARCHAR(64) PRIMARY KEY,
    session_gate_id VARCHAR(64) NOT NULL,
    severity VARCHAR(64) NOT NULL DEFAULT 'BLOCKER',
    finding_key VARCHAR(128) NOT NULL,
    finding_status VARCHAR(64) NOT NULL DEFAULT 'OPEN',
    details_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME NULL,
    resolved_by VARCHAR(255) NULL,
    INDEX idx_cbrsf_gate (session_gate_id),
    INDEX idx_cbrsf_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_runtime_session_approvals (
    approval_id VARCHAR(64) PRIMARY KEY,
    session_gate_id VARCHAR(64) NOT NULL,
    approval_status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
    requested_by VARCHAR(255) NOT NULL,
    approved_by VARCHAR(255) NULL,
    rejected_by VARCHAR(255) NULL,
    approval_notes TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at DATETIME NULL,
    INDEX idx_cbrsa_gate (session_gate_id),
    INDEX idx_cbrsa_status (approval_status),
    INDEX idx_cbrsa_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_runtime_session_evidence_packs (
    evidence_pack_id VARCHAR(64) PRIMARY KEY,
    session_gate_id VARCHAR(64) NOT NULL,
    evidence_schema_version VARCHAR(32) NOT NULL,
    evidence_data_json JSON NOT NULL,
    evidence_integrity_hash VARCHAR(128) NOT NULL,
    redaction_status VARCHAR(64) NOT NULL DEFAULT 'REDACTED',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbrsep_gate (session_gate_id),
    INDEX idx_cbrsep_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_beta_runtime_session_audits (
    audit_id VARCHAR(64) PRIMARY KEY,
    session_gate_id VARCHAR(64) NOT NULL,
    runtime_session_id VARCHAR(64) NULL,
    event_type VARCHAR(128) NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    details_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cbrsaud_gate (session_gate_id),
    INDEX idx_cbrsaud_session (runtime_session_id),
    INDEX idx_cbrsaud_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Registry insert
INSERT INTO schema_versions (version, applied_at, description)
VALUES ('083', NOW(), 'Phase 135: Controlled Runtime Access Session Gate')
ON DUPLICATE KEY UPDATE applied_at = NOW(), description = 'Phase 135: Controlled Runtime Access Session Gate';
