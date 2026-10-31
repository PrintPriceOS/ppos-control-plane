-- migrations/140_phase191e_materials_capacity_leadtimes.sql
-- Goal: Implement relational structure for materials catalog, machine compatibility mapping, indicative capacity, and localized production lead times.

-- 1. Ensure unique key indexes for composite foreign keys to target
ALTER TABLE materials_catalog ADD UNIQUE KEY uk_mat_cat_id_tenant (id, tenant_id);
ALTER TABLE printhouse_machines ADD UNIQUE KEY uk_pm_id_tenant (id, tenant_id);

-- 2. Create printhouse_machine_materials junction table
CREATE TABLE IF NOT EXISTS printhouse_machine_materials (
    machine_id VARCHAR(50) NOT NULL,
    material_catalog_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    compatibility_provenance VARCHAR(256) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (machine_id, material_catalog_id),
    CONSTRAINT fk_mm_machine FOREIGN KEY (machine_id, tenant_id) 
        REFERENCES printhouse_machines (id, tenant_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_mm_material FOREIGN KEY (material_catalog_id, tenant_id) 
        REFERENCES materials_catalog (id, tenant_id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Create printhouse_site_capacities table
CREATE TABLE IF NOT EXISTS printhouse_site_capacities (
    id VARCHAR(50) NOT NULL,
    printhouse_id VARCHAR(50) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    daily_jobs_limit INT NULL,
    daily_sheets_limit INT NULL,
    working_days_per_week INT NULL,
    operating_hours_per_day DECIMAL(4,2) NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_site_capacities_site_tenant (printhouse_id, tenant_id),
    CONSTRAINT fk_site_capacities_site FOREIGN KEY (printhouse_id, tenant_id)
        REFERENCES printer_nodes (id, tenant_id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Create printhouse_site_lead_times table
CREATE TABLE IF NOT EXISTS printhouse_site_lead_times (
    id VARCHAR(50) NOT NULL,
    printhouse_id VARCHAR(50) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
    workdays_json JSON NOT NULL,
    daily_cutoff_time VARCHAR(5) NOT NULL DEFAULT '14:00',
    base_lead_time_days INT NOT NULL DEFAULT 3,
    custom_rules_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_site_lead_times_site_tenant (printhouse_id, tenant_id),
    CONSTRAINT fk_site_lead_times_site FOREIGN KEY (printhouse_id, tenant_id)
        REFERENCES printer_nodes (id, tenant_id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Alter printhouse_machines to add machine-specific capacity
ALTER TABLE printhouse_machines ADD COLUMN indicative_daily_capacity INT NULL;
ALTER TABLE printhouse_machines ADD COLUMN capacity_unit_name VARCHAR(32) DEFAULT 'impressions';
