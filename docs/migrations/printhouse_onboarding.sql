-- docs/migrations/printhouse_onboarding.sql
-- -----------------------------------------------------------------------------
-- PrintPrice OS Control Plane — Printhouse Onboarding & RBAC Enhancement
-- 
-- Date: 2026-05-06
-- Objective: Support self-service registration and scoped access for Printhouses.
-- -----------------------------------------------------------------------------

-- 1. Enhance control_users with Printhouse Scope
ALTER TABLE control_users 
ADD COLUMN printhouse_id VARCHAR(64) NULL AFTER tenant_id,
MODIFY COLUMN role ENUM('SUPER_ADMIN', 'OPS_ADMIN', 'TENANT_ADMIN', 'PRINTHOUSE_ADMIN', 'PRINTHOUSE_OPERATOR', 'VIEWER') DEFAULT 'VIEWER';

-- 2. Ensure printer_nodes supports self-registration metadata
CREATE TABLE IF NOT EXISTS printer_nodes (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    country VARCHAR(64) NULL,
    city VARCHAR(64) NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(64) NULL,
    website VARCHAR(255) NULL,
    status ENUM('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED') DEFAULT 'PENDING',
    onboarding_status ENUM('STARTED', 'DOCS_UPLOADED', 'PRICING_CONFIGURED', 'COMPLETED') DEFAULT 'STARTED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tenant (tenant_id),
    INDEX idx_status (status)
) ENGINE=InnoDB;

-- 3. Create tenants if not exists (Printhouse type)
CREATE TABLE IF NOT EXISTS tenants (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type ENUM('ENTERPRISE', 'AGENCY', 'PRINTHOUSE', 'INTERNAL') DEFAULT 'ENTERPRISE',
    status ENUM('ACTIVE', 'SUSPENDED', 'TRIAL') DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_type (type)
) ENGINE=InnoDB;
