-- migrations/057_phase115_pre_production_operational_readiness_board.sql
-- Phase 115 - Pre-Production Operational Readiness Board
-- Review-only / sign-off workflow. No production activation is enabled by this migration.

CREATE TABLE IF NOT EXISTS pre_production_readiness_boards (
    id INT AUTO_INCREMENT PRIMARY KEY,

    board_id VARCHAR(100) NOT NULL UNIQUE,
    dry_run_reference_id VARCHAR(100) NOT NULL,
    requested_by VARCHAR(100) NOT NULL,

    status ENUM(
        'DRAFT',
        'IN_REVIEW',
        'CHANGES_REQUIRED',
        'READY_FOR_SIGN_OFF',
        'SIGNED_OFF_FOR_CONTROLLED_PRODUCTION_REVIEW',
        'REJECTED'
    ) NOT NULL DEFAULT 'DRAFT',

    review_only BOOLEAN NOT NULL DEFAULT TRUE,
    production_activation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    full_public_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    live_provider_connectivity_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    payment_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    refund_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    payout_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    external_submission_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    source_mutation_enabled BOOLEAN NOT NULL DEFAULT FALSE,

    departments_json JSON NULL,
    findings_summary_json JSON NULL,
    evidence_pack_json JSON NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    signed_off_at TIMESTAMP NULL,

    INDEX idx_pprb_board_id (board_id),
    INDEX idx_pprb_dry_run_reference_id (dry_run_reference_id),
    INDEX idx_pprb_status (status),
    INDEX idx_pprb_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS pre_production_readiness_board_reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,

    review_id VARCHAR(100) NOT NULL UNIQUE,
    board_id VARCHAR(100) NOT NULL,
    department ENUM(
        'OPERATIONS',
        'FINANCE',
        'TECHNICAL',
        'COMPLIANCE',
        'SECURITY',
        'CUSTOMER_SUPPORT',
        'PRINT_PARTNER_SUCCESS'
    ) NOT NULL,

    reviewer VARCHAR(100) NOT NULL,
    status ENUM('PENDING', 'APPROVED', 'CHANGES_REQUIRED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    notes TEXT NULL,
    review_only BOOLEAN NOT NULL DEFAULT TRUE,

    submitted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_pprbr_board_id (board_id),
    INDEX idx_pprbr_department (department),
    INDEX idx_pprbr_status (status)
);

CREATE TABLE IF NOT EXISTS pre_production_readiness_board_findings (
    id INT AUTO_INCREMENT PRIMARY KEY,

    finding_id VARCHAR(100) NOT NULL UNIQUE,
    board_id VARCHAR(100) NOT NULL,
    department ENUM(
        'OPERATIONS',
        'FINANCE',
        'TECHNICAL',
        'COMPLIANCE',
        'SECURITY',
        'CUSTOMER_SUPPORT',
        'PRINT_PARTNER_SUCCESS'
    ) NOT NULL,

    severity ENUM('BLOCKER', 'MAJOR', 'MINOR', 'INFO') NOT NULL DEFAULT 'MAJOR',
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    resolution TEXT NULL,

    status ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'WONT_FIX') NOT NULL DEFAULT 'OPEN',
    raised_by VARCHAR(100) NOT NULL,
    resolved_by VARCHAR(100) NULL,

    review_only BOOLEAN NOT NULL DEFAULT TRUE,
    blocks_sign_off BOOLEAN NOT NULL DEFAULT TRUE,

    raised_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_pprbf_board_id (board_id),
    INDEX idx_pprbf_status (status),
    INDEX idx_pprbf_severity (severity)
);

CREATE TABLE IF NOT EXISTS pre_production_readiness_board_audits (
    id INT AUTO_INCREMENT PRIMARY KEY,

    audit_id VARCHAR(100) NOT NULL UNIQUE,
    board_id VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    actor VARCHAR(100) NOT NULL,
    department VARCHAR(100) NULL,
    details_json JSON NULL,
    review_only BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_pprbaud_board_id (board_id),
    INDEX idx_pprbaud_event_type (event_type),
    INDEX idx_pprbaud_created_at (created_at)
);
