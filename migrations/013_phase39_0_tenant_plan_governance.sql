-- Migration 013: Phase 39.0 Tenant Plan Governance Schema
-- Author: Antigravity
-- Date: 2026-05-26

ALTER TABLE tenants ADD COLUMN plan_code VARCHAR(64) NULL;
ALTER TABLE tenants ADD COLUMN commercial_status VARCHAR(64) NULL;
ALTER TABLE tenants ADD COLUMN access_level VARCHAR(64) NULL;
ALTER TABLE tenants ADD COLUMN grace_started_at TIMESTAMP NULL;
ALTER TABLE tenants ADD COLUMN grace_ends_at TIMESTAMP NULL;
ALTER TABLE tenants ADD COLUMN grace_extended_until TIMESTAMP NULL;
ALTER TABLE tenants ADD COLUMN limits_json JSON NULL;
ALTER TABLE tenants ADD COLUMN entitlements_json JSON NULL;
ALTER TABLE tenants ADD COLUMN module_access_json JSON NULL;
ALTER TABLE tenants ADD COLUMN governance_notes_json JSON NULL;

-- Backward compatibility initializations
UPDATE tenants SET plan_code = plan WHERE plan_code IS NULL;
UPDATE tenants SET commercial_status = 'ACTIVE' WHERE commercial_status IS NULL;
UPDATE tenants SET access_level = 'BASIC' WHERE access_level IS NULL AND plan = 'FREE';
UPDATE tenants SET access_level = 'PROFESSIONAL' WHERE access_level IS NULL AND plan = 'PRO';
UPDATE tenants SET access_level = 'FULL' WHERE access_level IS NULL AND plan = 'ENTERPRISE';
UPDATE tenants SET access_level = 'SYSTEM' WHERE access_level IS NULL AND plan = 'SYSTEM';

CREATE TABLE IF NOT EXISTS tenant_governance_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    actor_id VARCHAR(128) NULL,
    plan_code VARCHAR(64) NULL,
    commercial_status VARCHAR(64) NULL,
    action_code VARCHAR(64) NULL,
    blockers_json JSON NULL,
    warnings_json JSON NULL,
    reason TEXT NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tenant (tenant_id),
    INDEX idx_event_type (event_type),
    INDEX idx_created (created_at)
) ENGINE=InnoDB;
