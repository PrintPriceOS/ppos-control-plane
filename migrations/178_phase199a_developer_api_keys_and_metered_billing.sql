-- Migration: 178_phase199a_developer_api_keys_and_metered_billing.sql
-- Purpose: Self-Service Developer Hub, Dual-Environment API Keys (pp_test_* / pp_live_*),
--          Granular Scopes, Rate Limiting, and Metered Billing Telemetry.

CREATE TABLE IF NOT EXISTS developer_api_keys (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    key_name VARCHAR(128) NOT NULL,
    key_type ENUM('TEST', 'LIVE') NOT NULL DEFAULT 'TEST',
    key_prefix VARCHAR(24) NOT NULL,
    hashed_key VARCHAR(128) NOT NULL,
    scopes_json JSON NOT NULL,
    rate_limit_per_minute INT NOT NULL DEFAULT 60,
    monthly_quota INT NOT NULL DEFAULT 1000,
    usage_current_month INT NOT NULL DEFAULT 0,
    billing_tier VARCHAR(32) NOT NULL DEFAULT 'SANDBOX_FREE',
    stripe_customer_id VARCHAR(128) NULL,
    status ENUM('ACTIVE', 'REVOKED', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    last_used_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_dev_api_keys_tenant (tenant_id),
    INDEX idx_dev_api_keys_hashed (hashed_key),
    INDEX idx_dev_api_keys_status (status)
);

CREATE TABLE IF NOT EXISTS developer_api_usage_logs (
    id VARCHAR(64) PRIMARY KEY,
    api_key_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    http_method VARCHAR(16) NOT NULL,
    status_code INT NOT NULL,
    duration_ms INT NOT NULL DEFAULT 0,
    billable_units DECIMAL(10, 4) NOT NULL DEFAULT 0.0000,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_dev_usage_key (api_key_id),
    INDEX idx_dev_usage_tenant_created (tenant_id, created_at)
);

