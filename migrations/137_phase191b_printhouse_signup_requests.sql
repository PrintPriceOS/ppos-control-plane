-- migrations/137_phase191b_printhouse_signup_requests.sql
-- Phase 191B — Minimal Email Signup and Secure Activation Infrastructure
-- Additive migration for pending signup request and activation token lifecycle.

CREATE TABLE IF NOT EXISTS printhouse_signup_requests (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    email_normalized VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL DEFAULT 'EMAIL',
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING', -- PENDING, CONSUMING, ACTIVATED, EXPIRED, REVOKED, BLOCKED
    activation_token_hash VARCHAR(64) NOT NULL,
    activation_expires_at DATETIME NOT NULL,
    activation_consumed_at DATETIME NULL,
    activation_requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    send_count INT NOT NULL DEFAULT 1,
    failed_attempt_count INT NOT NULL DEFAULT 0,
    tenant_id VARCHAR(64) NULL,
    printhouse_id VARCHAR(64) NULL,
    control_user_id VARCHAR(64) NULL,
    metadata_json LONGTEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ph_signup_email_norm (email_normalized),
    INDEX idx_ph_signup_token_hash (activation_token_hash),
    INDEX idx_ph_signup_status (status),
    INDEX idx_ph_signup_expires (activation_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
