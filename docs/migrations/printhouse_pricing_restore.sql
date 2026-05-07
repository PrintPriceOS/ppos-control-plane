-- docs/migrations/printhouse_pricing_restore.sql

-- 1. Add missing columns to printer_nodes for full metadata and legacy rates storage
ALTER TABLE printer_nodes
ADD COLUMN signatures JSON NULL AFTER city,
ADD COLUMN delivery_time VARCHAR(64) NULL AFTER signatures,
ADD COLUMN production_lead_days INT DEFAULT 0 AFTER delivery_time,
ADD COLUMN limits JSON NULL AFTER production_lead_days,
ADD COLUMN rates_json JSON NULL AFTER limits;

-- 2. Create printer_machines if missing (dependency for pricing profiles)
CREATE TABLE IF NOT EXISTS printer_machines (
    id INT AUTO_INCREMENT PRIMARY KEY,
    printer_id VARCHAR(64) NOT NULL,
    nickname VARCHAR(255) NOT NULL,
    type VARCHAR(64) NULL,
    status VARCHAR(64) DEFAULT 'ACTIVE',
    FOREIGN KEY (printer_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 3. Create printer_pricing_profiles for normalized machine-level pricing
CREATE TABLE IF NOT EXISTS printer_pricing_profiles (
    id VARCHAR(64) PRIMARY KEY,
    printer_id VARCHAR(64) NOT NULL,
    machine_id INT NULL,
    pricing_scope ENUM('PRINTER', 'MACHINE') DEFAULT 'PRINTER',
    currency VARCHAR(10) DEFAULT 'EUR',
    
    -- Economic Model
    base_cost_per_sheet DECIMAL(12,4) DEFAULT 0,
    setup_cost DECIMAL(12,4) DEFAULT 0,
    color_multiplier DECIMAL(6,4) DEFAULT 1.0,
    tac_penalty_multiplier DECIMAL(6,4) DEFAULT 1.0,
    bleed_handling_cost DECIMAL(12,4) DEFAULT 0,
    rush_multiplier DECIMAL(6,4) DEFAULT 1.5,
    lead_time_discount_multiplier DECIMAL(6,4) DEFAULT 0.9,
    minimum_job_fee DECIMAL(12,4) DEFAULT 0,
    
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (printer_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. Add email to printer_nodes if missing (it was in onboarding but check hardening)
-- In onboarding.sql it is already defined as UNIQUE NOT NULL.

-- 5. Audit Log for Pricing Changes
ALTER TABLE api_audit_log
MODIFY COLUMN action VARCHAR(255);
