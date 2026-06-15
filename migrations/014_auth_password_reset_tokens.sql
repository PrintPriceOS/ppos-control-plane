-- =============================================================================
-- Migration 014: password_reset_tokens — Auth Identity Suite
-- Phase Auth v2 — Forgot Password Flow
-- =============================================================================

-- Stores hashed (SHA-256) reset tokens. Raw token is NEVER stored.
-- Tokens expire in 1 hour and are single-use (used=1 after redemption).

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     VARCHAR(128) NOT NULL,
    token_hash  VARCHAR(64)  NOT NULL  COMMENT 'SHA-256 hash of the raw token sent by email',
    expires_at  DATETIME     NOT NULL,
    used        TINYINT(1)   NOT NULL DEFAULT 0,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uq_user_id (user_id),
    KEY idx_token_hash (token_hash),
    KEY idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Single-use password reset tokens (hashed) for the Auth Identity Suite';

-- Cleanup job: purge expired tokens older than 24h (run via cron or scheduler)
-- DELETE FROM password_reset_tokens WHERE expires_at < NOW() - INTERVAL 1 DAY;
