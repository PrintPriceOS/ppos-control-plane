-- migrations/002_resolve_schema_drift.sql
-- Goal: Resolve rates_json mismatch, nullable drift, and duplicate federation fields.

-- 1. Hardening printer_nodes
ALTER TABLE printer_nodes MODIFY COLUMN rates_json JSON NULL;

-- 2. Consolidating Audit Logs
CREATE TABLE IF NOT EXISTS api_audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NULL,
    user_id VARCHAR(64) NULL,
    status ENUM('SUCCESS', 'FAILURE', 'WARNING') DEFAULT 'SUCCESS',
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tenant (tenant_id),
    INDEX idx_event (event_type),
    INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- 3. Hardening core tables (ensure JSON consistency)
ALTER TABLE jobs MODIFY COLUMN metadata_json JSON NULL;
ALTER TABLE metrics MODIFY COLUMN metadata_json JSON NULL;
ALTER TABLE manufacturing_dispatches MODIFY COLUMN metadata_json JSON NULL;

-- 4. Federation Hardening
-- Remove duplicate fields if any, or ensure consistency
ALTER TABLE federation_factories MODIFY COLUMN capacity_index DECIMAL(5,2) DEFAULT 0.00;
ALTER TABLE federation_factories MODIFY COLUMN last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
