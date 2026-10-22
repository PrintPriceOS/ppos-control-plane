-- migrations/164_phase196c_supplier_paper_offers_and_revisions.sql
-- Phase 196C: Supplier Paper Offers and Revision Ledger (Iteration I3)

-- 1. Commercial Paper Offers Table
CREATE TABLE IF NOT EXISTS supplier_paper_offers (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    supplier_id VARCHAR(64) NOT NULL,
    variant_id VARCHAR(64) NOT NULL,
    supplier_sku VARCHAR(128) NOT NULL,
    price_amount DECIMAL(12, 4) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    price_basis ENUM('KG', 'TONNE', 'SHEET', 'THOUSAND_SHEETS', 'PACK') NOT NULL,
    sheets_per_pack INT NULL,
    moq INT NOT NULL DEFAULT 1,
    order_multiple INT NOT NULL DEFAULT 1,
    valid_from TIMESTAMP NULL,
    valid_until TIMESTAMP NULL,
    delivery_zones_json JSON NULL,
    visibility ENUM('PRIVATE', 'APPROVED_CUSTOMERS', 'MARKETPLACE') NOT NULL DEFAULT 'PRIVATE',
    status ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    current_revision_id VARCHAR(64) NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_offer_tenant (tenant_id),
    INDEX idx_offer_supplier (supplier_id),
    INDEX idx_offer_variant (variant_id),
    INDEX idx_offer_sku (supplier_id, supplier_sku),
    INDEX idx_offer_status_vis (status, visibility),
    CONSTRAINT fk_offer_supplier FOREIGN KEY (supplier_id) REFERENCES paper_suppliers(id) ON DELETE CASCADE,
    CONSTRAINT fk_offer_variant FOREIGN KEY (variant_id) REFERENCES paper_variants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Commercial Paper Offer Revisions Table (Immutable Audit Ledger)
CREATE TABLE IF NOT EXISTS supplier_paper_offer_revisions (
    id VARCHAR(64) PRIMARY KEY,
    offer_id VARCHAR(64) NOT NULL,
    revision_number INT NOT NULL,
    price_amount DECIMAL(12, 4) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    price_basis ENUM('KG', 'TONNE', 'SHEET', 'THOUSAND_SHEETS', 'PACK') NOT NULL,
    sheets_per_pack INT NULL,
    moq INT NOT NULL,
    order_multiple INT NOT NULL,
    valid_from TIMESTAMP NULL,
    valid_until TIMESTAMP NULL,
    delivery_zones_json JSON NULL,
    visibility ENUM('PRIVATE', 'APPROVED_CUSTOMERS', 'MARKETPLACE') NOT NULL,
    status ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED') NOT NULL,
    change_reason VARCHAR(255) NULL,
    created_by VARCHAR(255) NOT NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_offer_revision (offer_id, revision_number),
    INDEX idx_revision_offer (offer_id),
    CONSTRAINT fk_revision_offer FOREIGN KEY (offer_id) REFERENCES supplier_paper_offers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
