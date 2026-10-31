-- migrations/138_phase191c_printhouse_onboarding_profiles.sql
-- Phase 191C — Printhouse Setup Hub Progress Metadata
-- Stores UX onboarding progress metadata (timestamps and section statuses) per tenant.
-- Canonical company and site domain data remain strictly in tenants and printer_nodes.

CREATE TABLE IF NOT EXISTS printhouse_onboarding_profiles (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL UNIQUE,
    printhouse_id VARCHAR(64) NULL,
    overall_status VARCHAR(30) NOT NULL DEFAULT 'NOT_STARTED', -- NOT_STARTED, IN_PROGRESS, CORE_COMPLETE, OPERATIONALLY_READY, MARKETPLACE_READY
    company_profile_status VARCHAR(30) NOT NULL DEFAULT 'NOT_STARTED', -- NOT_STARTED, IN_PROGRESS, COMPLETE, NEEDS_ATTENTION
    production_sites_status VARCHAR(30) NOT NULL DEFAULT 'NOT_STARTED',
    machines_status VARCHAR(30) NOT NULL DEFAULT 'NOT_STARTED',
    capabilities_status VARCHAR(30) NOT NULL DEFAULT 'NOT_STARTED',
    materials_status VARCHAR(30) NOT NULL DEFAULT 'NOT_STARTED',
    pricing_status VARCHAR(30) NOT NULL DEFAULT 'NOT_STARTED',
    capacity_status VARCHAR(30) NOT NULL DEFAULT 'NOT_STARTED',
    shipping_status VARCHAR(30) NOT NULL DEFAULT 'NOT_STARTED',
    integrations_status VARCHAR(30) NOT NULL DEFAULT 'NOT_STARTED',
    marketplace_status VARCHAR(30) NOT NULL DEFAULT 'NOT_STARTED',
    first_opened_at DATETIME NULL,
    last_activity_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    company_profile_completed_at DATETIME NULL,
    production_sites_completed_at DATETIME NULL,
    version INT NOT NULL DEFAULT 1,
    metadata_json LONGTEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_onboarding_tenant (tenant_id),
    INDEX idx_onboarding_overall_status (overall_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
