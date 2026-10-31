-- Phase 121: Controlled Production Pilot Activation Gate
-- Creates tables for controlled, tenant-scoped pilot activation layer

CREATE TABLE IF NOT EXISTS controlled_production_pilot_runs (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  pilot_run_id VARCHAR(128) NOT NULL UNIQUE,
  pilot_run_name VARCHAR(255) DEFAULT 'Controlled Production Pilot Run',
  pilot_run_status ENUM(
    'DRAFT',
    'IN_REVIEW',
    'READY_FOR_TENANT_ACTIVATION',
    'ACTIVE_LIMITED_PILOT',
    'SUSPENDED',
    'COMPLETED',
    'REJECTED'
  ) NOT NULL DEFAULT 'DRAFT',
  created_by VARCHAR(128) NOT NULL DEFAULT 'system',
  phase120_validated TINYINT(1) NOT NULL DEFAULT 0,
  phase120_1_validated TINYINT(1) NOT NULL DEFAULT 0,
  latest_build_evidence TEXT,
  latest_migrations_applied TINYINT(1) NOT NULL DEFAULT 0,
  db_backup_timestamp DATETIME DEFAULT NULL,
  security_compliance_pass TINYINT(1) NOT NULL DEFAULT 0,
  incident_readiness_pass TINYINT(1) NOT NULL DEFAULT 0,
  rollback_drill_pass TINYINT(1) NOT NULL DEFAULT 0,
  controlled_pilot_only TINYINT(1) NOT NULL DEFAULT 1,
  full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
  open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
  unrestricted_live_provider_connectivity_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  external_submission TINYINT(1) NOT NULL DEFAULT 0,
  source_mutation TINYINT(1) NOT NULL DEFAULT 0,
  metadata_json JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_production_pilot_tenants (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  pilot_run_id VARCHAR(128) NOT NULL,
  tenant_id VARCHAR(128) NOT NULL,
  tenant_name VARCHAR(255) DEFAULT '',
  tenant_status ENUM(
    'DRAFT',
    'REGISTERED',
    'READY_FOR_PILOT',
    'PILOT_ACTIVE',
    'PILOT_SUSPENDED',
    'PILOT_COMPLETED',
    'REJECTED'
  ) NOT NULL DEFAULT 'DRAFT',
  registered_by VARCHAR(128) NOT NULL DEFAULT 'system',
  activated_at DATETIME DEFAULT NULL,
  suspended_at DATETIME DEFAULT NULL,
  completed_at DATETIME DEFAULT NULL,
  suspension_reason TEXT DEFAULT NULL,
  metadata_json JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_production_pilot_checks (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  pilot_run_id VARCHAR(128) NOT NULL,
  check_name VARCHAR(255) NOT NULL,
  check_status ENUM('PENDING', 'PASS', 'FAIL', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
  check_detail TEXT DEFAULT NULL,
  checked_by VARCHAR(128) NOT NULL DEFAULT 'system',
  checked_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_production_pilot_findings (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  pilot_run_id VARCHAR(128) NOT NULL,
  tenant_id VARCHAR(128) DEFAULT NULL,
  finding_type ENUM('BLOCKER', 'WARNING', 'INFO') NOT NULL DEFAULT 'INFO',
  finding_status ENUM('OPEN', 'RESOLVED', 'DISMISSED') NOT NULL DEFAULT 'OPEN',
  description TEXT NOT NULL,
  resolution TEXT DEFAULT NULL,
  created_by VARCHAR(128) NOT NULL DEFAULT 'system',
  resolved_by VARCHAR(128) DEFAULT NULL,
  resolved_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_production_pilot_audits (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  pilot_run_id VARCHAR(128) NOT NULL,
  tenant_id VARCHAR(128) DEFAULT NULL,
  event_type VARCHAR(128) NOT NULL,
  actor VARCHAR(128) NOT NULL DEFAULT 'system',
  detail_json JSON DEFAULT NULL,
  safety_markers_json JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controlled_production_pilot_rollback_points (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  pilot_run_id VARCHAR(128) NOT NULL,
  tenant_id VARCHAR(128) DEFAULT NULL,
  rollback_point_name VARCHAR(255) NOT NULL,
  rollback_status ENUM('CREATED', 'SIMULATED', 'EXECUTED') NOT NULL DEFAULT 'CREATED',
  snapshot_json JSON DEFAULT NULL,
  simulation_result_json JSON DEFAULT NULL,
  created_by VARCHAR(128) NOT NULL DEFAULT 'system',
  simulated_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
