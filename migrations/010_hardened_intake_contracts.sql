-- Migration 010: Hardened Intake Contracts (PrintPrice Pro v5.3)
-- Author: Antigravity
-- Date: 2026-05-15

-- 1. Hardened Order Intake Columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS selected_offer_id VARCHAR(64) NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recommended_offer_id VARCHAR(64) NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS offers_snapshot JSON NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS production_files JSON NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_payment JSON NULL;

-- 2. Order Status ENUM Widening
-- Note: status enum widening can be tricky in MySQL if not using native ADD COLUMN IF NOT EXISTS logic
-- We use standard ALTER which is idempotent if the values are already there.
ALTER TABLE orders MODIFY COLUMN status ENUM('pending', 'reviewing', 'in_production', 'shipped', 'delivered', 'cancelled', 'FILES_PENDING', 'FILES_VALIDATED', 'INVOICE_PENDING', 'PAYMENT_PENDING', 'READY_FOR_PRINTHOUSE') DEFAULT 'pending';

-- 3. Production File Repositories (Storage Context)
CREATE TABLE IF NOT EXISTS production_file_repositories (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(128) NOT NULL,
    order_ref VARCHAR(128) NOT NULL,
    user_id VARCHAR(128) NOT NULL,
    print_house_id VARCHAR(64),
    storage_root TEXT,
    status VARCHAR(64) DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_order_ref (order_ref),
    INDEX idx_user (user_id),
    INDEX idx_status (status)
) ENGINE=InnoDB;

-- 4. Production Files (Individual Assets)
CREATE TABLE IF NOT EXISTS production_files (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(128) NOT NULL,
    order_ref VARCHAR(128) NOT NULL,
    repository_id VARCHAR(64) NOT NULL,
    kind ENUM('INTERIOR_PDF', 'COVER_SPINE_BACK_PDF') NOT NULL,
    source_type ENUM('UPLOAD', 'DOWNLOAD_URL') NOT NULL,
    original_filename VARCHAR(255),
    size_bytes BIGINT DEFAULT 0,
    mime_type VARCHAR(128),
    checksum VARCHAR(128),
    download_url TEXT,
    download_url_host VARCHAR(255),
    storage_url TEXT,
    ingestion_status VARCHAR(64) DEFAULT 'DECLARED',
    validation_status VARCHAR(64) DEFAULT 'PENDING',
    preflight_job_id VARCHAR(64),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_order_ref (order_ref),
    INDEX idx_repository (repository_id),
    INDEX idx_kind (kind),
    INDEX idx_ingestion_status (ingestion_status)
) ENGINE=InnoDB;

-- 5. Production File Events (Forensic Ledger)
CREATE TABLE IF NOT EXISTS production_file_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    production_file_id VARCHAR(64) NULL,
    order_id VARCHAR(128) NOT NULL,
    order_ref VARCHAR(128) NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    event_payload JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_file (production_file_id),
    INDEX idx_order_ref (order_ref)
) ENGINE=InnoDB;

-- 6. Printhouse Payment Settings
CREATE TABLE IF NOT EXISTS printhouse_payment_settings (
    printhouse_id VARCHAR(64) PRIMARY KEY,
    provider ENUM('STRIPE', 'BANK_TRANSFER', 'MANUAL') DEFAULT 'MANUAL',
    stripe_account_id VARCHAR(128),
    bank_instructions TEXT,
    currency VARCHAR(10) DEFAULT 'EUR',
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_enabled (enabled)
) ENGINE=InnoDB;

-- 7. Forensic Invoices (Order-Linked)
CREATE TABLE IF NOT EXISTS invoices (
    id VARCHAR(64) PRIMARY KEY,
    order_ref VARCHAR(128) NOT NULL,
    customer_id VARCHAR(128),
    printhouse_id VARCHAR(64),
    invoice_number VARCHAR(64) UNIQUE,
    invoice_type ENUM('CUSTOMER', 'PRINTER') DEFAULT 'CUSTOMER',
    currency VARCHAR(10) DEFAULT 'EUR',
    amount DECIMAL(15, 2) NOT NULL,
    status ENUM('DRAFT', 'ISSUED', 'PARTIAL', 'PAID', 'CANCELLED') DEFAULT 'DRAFT',
    gateway_provider ENUM('STRIPE', 'BANK_TRANSFER', 'MANUAL'),
    gateway_session_id VARCHAR(255),
    payment_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_order_ref (order_ref),
    INDEX idx_status (status)
) ENGINE=InnoDB;
