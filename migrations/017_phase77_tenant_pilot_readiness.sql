-- migrations/017_phase77_tenant_pilot_readiness.sql
-- Phase 77A — Tenant Pilot Schema & Status Model

CREATE TABLE IF NOT EXISTS tenant_pilot_readiness (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    printhouse_id VARCHAR(50) NOT NULL,
    pilot_status VARCHAR(50) NOT NULL DEFAULT 'NOT_CONFIGURED', -- NOT_CONFIGURED, CONFIGURED, READY_FOR_INTERNAL_TEST, READY_FOR_PARTNER_TEST, PILOT_ACTIVE, PILOT_PAUSED, PILOT_COMPLETED, BLOCKED
    commercial_status VARCHAR(50) NOT NULL DEFAULT 'NOT_STARTED', -- NOT_STARTED, PILOT_ONLY, COMMERCIAL_REVIEW, APPROVED_FOR_LIVE, LIVE
    live_production_enabled TINYINT(1) NOT NULL DEFAULT 0,
    pilot_access_enabled TINYINT(1) NOT NULL DEFAULT 0,
    partner_access_enabled TINYINT(1) NOT NULL DEFAULT 0,
    customer_access_enabled TINYINT(1) NOT NULL DEFAULT 0,
    max_pilot_orders INT DEFAULT 50,
    max_pilot_jobs_per_day INT DEFAULT 25,
    max_pilot_file_size_mb INT DEFAULT 2048,
    max_pilot_storage_gb INT DEFAULT 50,
    allowed_order_types_json JSON NULL,
    allowed_printhouse_ids_json JSON NULL,
    allowed_machine_ids_json JSON NULL,
    pilot_started_at TIMESTAMP NULL,
    pilot_completed_at TIMESTAMP NULL,
    blocked_reason TEXT NULL,
    readiness_snapshot_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_tenant_printhouse_readiness (tenant_id, printhouse_id)
) ENGINE=InnoDB;
