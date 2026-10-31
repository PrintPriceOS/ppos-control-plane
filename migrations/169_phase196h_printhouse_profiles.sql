-- migrations/169_phase196h_printhouse_profiles.sql
-- PrintPrice OS — Phase 196H: Printhouse Operational & Commercial Profiles (BUDGET-02C-01R4V)
--
-- Strict Relational, Economic & Operational Guarantees:
-- 1. Authoritative Commercial Margin: target_margin_pct DECIMAL(5, 2) NULL with CHECK constraint (0 <= target_margin_pct < 100).
-- 2. IANA Timezone Support: timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Madrid'.
-- 3. Jurisdictional Statutory Calendar: jurisdiction VARCHAR(16) NOT NULL DEFAULT 'ES-MD'.
-- 4. Operating Schedule: has_lunch_break TINYINT(1) NOT NULL DEFAULT 1 (8h effective with lunch break vs 9h continuous).
-- 5. Printhouse Municipal Holidays: custom_holidays_json JSON NULL.
-- 6. Business Hours TTL: business_hours_ttl INT NOT NULL DEFAULT 48.
-- 7. Multi-Tenant Isolation & Node Linkage: tenant_id VARCHAR(64) NOT NULL, printhouse_id VARCHAR(64) NOT NULL.

CREATE TABLE IF NOT EXISTS printhouse_profiles (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    printhouse_id VARCHAR(64) NOT NULL,
    
    -- Commercial Economics
    target_margin_pct DECIMAL(5, 2) NULL,
    
    -- Operating Schedule & Calendar Governance
    timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Madrid',
    jurisdiction VARCHAR(16) NOT NULL DEFAULT 'ES-MD',
    has_lunch_break TINYINT(1) NOT NULL DEFAULT 1,
    custom_holidays_json JSON NULL,
    business_hours_ttl INT NOT NULL DEFAULT 48,
    
    -- Status & Lifecycle
    status ENUM('ACTIVE', 'SUSPENDED', 'DRAFT') NOT NULL DEFAULT 'ACTIVE',
    metadata_json JSON NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_pp_tenant (tenant_id),
    INDEX idx_pp_printhouse (printhouse_id),
    INDEX idx_pp_status (status),
    UNIQUE KEY uk_pp_printhouse (printhouse_id),
    CONSTRAINT chk_pp_margin CHECK (target_margin_pct IS NULL OR (target_margin_pct >= 0 AND target_margin_pct < 100)),
    CONSTRAINT chk_pp_ttl CHECK (business_hours_ttl > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
