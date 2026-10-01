-- Migration 155: Phase 195D Governed Machine Route Rules Table
CREATE TABLE IF NOT EXISTS printhouse_machine_route_rules (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  printhouse_id VARCHAR(50) NOT NULL,
  rule_name VARCHAR(128) NOT NULL,
  rule_type VARCHAR(64) NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  target_machine_id VARCHAR(50) NULL,
  conditions_json JSON NOT NULL,
  action_json JSON NOT NULL,
  reason_code VARCHAR(64) NOT NULL,
  operator_note TEXT NULL,
  checksum VARCHAR(64) NOT NULL,
  created_by VARCHAR(128) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  superseded_at DATETIME NULL,
  INDEX idx_route_rules_tenant (tenant_id, printhouse_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
