-- docs/migrations/printhouse_hardening.sql

-- 1. Add status and visibility to printer_nodes
ALTER TABLE printer_nodes
ADD COLUMN status ENUM('pending_review', 'active', 'suspended', 'rejected') DEFAULT 'pending_review' AFTER tenant_id,
ADD COLUMN marketplace_enabled BOOLEAN DEFAULT FALSE AFTER status,
ADD COLUMN accepting_jobs BOOLEAN DEFAULT FALSE AFTER marketplace_enabled,
ADD COLUMN visibility_scope ENUM('private', 'regional', 'global', 'invite_only') DEFAULT 'private' AFTER accepting_jobs;

-- 2. Add status to licenses
ALTER TABLE licenses
ADD COLUMN status ENUM('trial', 'active', 'expired', 'suspended') DEFAULT 'trial' AFTER license_key;

-- 3. Create Printhouse Capabilities table
CREATE TABLE IF NOT EXISTS printhouse_capabilities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    printhouse_id VARCHAR(50) NOT NULL,
    tenant_id VARCHAR(50) NOT NULL,
    
    -- Quantity ranges
    min_quantity INT DEFAULT 1,
    max_quantity INT DEFAULT 1000000,
    
    -- Structural capabilities
    hardcover_support BOOLEAN DEFAULT FALSE,
    softcover_support BOOLEAN DEFAULT FALSE,
    sewing_support BOOLEAN DEFAULT FALSE,
    lamination_support BOOLEAN DEFAULT FALSE,
    uv_support BOOLEAN DEFAULT FALSE,
    foil_support BOOLEAN DEFAULT FALSE,
    
    -- Technical specs
    max_sheet_size_width DECIMAL(10,2),
    max_sheet_size_height DECIMAL(10,2),
    
    -- Geographic & Strategic
    supported_countries JSON, -- Array of country codes
    lead_times_json JSON,     -- Default lead times per category
    certifications_json JSON, -- ISO, FSC, etc.
    sustainability_score INT DEFAULT 0,
    preferred_job_types JSON, -- ['books', 'magazines', 'flyers', etc.]
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY (printhouse_id),
    FOREIGN KEY (printhouse_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
);

-- 4. Audit Trail per Tenant (Enhanced)
ALTER TABLE api_audit_log
ADD INDEX idx_tenant_action (tenant_id, action);
