-- migrations/158_phase195e_auth_sessions_and_mfa.sql
-- Phase 195E: Server-side User Sessions and Real TOTP MFA

CREATE TABLE IF NOT EXISTS user_sessions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    role VARCHAR(64) NOT NULL,
    ip_address VARCHAR(64) NULL,
    user_agent TEXT NULL,
    status ENUM('ACTIVE', 'REVOKED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    last_activity_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME NULL,
    revoked_reason VARCHAR(255) NULL,
    INDEX idx_user_sessions_user_tenant (user_id, tenant_id),
    INDEX idx_user_sessions_status_exp (status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_mfa (
    user_id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    totp_secret_encrypted TEXT NOT NULL,
    is_confirmed TINYINT(1) NOT NULL DEFAULT 0,
    recovery_codes_json JSON NOT NULL,
    last_used_timestep BIGINT NOT NULL DEFAULT 0,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_mfa_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
