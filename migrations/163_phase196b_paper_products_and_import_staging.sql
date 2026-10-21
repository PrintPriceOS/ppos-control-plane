-- migrations/163_phase196b_paper_products_and_import_staging.sql
-- Phase 196B: Paper Technical Products, Variants, and Import Staging Ledger

-- 1. Canonical Technical Paper Products (Physical Product Family)
CREATE TABLE IF NOT EXISTS paper_products (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    brand VARCHAR(255) NULL,
    manufacturer VARCHAR(255) NULL,
    category ENUM('CARTON', 'OFFSET', 'COATED', 'UNCOATED', 'DESIGN', 'DIGITAL', 'OTHER') NOT NULL DEFAULT 'OTHER',
    finish_summary VARCHAR(128) NULL,
    description TEXT NULL,
    certifications_json JSON NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_paper_product_category (category),
    INDEX idx_paper_product_brand (brand)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Canonical Technical Paper Variants (Specific Physical Dimensions & Grammage)
CREATE TABLE IF NOT EXISTS paper_variants (
    id VARCHAR(64) PRIMARY KEY,
    product_id VARCHAR(64) NOT NULL,
    gsm INT NOT NULL,
    caliper_um INT NULL,
    caliper_mm DECIMAL(8, 4) NULL,
    width_mm DECIMAL(8, 2) NOT NULL,
    height_mm DECIMAL(8, 2) NOT NULL,
    is_reel BOOLEAN NOT NULL DEFAULT FALSE,
    finish VARCHAR(64) NULL,
    grain_direction ENUM('LONG_GRAIN', 'SHORT_GRAIN', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    fingerprint VARCHAR(128) NOT NULL,
    certifications_json JSON NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_variant_product (product_id),
    INDEX idx_variant_gsm_dims (gsm, width_mm, height_mm),
    UNIQUE KEY uk_paper_variant_fingerprint (fingerprint),
    CONSTRAINT fk_variant_product FOREIGN KEY (product_id) REFERENCES paper_products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Paper Technical Import Batches (Staging Traceability)
CREATE TABLE IF NOT EXISTS paper_import_batches (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    supplier_id VARCHAR(64) NULL,
    file_name VARCHAR(255) NOT NULL,
    file_sha256 VARCHAR(64) NOT NULL,
    format ENUM('ODS', 'XLSX', 'CSV') NOT NULL,
    total_rows INT NOT NULL DEFAULT 0,
    valid_rows INT NOT NULL DEFAULT 0,
    issue_rows INT NOT NULL DEFAULT 0,
    duplicate_rows INT NOT NULL DEFAULT 0,
    normalization_rules_version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    status ENUM('PREVIEW', 'CONFIRMED', 'REJECTED') NOT NULL DEFAULT 'PREVIEW',
    created_by VARCHAR(255) NOT NULL,
    confirmed_at TIMESTAMP NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_batch_tenant (tenant_id),
    INDEX idx_batch_supplier (supplier_id),
    INDEX idx_batch_sha (file_sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Paper Technical Import Rows (Granular Row State & Traceability)
CREATE TABLE IF NOT EXISTS paper_import_rows (
    id VARCHAR(64) PRIMARY KEY,
    batch_id VARCHAR(64) NOT NULL,
    row_number INT NOT NULL,
    sheet_name VARCHAR(128) NOT NULL DEFAULT 'Sheet1',
    raw_data_json JSON NOT NULL,
    normalized_data_json JSON NULL,
    issues_json JSON NULL,
    validation_status ENUM('VALID', 'WARNING', 'REJECTED', 'DUPLICATE') NOT NULL DEFAULT 'VALID',
    decision ENUM('PENDING', 'ACCEPTED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    mapped_product_id VARCHAR(64) NULL,
    mapped_variant_id VARCHAR(64) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_import_rows_batch (batch_id, row_number),
    INDEX idx_import_rows_status (batch_id, validation_status),
    CONSTRAINT fk_import_row_batch FOREIGN KEY (batch_id) REFERENCES paper_import_batches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
