-- Phase 122: Internal Order Lifecycle Pilot
-- Creates tables for governed internal order lifecycle pilot (tenant-scoped, no live execution)

CREATE TABLE IF NOT EXISTS internal_order_lifecycle_pilot_runs (
  pilot_run_id VARCHAR(80) NOT NULL PRIMARY KEY,
  phase VARCHAR(32) NOT NULL DEFAULT '122',
  tenant_id VARCHAR(80) NOT NULL,
  pilot_activation_reference_id VARCHAR(80) DEFAULT NULL,
  status VARCHAR(80) NOT NULL DEFAULT 'DRAFT',
  pilot_only TINYINT(1) NOT NULL DEFAULT 1,
  internal_order_lifecycle_only TINYINT(1) NOT NULL DEFAULT 1,
  review_only TINYINT(1) NOT NULL DEFAULT 1,
  full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
  open_marketplace_access_enabled TINYINT(1) NOT NULL DEFAULT 0,
  live_provider_connectivity_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  source_mutation_outside_pilot_scope TINYINT(1) NOT NULL DEFAULT 0,
  requested_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS internal_order_lifecycle_pilot_orders (
  pilot_order_id VARCHAR(80) NOT NULL PRIMARY KEY,
  pilot_run_id VARCHAR(80) NOT NULL,
  tenant_id VARCHAR(80) NOT NULL,
  internal_customer_reference VARCHAR(120) DEFAULT NULL,
  pricing_snapshot_reference VARCHAR(120) DEFAULT NULL,
  file_package_reference VARCHAR(120) DEFAULT NULL,
  preflight_reference VARCHAR(120) DEFAULT NULL,
  invoice_readiness_reference VARCHAR(120) DEFAULT NULL,
  production_readiness_reference VARCHAR(120) DEFAULT NULL,
  order_status VARCHAR(80) NOT NULL DEFAULT 'DRAFT',
  lifecycle_snapshot_json JSON DEFAULT NULL,
  safety_snapshot_json JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS internal_order_lifecycle_pilot_steps (
  step_id VARCHAR(80) NOT NULL PRIMARY KEY,
  pilot_run_id VARCHAR(80) NOT NULL,
  pilot_order_id VARCHAR(80) DEFAULT NULL,
  step_key VARCHAR(120) NOT NULL,
  step_status VARCHAR(80) NOT NULL DEFAULT 'PENDING',
  step_result_json JSON DEFAULT NULL,
  safety_snapshot_json JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS internal_order_lifecycle_pilot_findings (
  finding_id VARCHAR(80) NOT NULL PRIMARY KEY,
  pilot_run_id VARCHAR(80) NOT NULL,
  pilot_order_id VARCHAR(80) DEFAULT NULL,
  severity VARCHAR(40) NOT NULL DEFAULT 'INFO',
  finding_key VARCHAR(120) NOT NULL,
  finding_status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
  blocks_lifecycle TINYINT(1) NOT NULL DEFAULT 0,
  finding_details_json JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME DEFAULT NULL,
  resolved_by VARCHAR(120) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS internal_order_lifecycle_pilot_audits (
  audit_id VARCHAR(80) NOT NULL PRIMARY KEY,
  pilot_run_id VARCHAR(80) NOT NULL,
  pilot_order_id VARCHAR(80) DEFAULT NULL,
  event_type VARCHAR(120) NOT NULL,
  event_actor VARCHAR(120) DEFAULT NULL,
  event_payload_json JSON DEFAULT NULL,
  safety_snapshot_json JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS internal_order_lifecycle_pilot_rollback_points (
  rollback_point_id VARCHAR(80) NOT NULL PRIMARY KEY,
  pilot_run_id VARCHAR(80) NOT NULL,
  pilot_order_id VARCHAR(80) DEFAULT NULL,
  rollback_point_status VARCHAR(80) NOT NULL DEFAULT 'CREATED',
  rollback_simulated_only TINYINT(1) NOT NULL DEFAULT 1,
  rollback_executed TINYINT(1) NOT NULL DEFAULT 0,
  rollback_snapshot_json JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS internal_order_lifecycle_pilot_evidence_packs (
  evidence_pack_id VARCHAR(80) NOT NULL PRIMARY KEY,
  pilot_run_id VARCHAR(80) NOT NULL,
  pilot_order_id VARCHAR(80) DEFAULT NULL,
  evidence_status VARCHAR(80) NOT NULL DEFAULT 'DRAFT',
  evidence_pack_json JSON NOT NULL,
  redacted_preview_json JSON DEFAULT NULL,
  generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  generated_by VARCHAR(120) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
