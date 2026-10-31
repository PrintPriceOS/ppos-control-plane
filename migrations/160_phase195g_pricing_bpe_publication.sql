-- migrations/160_phase195g_pricing_bpe_publication.sql
-- Phase 195G: Governed Pricing Rate Publication Control Plane -> BPE

CREATE TABLE IF NOT EXISTS bpe_pricing_publications (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    printer_node_id VARCHAR(255) NOT NULL,
    bpe_printhouse_id VARCHAR(255) NOT NULL,
    revision_id VARCHAR(255) NOT NULL,
    accepted_patch_checksum VARCHAR(64) NOT NULL,
    version INT NOT NULL DEFAULT 1,
    status ENUM('PENDING', 'PUBLISHED', 'FAILED', 'SUPERSEDED') NOT NULL DEFAULT 'PENDING',
    bpe_response_checksum VARCHAR(64) NULL,
    bpe_published_at DATETIME NULL,
    error_message TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_bpe_pub_node_rev (printer_node_id, revision_id),
    INDEX idx_bpe_pub_tenant_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
