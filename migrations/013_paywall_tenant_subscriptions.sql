-- =============================================================================
-- Migration 013: tenant_subscriptions — Stripe Paywall Integration
-- Phase Paywall — SubscriptionGuard Backend
-- =============================================================================

-- tenant_subscriptions: Canonical table linking each tenant to a Stripe plan.
-- This table is the source of truth for the SubscriptionGuard UI component.

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id               VARCHAR(128)  NOT NULL,
    plan_type               ENUM('starter','growth','enterprise') NOT NULL DEFAULT 'starter',
    billing_status          ENUM('active','past_due','canceled','suspended','trialing') NOT NULL DEFAULT 'active',
    stripe_customer_id      VARCHAR(64)   NULL,
    stripe_subscription_id  VARCHAR(64)   NULL,
    current_period_end      DATETIME      NULL,
    features_json           JSON          NULL  COMMENT 'Array of feature keys unlocked by this plan',
    ui_tokens_json          JSON          NULL  COMMENT 'Brand tokens: accent_color, logo_url, etc.',
    created_at              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_tenant_id (tenant_id),
    KEY idx_stripe_customer (stripe_customer_id),
    KEY idx_plan_type (plan_type),
    KEY idx_billing_status (billing_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Stripe subscription records per tenant for SubscriptionGuard paywall';

-- Seed default starter records for existing tenants that have no subscription record.
-- Safe INSERT IGNORE: will not touch existing records.
INSERT IGNORE INTO tenant_subscriptions (tenant_id, plan_type, billing_status)
SELECT id, 'starter', 'active'
FROM tenants
WHERE id NOT IN (SELECT tenant_id FROM tenant_subscriptions);

-- =============================================================================
-- Subscription audit log
-- =============================================================================

CREATE TABLE IF NOT EXISTS tenant_subscription_events (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id     VARCHAR(128) NOT NULL,
    event_type    VARCHAR(64)  NOT NULL  COMMENT 'e.g. PLAN_UPGRADED, PAYMENT_FAILED, CANCELED',
    old_plan      VARCHAR(32)  NULL,
    new_plan      VARCHAR(32)  NULL,
    stripe_event_id VARCHAR(128) NULL,
    details_json  JSON         NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_tenant_events (tenant_id),
    KEY idx_event_type (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
