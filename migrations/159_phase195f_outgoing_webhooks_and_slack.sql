-- migrations/159_phase195f_outgoing_webhooks_and_slack.sql
-- Phase 195F: Signed Outgoing Webhooks and Slack Integrations

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    url VARCHAR(1024) NOT NULL,
    secret VARCHAR(255) NOT NULL,
    events_json JSON NOT NULL,
    status ENUM('ACTIVE', 'PAUSED', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_webhook_sub_tenant (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    subscription_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_id VARCHAR(64) NOT NULL,
    payload_json JSON NOT NULL,
    signature VARCHAR(128) NOT NULL,
    status ENUM('PENDING', 'DELIVERED', 'FAILED', 'EXHAUSTED') NOT NULL DEFAULT 'PENDING',
    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    next_retry_at DATETIME NULL,
    last_status_code INT NULL,
    last_error TEXT NULL,
    delivered_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_webhook_del_tenant_status (tenant_id, status),
    INDEX idx_webhook_del_retry (status, next_retry_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS slack_integrations (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL UNIQUE,
    webhook_url TEXT NOT NULL,
    channel_name VARCHAR(100) NOT NULL DEFAULT '#general',
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    events_json JSON NOT NULL,
    last_test_at DATETIME NULL,
    last_test_status VARCHAR(50) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_slack_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
