-- Migration 179: Phase 199B — Stripe Hybrid Flat-Rate (€49/mo) + Metered Usage Billing & Spend Cap Governance

CREATE TABLE IF NOT EXISTS developer_billing_subscriptions (
    tenant_id VARCHAR(128) NOT NULL PRIMARY KEY,
    billing_tier ENUM('SANDBOX_FREE', 'PRODUCTION_SCALE', 'ENTERPRISE_TENANT') NOT NULL DEFAULT 'SANDBOX_FREE',
    status ENUM('ACTIVE', 'PAST_DUE', 'CANCELED', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    stripe_customer_id VARCHAR(128) NULL,
    stripe_subscription_id VARCHAR(128) NULL,
    monthly_spend_cap_eur DECIMAL(10, 2) NOT NULL DEFAULT 150.00,
    alert_email VARCHAR(255) NULL,
    last_invoice_id VARCHAR(128) NULL,
    current_period_end TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_dev_billing_customer (stripe_customer_id),
    INDEX idx_dev_billing_subscription (stripe_subscription_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS developer_stripe_meter_events (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    idempotency_key VARCHAR(128) NOT NULL,
    tenant_id VARCHAR(128) NOT NULL,
    api_key_id VARCHAR(64) NULL,
    stripe_customer_id VARCHAR(128) NULL,
    event_name ENUM('preflight_2gb_inspection', 'bpe_pricing_quote') NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price_eur DECIMAL(10, 4) NOT NULL DEFAULT 0.0000,
    stripe_synced TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_dev_meter_idempotency (idempotency_key),
    INDEX idx_dev_meter_tenant_created (tenant_id, created_at),
    INDEX idx_dev_meter_customer (stripe_customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

