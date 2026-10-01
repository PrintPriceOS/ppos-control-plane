-- migrations/154_phase195b_machine_specific_costing.sql
-- Phase 195B: Governed Machine-Specific Costing & Setup Data Model
-- Establishes cost ownership, versioned pricing profiles, setup/run cost drivers, and readiness for individual machines.

ALTER TABLE printhouse_machines
  ADD UNIQUE INDEX uk_machines_id_tenant (id, tenant_id);

CREATE TABLE IF NOT EXISTS printhouse_machine_pricing_profiles (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    printhouse_id VARCHAR(64) NOT NULL,
    machine_id VARCHAR(64) NOT NULL,
    version INT NOT NULL DEFAULT 1,
    technology VARCHAR(64) NOT NULL DEFAULT 'DIGITAL_SHEETFED',
    currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    costs_json JSON NOT NULL,
    viability_json JSON NULL,
    checksum VARCHAR(64) NOT NULL,
    created_by_json JSON NULL,
    created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6),
    superseded_at TIMESTAMP(6) NULL,

    INDEX idx_machine_profiles_lookup (tenant_id, machine_id, status),
    INDEX idx_printhouse_profiles_lookup (tenant_id, printhouse_id),
    FOREIGN KEY (machine_id, tenant_id) REFERENCES printhouse_machines (id, tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (printhouse_id, tenant_id) REFERENCES printer_nodes (id, tenant_id) ON DELETE CASCADE
) ENGINE=InnoDB;
