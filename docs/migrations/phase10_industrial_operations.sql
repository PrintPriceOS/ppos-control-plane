-- -----------------------------------------------------------------------------
-- PrintPrice OS Control Plane — Phase 10 Industrial Operations Migration
-- 
-- Date: 2026-05-01
-- Objective: Establish industrial persistence for orchestration, artifacts, and incidents.
-- -----------------------------------------------------------------------------

-- 1. Artifact Registry (Forensic Persistence)
CREATE TABLE IF NOT EXISTS preflight_artifacts (
    id VARCHAR(64) PRIMARY KEY,
    job_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    artifact_type VARCHAR(64) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(64) NULL,
    size_bytes BIGINT DEFAULT 0,
    checksum_sha256 VARCHAR(64) NULL,
    created_by_worker VARCHAR(64) NULL,
    lineage_parent_id VARCHAR(64) NULL,
    retention_class ENUM('HOT', 'WARM', 'COLD', 'PURGE') DEFAULT 'HOT',
    storage_tier VARCHAR(32) DEFAULT 'STANDARD',
    forensic_trace_id VARCHAR(64) NULL,
    metadata_json JSON NULL,
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_job (job_id),
    INDEX idx_tenant (tenant_id),
    INDEX idx_trace (forensic_trace_id),
    INDEX idx_checksum (checksum_sha256)
) ENGINE=InnoDB;

-- 2. Worker Cluster Registry
CREATE TABLE IF NOT EXISTS worker_nodes (
    id VARCHAR(64) PRIMARY KEY,
    hostname VARCHAR(255) NOT NULL,
    status ENUM('HEALTHY', 'DEGRADED', 'CRITICAL', 'OFFLINE') DEFAULT 'OFFLINE',
    queue_bindings JSON NULL,
    capabilities JSON NULL,
    gs_version VARCHAR(32) NULL,
    memory_profile_mb INT DEFAULT 0,
    concurrency INT DEFAULT 1,
    uptime_seconds BIGINT DEFAULT 0,
    health_score INT DEFAULT 100,
    last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status)
) ENGINE=InnoDB;

-- 3. Operational Incident Registry
CREATE TABLE IF NOT EXISTS operational_incidents (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NULL,
    scope VARCHAR(64) NOT NULL,
    severity ENUM('INFO', 'WARNING', 'CRITICAL', 'DEGRADED') DEFAULT 'INFO',
    event_type VARCHAR(128) NOT NULL,
    details_json JSON NULL,
    status ENUM('OPEN', 'INVESTIGATING', 'RESOLVED', 'REMEDIATED') DEFAULT 'OPEN',
    remediated_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tenant (tenant_id),
    INDEX idx_scope_status (scope, status),
    INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- 4. Industrial Lifecycle Policies
CREATE TABLE IF NOT EXISTS lifecycle_policies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    tenant_id VARCHAR(64) NULL, -- NULL means Global
    artifact_type VARCHAR(64) DEFAULT '*',
    hot_tier_days INT DEFAULT 7,
    warm_tier_days INT DEFAULT 30,
    cold_tier_days INT DEFAULT 90,
    retention_policy ENUM('STANDARD', 'AGGRESSIVE', 'LEGAL_HOLD') DEFAULT 'STANDARD',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_tenant_type (tenant_id, artifact_type)
) ENGINE=InnoDB;

-- 5. Default Global Policy
INSERT IGNORE INTO lifecycle_policies (name, tenant_id, artifact_type, hot_tier_days, warm_tier_days, cold_tier_days, retention_policy)
VALUES ('GLOBAL_DEFAULT', NULL, '*', 7, 30, 90, 'STANDARD');
