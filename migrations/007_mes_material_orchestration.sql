-- migrations/007_mes_material_orchestration.sql
-- Goal: Harden predictive material inventory with real-time industrial depletion intelligence,
-- materials catalog, operational stock events, manufacturing reservations, and supplier procurements.

CREATE TABLE IF NOT EXISTS materials_catalog (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'ppos-production',
    printhouse_id VARCHAR(64) NULL,
    material_name VARCHAR(128) NOT NULL,
    material_type VARCHAR(64) NOT NULL,
    substrate_class VARCHAR(64) NULL,
    gsm INT NULL,
    sheet_format VARCHAR(64) NULL,
    finish_type VARCHAR(64) NULL,
    supplier_name VARCHAR(128) NULL,
    supplier_country VARCHAR(64) NULL,
    cost_per_unit DECIMAL(10,4) DEFAULT 0.0000,
    unit_name VARCHAR(32) DEFAULT 'sheets',
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tenant (tenant_id),
    INDEX idx_printhouse (printhouse_id)
) ENGINE=InnoDB;

-- Ensure required columns exist on predictive_material_inventory gracefully
ALTER TABLE predictive_material_inventory ADD COLUMN IF NOT EXISTS material_catalog_id VARCHAR(64) NULL;
ALTER TABLE predictive_material_inventory ADD COLUMN IF NOT EXISTS available_units INT DEFAULT 0;
ALTER TABLE predictive_material_inventory ADD COLUMN IF NOT EXISTS reorder_point INT DEFAULT 100;
ALTER TABLE predictive_material_inventory ADD COLUMN IF NOT EXISTS replenishment_lead_days INT DEFAULT 7;
ALTER TABLE predictive_material_inventory ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'STABLE';
ALTER TABLE predictive_material_inventory ADD COLUMN IF NOT EXISTS machine_lock VARCHAR(64) NULL;
ALTER TABLE predictive_material_inventory ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) NOT NULL DEFAULT 'ppos-production';
ALTER TABLE predictive_material_inventory ADD COLUMN IF NOT EXISTS printhouse_id VARCHAR(64) NULL;

ALTER TABLE predictive_material_inventory ADD COLUMN IF NOT EXISTS daily_burn_rate DECIMAL(10,2) DEFAULT 0.00;
ALTER TABLE predictive_material_inventory ADD COLUMN IF NOT EXISTS forecasted_depletion_date TIMESTAMP NULL;
ALTER TABLE predictive_material_inventory ADD COLUMN IF NOT EXISTS procurement_risk VARCHAR(32) DEFAULT 'LOW';
ALTER TABLE predictive_material_inventory ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(128) NULL;
ALTER TABLE predictive_material_inventory ADD COLUMN IF NOT EXISTS cost_per_unit DECIMAL(10,4) DEFAULT 0.0000;

CREATE TABLE IF NOT EXISTS material_machine_compatibility (
    id INT AUTO_INCREMENT PRIMARY KEY,
    material_id VARCHAR(64) NOT NULL,
    machine_profile_id VARCHAR(64) NOT NULL,
    compatibility_status ENUM('OPTIMAL', 'CERTIFIED', 'SUPPORTED', 'EXPERIMENTAL', 'UNSUPPORTED') DEFAULT 'OPTIMAL',
    wear_factor DECIMAL(3,2) DEFAULT 1.00,
    max_speed_ppm INT NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_mat_machine (material_id, machine_profile_id),
    INDEX idx_material (material_id),
    INDEX idx_machine (machine_profile_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS material_inventory_events (
    id VARCHAR(64) PRIMARY KEY,
    material_inventory_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(32) NOT NULL,
    quantity_units INT NOT NULL,
    before_stock INT NOT NULL,
    after_stock INT NOT NULL,
    job_id VARCHAR(64) NULL,
    dispatch_id VARCHAR(64) NULL,
    operator_id VARCHAR(64) NULL,
    reason TEXT NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_inventory (material_inventory_id),
    INDEX idx_event_type (event_type),
    INDEX idx_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS manufacturing_material_reservations (
    id VARCHAR(64) PRIMARY KEY,
    material_inventory_id VARCHAR(64) NOT NULL,
    job_id VARCHAR(64) NULL,
    dispatch_id VARCHAR(64) NULL,
    reserved_units INT NOT NULL,
    reservation_status VARCHAR(32) DEFAULT 'ACTIVE',
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_inventory (material_inventory_id),
    INDEX idx_dispatch (dispatch_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS material_procurements (
    id VARCHAR(64) PRIMARY KEY,
    material_inventory_id VARCHAR(64) NOT NULL,
    supplier_name VARCHAR(128) NULL,
    ordered_units INT NOT NULL,
    expected_delivery_date TIMESTAMP NULL,
    procurement_status VARCHAR(32) DEFAULT 'ORDERED',
    procurement_risk VARCHAR(32) DEFAULT 'LOW',
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_inventory (material_inventory_id)
) ENGINE=InnoDB;
