-- migrations/006_industrial_preflight_console.sql
-- Goal: Dedicated persistence layer for the Industrial Preflight Console.
-- Adheres to strict tenant isolation, auditability, and independent persistence.

CREATE TABLE IF NOT EXISTS preflight_job_registry (
    job_id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    printhouse_id VARCHAR(64) NULL,
    operator_id VARCHAR(64) NULL,
    batch_id VARCHAR(64) NULL,
    status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
    policy VARCHAR(128) NULL,
    type VARCHAR(64) DEFAULT 'ANALYZE',
    progress INT DEFAULT 0,
    file_size_bytes BIGINT DEFAULT 0,
    original_filename VARCHAR(255) NULL,
    canonical_payload_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tenant (tenant_id),
    INDEX idx_printhouse (printhouse_id),
    INDEX idx_batch (batch_id),
    INDEX idx_status (status),
    INDEX idx_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS preflight_artifact_registry (
    artifact_id VARCHAR(64) PRIMARY KEY,
    job_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    artifact_type VARCHAR(64) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    size_bytes BIGINT DEFAULT 0,
    storage_path VARCHAR(512) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_job (job_id),
    INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS preflight_audit_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trace_id VARCHAR(64) NULL,
    request_id VARCHAR(64) NULL,
    job_id VARCHAR(64) NULL,
    tenant_id VARCHAR(64) NOT NULL,
    printhouse_id VARCHAR(64) NULL,
    operator_id VARCHAR(64) NULL,
    action VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL,
    message TEXT NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tenant_action (tenant_id, action),
    INDEX idx_job (job_id),
    INDEX idx_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS preflight_governance_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    rule_slug VARCHAR(128) NOT NULL,
    evaluation_result VARCHAR(32) NOT NULL,
    job_id VARCHAR(64) NULL,
    enforcement_action VARCHAR(64) NULL,
    details_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tenant_rule (tenant_id, rule_slug),
    INDEX idx_job (job_id)
) ENGINE=InnoDB;
