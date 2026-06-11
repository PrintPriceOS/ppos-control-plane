-- migrations/018_phase78_usage_billing_plan_limits.sql
-- Phase 78 — Usage, Billing & Plan Limits DB Schema

CREATE TABLE IF NOT EXISTS commercial_plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    plan_code VARCHAR(64) NOT NULL UNIQUE,
    plan_name VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    billing_mode VARCHAR(32) NOT NULL DEFAULT 'FREE',
    base_currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    monthly_base_price_cents INT NOT NULL DEFAULT 0,
    included_jobs_monthly INT NOT NULL DEFAULT 0,
    included_preflight_jobs_monthly INT NOT NULL DEFAULT 0,
    included_autofix_jobs_monthly INT NOT NULL DEFAULT 0,
    included_storage_gb INT NOT NULL DEFAULT 0,
    included_bandwidth_gb INT NOT NULL DEFAULT 0,
    max_file_size_mb INT NOT NULL DEFAULT 25,
    max_job_file_size_mb INT NOT NULL DEFAULT 50,
    max_monthly_orders INT NOT NULL DEFAULT 0,
    max_daily_jobs INT NOT NULL DEFAULT 0,
    max_concurrent_jobs INT NOT NULL DEFAULT 0,
    max_team_users INT NOT NULL DEFAULT 0,
    max_printhouses INT NOT NULL DEFAULT 0,
    allow_large_uploads TINYINT(1) NOT NULL DEFAULT 0,
    allow_api_access TINYINT(1) NOT NULL DEFAULT 0,
    allow_white_label TINYINT(1) NOT NULL DEFAULT 0,
    allow_priority_queue TINYINT(1) NOT NULL DEFAULT 0,
    allow_machine_assignment TINYINT(1) NOT NULL DEFAULT 0,
    allow_audit_bundle_export TINYINT(1) NOT NULL DEFAULT 0,
    allow_partner_onboarding TINYINT(1) NOT NULL DEFAULT 0,
    allow_commercial_handoff TINYINT(1) NOT NULL DEFAULT 0,
    overage_policy_json JSON NULL,
    feature_flags_json JSON NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tenant_commercial_entitlements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL UNIQUE,
    plan_code VARCHAR(64) NOT NULL,
    plan_id INT NULL,
    entitlement_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    billing_status VARCHAR(32) NOT NULL DEFAULT 'NOT_REQUIRED',
    billing_anchor_day INT NOT NULL DEFAULT 1,
    current_period_start TIMESTAMP NULL,
    current_period_end TIMESTAMP NULL,
    trial_ends_at TIMESTAMP NULL,
    commercial_live_enabled TINYINT(1) NOT NULL DEFAULT 0,
    pilot_access_enabled TINYINT(1) NOT NULL DEFAULT 0,
    partner_access_enabled TINYINT(1) NOT NULL DEFAULT 0,
    usage_enforcement_enabled TINYINT(1) NOT NULL DEFAULT 1,
    overage_enabled TINYINT(1) NOT NULL DEFAULT 0,
    hard_limit_enforcement TINYINT(1) NOT NULL DEFAULT 1,
    soft_limit_warnings TINYINT(1) NOT NULL DEFAULT 1,
    custom_limits_json JSON NULL,
    entitlement_snapshot_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tenant_usage_counters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    period_key VARCHAR(7) NOT NULL,
    orders_count INT NOT NULL DEFAULT 0,
    preflight_jobs_count INT NOT NULL DEFAULT 0,
    autofix_jobs_count INT NOT NULL DEFAULT 0,
    uploaded_files_count INT NOT NULL DEFAULT 0,
    uploaded_bytes BIGINT NOT NULL DEFAULT 0,
    stored_bytes BIGINT NOT NULL DEFAULT 0,
    downloaded_bytes BIGINT NOT NULL DEFAULT 0,
    audit_bundles_count INT NOT NULL DEFAULT 0,
    handoff_packages_count INT NOT NULL DEFAULT 0,
    machine_assignments_count INT NOT NULL DEFAULT 0,
    unsafe_fix_approvals_count INT NOT NULL DEFAULT 0,
    machine_override_approvals_count INT NOT NULL DEFAULT 0,
    api_requests_count INT NOT NULL DEFAULT 0,
    failed_jobs_count INT NOT NULL DEFAULT 0,
    last_event_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_tenant_period (tenant_id, period_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS usage_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(64) NULL,
    resource_type VARCHAR(64) NULL,
    quantity INT NOT NULL DEFAULT 1,
    bytes BIGINT NOT NULL DEFAULT 0,
    period_key VARCHAR(7) NOT NULL,
    plan_code VARCHAR(64) NULL,
    billable TINYINT(1) NOT NULL DEFAULT 0,
    billing_event_id INT NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS billing_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    period_key VARCHAR(7) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    plan_code VARCHAR(64) NULL,
    metric VARCHAR(64) NULL,
    quantity INT NOT NULL DEFAULT 0,
    included_quantity INT NOT NULL DEFAULT 0,
    overage_quantity INT NOT NULL DEFAULT 0,
    unit_price_cents INT NOT NULL DEFAULT 0,
    amount_cents INT NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    status VARCHAR(32) NOT NULL DEFAULT 'RECORDED',
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tenant_plan_audit (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    actor_user_id VARCHAR(64) NULL,
    actor_role VARCHAR(64) NULL,
    before_json JSON NULL,
    after_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Seed default plans
INSERT INTO commercial_plans (plan_code, plan_name, status, billing_mode, monthly_base_price_cents, included_preflight_jobs_monthly, included_storage_gb, max_file_size_mb, allow_large_uploads, allow_audit_bundle_export, allow_commercial_handoff) VALUES
('FREE', 'Free Starter', 'ACTIVE', 'FREE', 0, 5, 10, 25, 0, 0, 0)
ON DUPLICATE KEY UPDATE plan_name=VALUES(plan_name);

INSERT INTO commercial_plans (plan_code, plan_name, status, billing_mode, monthly_base_price_cents, included_preflight_jobs_monthly, included_storage_gb, max_file_size_mb, allow_large_uploads, allow_audit_bundle_export, allow_commercial_handoff) VALUES
('PRO', 'Professional Printhouse', 'ACTIVE', 'SUBSCRIPTION', 4900, 50, 50, 150, 0, 0, 0)
ON DUPLICATE KEY UPDATE plan_name=VALUES(plan_name);

INSERT INTO commercial_plans (plan_code, plan_name, status, billing_mode, monthly_base_price_cents, included_preflight_jobs_monthly, included_storage_gb, max_file_size_mb, allow_large_uploads, allow_audit_bundle_export, allow_commercial_handoff) VALUES
('BUSINESS', 'Business Suite', 'ACTIVE', 'SUBSCRIPTION', 19900, 250, 250, 500, 1, 1, 0)
ON DUPLICATE KEY UPDATE plan_name=VALUES(plan_name);

INSERT INTO commercial_plans (plan_code, plan_name, status, billing_mode, monthly_base_price_cents, included_preflight_jobs_monthly, included_storage_gb, max_file_size_mb, allow_large_uploads, allow_audit_bundle_export, allow_commercial_handoff) VALUES
('ENTERPRISE', 'Enterprise Scale', 'ACTIVE', 'HYBRID', 99900, 1000, 1000, 1024, 1, 1, 1)
ON DUPLICATE KEY UPDATE plan_name=VALUES(plan_name);

INSERT INTO commercial_plans (plan_code, plan_name, status, billing_mode, monthly_base_price_cents, included_preflight_jobs_monthly, included_storage_gb, max_file_size_mb, allow_large_uploads, allow_partner_onboarding, allow_commercial_handoff) VALUES
('FOUNDING_PRINTHOUSE', 'Founding Partner', 'ACTIVE', 'MANUAL', 0, 2000, 1000, 2048, 1, 1, 1)
ON DUPLICATE KEY UPDATE plan_name=VALUES(plan_name);

INSERT INTO commercial_plans (plan_code, plan_name, status, billing_mode, monthly_base_price_cents, included_preflight_jobs_monthly, included_storage_gb, max_file_size_mb, max_monthly_orders, max_daily_jobs, allow_partner_onboarding, allow_commercial_handoff) VALUES
('PILOT', 'Partner Pilot Plan', 'ACTIVE', 'MANUAL', 0, 2000, 50, 2048, 50, 25, 1, 1)
ON DUPLICATE KEY UPDATE plan_name=VALUES(plan_name);

INSERT INTO commercial_plans (plan_code, plan_name, status, billing_mode, max_file_size_mb) VALUES
('SYSTEM', 'System Infrastructure', 'ACTIVE', 'INTERNAL', 5120)
ON DUPLICATE KEY UPDATE plan_name=VALUES(plan_name);

INSERT INTO commercial_plans (plan_code, plan_name, status, billing_mode, max_file_size_mb) VALUES
('CUSTOM', 'Custom Contract', 'ACTIVE', 'MANUAL', 2048)
ON DUPLICATE KEY UPDATE plan_name=VALUES(plan_name);
