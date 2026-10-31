-- migrations/058_phase116_production_deployment_readiness_checklist.sql
-- Phase 116 - Production Deployment Readiness Checklist
-- Checklist-only. No deployment, no production activation, no provider connectivity.

CREATE TABLE IF NOT EXISTS production_deployment_readiness_checks (
    id INT AUTO_INCREMENT PRIMARY KEY,

    check_id VARCHAR(100) NOT NULL UNIQUE,
    board_reference_id VARCHAR(100) NULL,
    requested_by VARCHAR(100) NOT NULL,

    status ENUM(
        'PENDING',
        'IN_PROGRESS',
        'READY',
        'BLOCKED',
        'COMPLETED'
    ) NOT NULL DEFAULT 'PENDING',

    checklist_only BOOLEAN NOT NULL DEFAULT TRUE,
    deployment_executed BOOLEAN NOT NULL DEFAULT FALSE,
    production_activation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    full_public_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    live_provider_connectivity_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    payment_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    refund_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    payout_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    external_submission_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    source_mutation_enabled BOOLEAN NOT NULL DEFAULT FALSE,

    environment_check_json JSON NULL,
    migration_check_json JSON NULL,
    backup_check_json JSON NULL,
    secrets_check_json JSON NULL,
    observability_check_json JSON NULL,
    rollback_check_json JSON NULL,
    support_check_json JSON NULL,
    evidence_pack_json JSON NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,

    INDEX idx_pdrc_check_id (check_id),
    INDEX idx_pdrc_board_reference_id (board_reference_id),
    INDEX idx_pdrc_status (status),
    INDEX idx_pdrc_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS production_deployment_readiness_results (
    id INT AUTO_INCREMENT PRIMARY KEY,

    result_id VARCHAR(100) NOT NULL UNIQUE,
    check_id VARCHAR(100) NOT NULL,
    check_category ENUM(
        'ENVIRONMENT',
        'MIGRATIONS',
        'BACKUP',
        'SECRETS',
        'OBSERVABILITY',
        'ROLLBACK',
        'SUPPORT',
        'FEATURE_FLAGS'
    ) NOT NULL,
    check_name VARCHAR(200) NOT NULL,
    status ENUM('PASS', 'FAIL', 'WARN', 'SKIP') NOT NULL DEFAULT 'SKIP',
    details TEXT NULL,
    checklist_only BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_pdrr_check_id (check_id),
    INDEX idx_pdrr_category (check_category),
    INDEX idx_pdrr_status (status)
);

CREATE TABLE IF NOT EXISTS production_deployment_readiness_findings (
    id INT AUTO_INCREMENT PRIMARY KEY,

    finding_id VARCHAR(100) NOT NULL UNIQUE,
    check_id VARCHAR(100) NOT NULL,
    severity ENUM('BLOCKER', 'MAJOR', 'MINOR', 'INFO') NOT NULL DEFAULT 'MAJOR',
    category VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    raised_by VARCHAR(100) NOT NULL,
    status ENUM('OPEN', 'RESOLVED', 'WONT_FIX') NOT NULL DEFAULT 'OPEN',
    resolution_notes TEXT NULL,
    resolved_by VARCHAR(100) NULL,
    resolved_at TIMESTAMP NULL,
    blocks_deployment BOOLEAN NOT NULL DEFAULT TRUE,
    checklist_only BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_pdrf_check_id (check_id),
    INDEX idx_pdrf_severity (severity),
    INDEX idx_pdrf_status (status)
);

CREATE TABLE IF NOT EXISTS production_deployment_readiness_audits (
    id INT AUTO_INCREMENT PRIMARY KEY,

    audit_id VARCHAR(100) NOT NULL UNIQUE,
    check_id VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    actor VARCHAR(100) NOT NULL DEFAULT 'system',
    category VARCHAR(100) NULL,
    details_json JSON NULL,
    checklist_only BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_pdra_check_id (check_id),
    INDEX idx_pdra_event_type (event_type),
    INDEX idx_pdra_created_at (created_at)
);
