-- Migration 011: Phase 36.1 Marketplace Order Intake & File Governance Schema
-- Author: Antigravity
-- Date: 2026-05-18

-- 1. Marketplace Orders Table
CREATE TABLE IF NOT EXISTS marketplace_orders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id VARCHAR(128) UNIQUE NOT NULL,
    pricing_session_id VARCHAR(128) NULL,
    selected_offer_id VARCHAR(128) NULL,
    customer_id VARCHAR(128) NULL,
    tenant_id VARCHAR(64) NULL,
    printhouse_id VARCHAR(64) NULL,
    status VARCHAR(64) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
    estimated_price DECIMAL(15,2) NULL,
    book_spec_json JSON NULL,
    selected_offer_json JSON NULL,
    customer_json JSON NULL,
    readiness_json JSON NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_pricing_session (pricing_session_id),
    INDEX idx_selected_offer (selected_offer_id),
    INDEX idx_customer (customer_id),
    INDEX idx_tenant (tenant_id),
    INDEX idx_printhouse (printhouse_id),
    INDEX idx_status (status)
) ENGINE=InnoDB;

-- 2. Marketplace Order Files Table
CREATE TABLE IF NOT EXISTS marketplace_order_files (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    file_id VARCHAR(128) UNIQUE NOT NULL,
    order_id VARCHAR(128) NOT NULL,
    role VARCHAR(64) NOT NULL,
    version INT DEFAULT 1,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    size_bytes BIGINT NOT NULL,
    checksum_sha256 VARCHAR(64) NULL,
    storage_path TEXT NULL,
    status VARCHAR(64) NOT NULL,
    preflight_job_id VARCHAR(64) NULL,
    preflight_status VARCHAR(64) NULL,
    preflight_outcome_category VARCHAR(64) NULL,
    findings_count INT DEFAULT 0,
    artifact_refs_json JSON NULL,
    metadata_json JSON NULL,
    uploaded_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_order (order_id),
    INDEX idx_checksum (checksum_sha256),
    INDEX idx_status (status),
    INDEX idx_preflight_job (preflight_job_id)
) ENGINE=InnoDB;

-- 3. Marketplace Order Events Table
CREATE TABLE IF NOT EXISTS marketplace_order_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_id VARCHAR(128) UNIQUE NOT NULL,
    order_id VARCHAR(128) NOT NULL,
    file_id VARCHAR(128) NULL,
    type VARCHAR(64) NOT NULL,
    actor_type VARCHAR(64) NULL,
    actor_id VARCHAR(128) NULL,
    payload_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_order (order_id),
    INDEX idx_file (file_id),
    INDEX idx_type (type)
) ENGINE=InnoDB;

-- 4. Marketplace Order Preflight Bindings Table
CREATE TABLE IF NOT EXISTS marketplace_order_preflight_bindings (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id VARCHAR(128) NOT NULL,
    file_id VARCHAR(128) NOT NULL,
    preflight_job_id VARCHAR(64) UNIQUE NOT NULL,
    role VARCHAR(64) NOT NULL,
    status VARCHAR(64) NOT NULL,
    outcome_category VARCHAR(64) NULL,
    analysis_integrity_json JSON NULL,
    analyzer_coverage_json JSON NULL,
    artifact_refs_json JSON NULL,
    findings_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_order (order_id),
    INDEX idx_file (file_id),
    INDEX idx_preflight_job (preflight_job_id),
    INDEX idx_role (role),
    INDEX idx_status (status)
) ENGINE=InnoDB;
