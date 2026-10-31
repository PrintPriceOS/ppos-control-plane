-- migrations/162_phase196a_paper_suppliers_and_procurement_idempotency.sql
-- Phase 196A: Paper Supplier Hub Identity, Capabilities, and Idempotent Procurement Ledger

-- 1. Paper Suppliers Table
CREATE TABLE IF NOT EXISTS paper_suppliers (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    status ENUM('ACTIVE', 'SUSPENDED', 'PENDING_REVIEW') NOT NULL DEFAULT 'PENDING_REVIEW',
    contact_email VARCHAR(255) NULL,
    currencies_json JSON NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_supplier_tenant (tenant_id),
    INDEX idx_supplier_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tenant Capabilities (Explicit Dual Context: Printhouse + Supplier)
CREATE TABLE IF NOT EXISTS tenant_capabilities (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    capability ENUM('PRINTHOUSE', 'PAPER_SUPPLIER') NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_tenant_capability (tenant_id, capability),
    INDEX idx_capability_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Supplier Memberships and Roles (Orthogonal RBAC)
CREATE TABLE IF NOT EXISTS supplier_memberships (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    supplier_id VARCHAR(64) NOT NULL,
    supplier_role ENUM('SUPPLIER_ADMIN', 'SUPPLIER_OPERATOR', 'SUPPLIER_VIEWER') NOT NULL DEFAULT 'SUPPLIER_VIEWER',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_supplier_membership (user_id, supplier_id),
    INDEX idx_supplier_membership_user (user_id, tenant_id),
    INDEX idx_supplier_membership_supplier (supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Procurement Receipts and Idempotency Ledger
CREATE TABLE IF NOT EXISTS procurement_receipt_records (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    printhouse_id VARCHAR(64) NULL,
    procurement_id VARCHAR(64) NOT NULL,
    material_inventory_id VARCHAR(64) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    payload_sha256 VARCHAR(64) NOT NULL,
    received_units INT NOT NULL,
    before_stock INT NOT NULL,
    after_stock INT NOT NULL,
    operator_id VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
    response_json JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_procurement_idempotency (tenant_id, idempotency_key),
    INDEX idx_receipt_procurement (procurement_id),
    INDEX idx_receipt_material (material_inventory_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
