-- migrations/003_preflight_orchestration.sql
-- Goal: Industrial Preflight Orchestration with Forensic Timelines and Artifact Governance.

-- 1. Preflight Jobs (Hardened)
CREATE TABLE IF NOT EXISTS preflight_jobs (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NULL,
    submitted_by_role VARCHAR(32) DEFAULT 'USER',
    assigned_printer_tenant_id VARCHAR(64) NULL,
    visibility_scope ENUM('PRIVATE', 'SHARED', 'SYSTEM') DEFAULT 'PRIVATE',
    upload_id VARCHAR(64) NOT NULL,
    type ENUM('ANALYZE', 'AUTOFIX', 'CERTIFY', 'FIX_PIPELINE') NOT NULL,
    status ENUM('CREATED', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'STALLED', 'RETRYING', 'CANCELLED') DEFAULT 'CREATED',
    progress INT DEFAULT 0,
    step VARCHAR(64) NULL,
    policy VARCHAR(128) NULL,
    error_json JSON NULL,
    metadata_json JSON NULL,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    last_heartbeat_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tenant (tenant_id),
    INDEX idx_status (status)
) ENGINE=InnoDB;

-- 2. Preflight Artifacts (Governance)
CREATE TABLE IF NOT EXISTS preflight_artifacts (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    job_id VARCHAR(64) NULL,
    upload_id VARCHAR(64) NULL,
    type VARCHAR(32) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    storage_key VARCHAR(512) NOT NULL,
    size_bytes BIGINT NOT NULL,
    checksum VARCHAR(128) NULL,
    mime_type VARCHAR(128) DEFAULT 'application/pdf',
    status ENUM('ACTIVE', 'ARCHIVED', 'EXPIRED', 'DELETED', 'CORRUPTED') DEFAULT 'ACTIVE',
    retention_policy ENUM('STANDARD', 'LONG_TERM', 'TEMPORARY') DEFAULT 'STANDARD',
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    INDEX idx_tenant_job (tenant_id, job_id),
    INDEX idx_status (status)
) ENGINE=InnoDB;

-- 3. Forensic Timelines
CREATE TABLE IF NOT EXISTS preflight_forensics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    severity ENUM('INFO', 'WARNING', 'ERROR', 'CRITICAL') DEFAULT 'INFO',
    message TEXT NOT NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_job (job_id),
    INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- 4. Worker Fleet (Real Infrastructure)
CREATE TABLE IF NOT EXISTS preflight_worker_fleet (
    worker_id VARCHAR(64) PRIMARY KEY,
    hostname VARCHAR(128) NOT NULL,
    ip_address VARCHAR(45) NULL,
    version VARCHAR(32) NULL,
    status ENUM('IDLE', 'BUSY', 'OFFLINE', 'MAINTENANCE', 'ERROR') DEFAULT 'OFFLINE',
    current_job_id VARCHAR(64) NULL,
    last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    capabilities_json JSON NULL,
    resource_usage_json JSON NULL,
    INDEX idx_status (status)
) ENGINE=InnoDB;

-- 5. Tenant Quotas
CREATE TABLE IF NOT EXISTS preflight_tenant_quotas (
    tenant_id VARCHAR(64) PRIMARY KEY,
    monthly_job_limit INT DEFAULT 1000,
    storage_limit_bytes BIGINT DEFAULT 10737418240, -- 10GB
    current_month_jobs INT DEFAULT 0,
    current_storage_bytes BIGINT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
