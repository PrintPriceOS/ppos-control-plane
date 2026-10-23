-- migrations/165_phase196d_paper_supplier_offer_soft_delete_and_catalog_associations.sql
-- Phase 196D: Paper Supplier Offer Soft Delete & Supplier Catalog Associations (Iteration I3 Extension)

-- 1. Soft-Delete Support for Commercial Paper Offers (Preserving Revision Ledger)
ALTER TABLE supplier_paper_offers
    ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at,
    ADD INDEX idx_offer_deleted_at (deleted_at);

-- 2. Supplier Technical Catalog Associations (Tenant & Supplier Scoped Variant Lifecycle)
CREATE TABLE IF NOT EXISTS supplier_paper_catalog_variants (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    supplier_id VARCHAR(64) NOT NULL,
    variant_id VARCHAR(64) NOT NULL,
    status ENUM('ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    notes VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    UNIQUE KEY uk_supplier_catalog_variant (supplier_id, variant_id),
    INDEX idx_spcv_tenant (tenant_id),
    INDEX idx_spcv_supplier (supplier_id),
    INDEX idx_spcv_variant (variant_id),
    INDEX idx_spcv_status (status),
    INDEX idx_spcv_deleted_at (deleted_at),
    CONSTRAINT fk_spcv_supplier FOREIGN KEY (supplier_id) REFERENCES paper_suppliers(id) ON DELETE CASCADE,
    CONSTRAINT fk_spcv_variant FOREIGN KEY (variant_id) REFERENCES paper_variants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
