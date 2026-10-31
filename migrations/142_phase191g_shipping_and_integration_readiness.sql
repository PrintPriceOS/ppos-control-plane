-- Phase 191G — Shipping Regions, Delivery Configuration & Integration Readiness Schema

CREATE TABLE IF NOT EXISTS printhouse_shipping_regions (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    site_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(64) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    countries_json JSON NULL,
    postal_rules_json JSON NULL,
    standard_transit_days INT NOT NULL DEFAULT 3,
    expedited_transit_days INT NULL DEFAULT 1,
    pickup_available BOOLEAN NOT NULL DEFAULT FALSE,
    handling_days INT NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ph_ship_reg_tenant (tenant_id),
    INDEX idx_ph_ship_reg_site (site_id),
    CONSTRAINT fk_ph_ship_reg_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS printhouse_delivery_methods (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    site_id VARCHAR(64) NOT NULL,
    shipping_region_id VARCHAR(64) NOT NULL,
    code VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    carrier_name VARCHAR(128) NOT NULL,
    service_level VARCHAR(64) NOT NULL DEFAULT 'STANDARD',
    transit_days_min INT NOT NULL DEFAULT 1,
    transit_days_max INT NOT NULL DEFAULT 5,
    cost_rule_id VARCHAR(64) NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ph_del_meth_tenant (tenant_id),
    INDEX idx_ph_del_meth_region (shipping_region_id),
    CONSTRAINT fk_ph_del_meth_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_ph_del_meth_region FOREIGN KEY (shipping_region_id) REFERENCES printhouse_shipping_regions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS printhouse_integration_profiles (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    site_id VARCHAR(64) NULL,
    integration_type VARCHAR(32) NOT NULL, -- API, WEBHOOK, JDF, JMF, MIS, ERP, SFTP
    name VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT', -- NOT_CONFIGURED, DRAFT, CONFIGURING, VALIDATING, READY, ERROR, DISABLED
    endpoint_url VARCHAR(512) NULL,
    settings_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ph_integ_prof_tenant (tenant_id),
    INDEX idx_ph_integ_prof_type (integration_type),
    CONSTRAINT fk_ph_integ_prof_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS printhouse_integration_credentials (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    integration_profile_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    key_id VARCHAR(64) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    secret_ciphertext TEXT NULL,
    secret_prefix VARCHAR(16) NOT NULL,
    scopes_json JSON NULL,
    last_used_at DATETIME NULL,
    expires_at DATETIME NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, ROTATED, REVOKED
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ph_integ_cred_tenant (tenant_id),
    INDEX idx_ph_integ_cred_profile (integration_profile_id),
    INDEX idx_ph_integ_cred_key (key_id),
    CONSTRAINT fk_ph_integ_cred_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_ph_integ_cred_profile FOREIGN KEY (integration_profile_id) REFERENCES printhouse_integration_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS printhouse_webhook_profiles (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    integration_profile_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    target_url VARCHAR(512) NOT NULL,
    event_subscriptions_json JSON NOT NULL,
    signing_secret_ciphertext TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_delivery_at DATETIME NULL,
    last_success_at DATETIME NULL,
    last_error TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ph_wh_prof_tenant (tenant_id),
    INDEX idx_ph_wh_prof_profile (integration_profile_id),
    CONSTRAINT fk_ph_wh_prof_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_ph_wh_prof_profile FOREIGN KEY (integration_profile_id) REFERENCES printhouse_integration_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS printhouse_shipping_integration_audits (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    action VARCHAR(64) NOT NULL,
    actor_json JSON NULL,
    changes_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ph_sh_int_aud_tenant (tenant_id),
    INDEX idx_ph_sh_int_aud_entity (entity_type, entity_id),
    CONSTRAINT fk_ph_sh_int_aud_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
