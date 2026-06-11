-- migrations/019_phase79_live_production_monitoring_sla_dashboard.sql
-- Phase 79 — Live Production Monitoring & SLA Dashboard DB Schema

CREATE TABLE IF NOT EXISTS production_monitoring_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    printhouse_id VARCHAR(64) NOT NULL,
    order_id VARCHAR(64) NOT NULL UNIQUE,
    job_id VARCHAR(64) NULL,
    queue_entry_id VARCHAR(64) NULL,
    machine_id VARCHAR(64) NULL,
    production_status VARCHAR(64) NOT NULL DEFAULT 'NOT_STARTED',
    sla_status VARCHAR(64) NOT NULL DEFAULT 'NOT_APPLICABLE',
    sla_started_at TIMESTAMP NULL,
    sla_due_at TIMESTAMP NULL,
    estimated_completion_at TIMESTAMP NULL,
    actual_completed_at TIMESTAMP NULL,
    remaining_minutes INT NULL,
    risk_score INT NOT NULL DEFAULT 0,
    blocking_reasons_json JSON NULL,
    warning_reasons_json JSON NULL,
    governance_snapshot_json JSON NULL,
    monitoring_snapshot_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS production_timeline_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    printhouse_id VARCHAR(64) NOT NULL,
    order_id VARCHAR(64) NOT NULL,
    job_id VARCHAR(64) NULL,
    event_type VARCHAR(64) NOT NULL,
    event_status VARCHAR(32) NOT NULL DEFAULT 'INFO',
    actor_user_id VARCHAR(64) NULL,
    actor_role VARCHAR(64) NULL,
    message TEXT NOT NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS production_incidents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    printhouse_id VARCHAR(64) NOT NULL,
    order_id VARCHAR(64) NOT NULL,
    job_id VARCHAR(64) NULL,
    incident_type VARCHAR(64) NOT NULL,
    severity VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    title VARCHAR(256) NOT NULL,
    description TEXT NOT NULL,
    resolution_notes TEXT NULL,
    assigned_to_user_id VARCHAR(64) NULL,
    opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP NULL,
    resolved_at TIMESTAMP NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS machine_load_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    printhouse_id VARCHAR(64) NOT NULL,
    machine_id VARCHAR(64) NOT NULL UNIQUE,
    machine_name VARCHAR(128) NOT NULL,
    machine_type VARCHAR(64) NOT NULL,
    load_status VARCHAR(32) NOT NULL DEFAULT 'IDLE',
    queued_jobs_count INT NOT NULL DEFAULT 0,
    active_jobs_count INT NOT NULL DEFAULT 0,
    estimated_queue_minutes INT NOT NULL DEFAULT 0,
    capacity_score INT NOT NULL DEFAULT 100,
    next_available_at TIMESTAMP NULL,
    snapshot_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sla_policy_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    printhouse_id VARCHAR(64) NOT NULL,
    order_id VARCHAR(64) NOT NULL,
    job_id VARCHAR(64) NULL,
    sla_profile_id INT NULL,
    sla_name VARCHAR(128) NOT NULL,
    production_days_min INT NOT NULL DEFAULT 1,
    production_days_max INT NOT NULL DEFAULT 7,
    cutoff_time_local VARCHAR(5) NOT NULL DEFAULT '17:00',
    timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
    weekend_production TINYINT(1) NOT NULL DEFAULT 0,
    rush_available TINYINT(1) NOT NULL DEFAULT 0,
    sla_snapshot_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
