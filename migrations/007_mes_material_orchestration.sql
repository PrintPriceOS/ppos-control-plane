-- migrations/007_mes_material_orchestration.sql
-- Goal: Harden predictive material inventory with real-time industrial depletion intelligence
-- and establish a formal machine compatibility mapping layer for the routing engine.

ALTER TABLE predictive_material_inventory ADD COLUMN daily_burn_rate DECIMAL(10,2) DEFAULT 0.00;
ALTER TABLE predictive_material_inventory ADD COLUMN forecasted_depletion_date TIMESTAMP NULL;
ALTER TABLE predictive_material_inventory ADD COLUMN procurement_risk VARCHAR(32) DEFAULT 'LOW';
ALTER TABLE predictive_material_inventory ADD COLUMN supplier_name VARCHAR(128) NULL;
ALTER TABLE predictive_material_inventory ADD COLUMN cost_per_unit DECIMAL(10,4) DEFAULT 0.0000;

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
