-- migrations/004_restore_intelligence_schema.sql
-- Phase 23 Industrial Hardening: Restoring missing intelligence tables for audit compliance

-- 1. Restore Phase 13-14 Predictive & Digital Twin tables
CREATE TABLE IF NOT EXISTS predictive_bottleneck_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    resource_id VARCHAR(64) NOT NULL,
    forecast_type VARCHAR(32) DEFAULT 'BOTTLENECK',
    probability FLOAT DEFAULT 0.0,
    severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'LOW',
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tenant_resource (tenant_id, resource_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS material_availability_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    material_sku VARCHAR(64) NOT NULL,
    quantity_available DECIMAL(18,4) DEFAULT 0,
    forecast_date DATE NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tenant_sku (tenant_id, material_sku)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS digital_twin_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    entity_type ENUM('MACHINE', 'FACTORY', 'FLEET', 'GLOBAL') NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    state_json JSON NOT NULL,
    drift_score FLOAT DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_entity (entity_type, entity_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS anomaly_detection_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    source_type VARCHAR(64) NOT NULL,
    source_id VARCHAR(64) NOT NULL,
    anomaly_type VARCHAR(64) NOT NULL,
    severity ENUM('INFO', 'WARNING', 'CRITICAL') DEFAULT 'WARNING',
    evidence_json JSON NULL,
    is_resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tenant_source (tenant_id, source_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS failure_prediction_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    machine_id VARCHAR(64) NOT NULL,
    component_id VARCHAR(64) NOT NULL,
    failure_probability FLOAT DEFAULT 0.0,
    estimated_time_to_failure_hours INT NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_machine_component (machine_id, component_id)
) ENGINE=InnoDB;

-- 2. Restore Phase 15 Economic & Swarm tables
CREATE TABLE IF NOT EXISTS economic_optimization_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    optimization_type VARCHAR(32) DEFAULT 'GLOBAL',
    efficiency_gain FLOAT DEFAULT 0.0,
    cost_reduction_value DECIMAL(18,2) DEFAULT 0.0,
    metrics_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS swarm_coordination_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    swarm_id VARCHAR(64) NOT NULL,
    consensus_state VARCHAR(64) NOT NULL,
    active_nodes_count INT DEFAULT 0,
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_swarm (swarm_id)
) ENGINE=InnoDB;

-- 3. Restore Phase 16 Federation tables
CREATE TABLE IF NOT EXISTS federation_registry (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    endpoint_url VARCHAR(512) NOT NULL,
    status ENUM('ACTIVE', 'DEGRADED', 'OFFLINE') DEFAULT 'ACTIVE',
    trust_score FLOAT DEFAULT 1.0,
    capabilities_json JSON NULL,
    last_heartbeat_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS federation_delegation_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_id VARCHAR(64) NOT NULL,
    source_node_id VARCHAR(64) NOT NULL,
    target_node_id VARCHAR(64) NOT NULL,
    delegation_type VARCHAR(32) NOT NULL,
    status ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'FAILED') DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_job (job_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS federated_twin_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    federation_id VARCHAR(64) NOT NULL,
    global_state_json JSON NOT NULL,
    coherence_score FLOAT DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_federation (federation_id)
) ENGINE=InnoDB;

-- 4. Restore Phase 17 Marketplace tables
CREATE TABLE IF NOT EXISTS marketplace_listings (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    listing_type ENUM('CAPACITY', 'MATERIAL', 'SERVICE') NOT NULL,
    description TEXT NULL,
    quantity DECIMAL(18,4) NOT NULL,
    unit_price DECIMAL(18,2) NOT NULL,
    status ENUM('OPEN', 'FILLED', 'CANCELLED', 'EXPIRED') DEFAULT 'OPEN',
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tenant_type (tenant_id, listing_type)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS marketplace_bids (
    id VARCHAR(64) PRIMARY KEY,
    listing_id VARCHAR(64) NOT NULL,
    bidder_tenant_id VARCHAR(64) NOT NULL,
    bid_amount DECIMAL(18,2) NOT NULL,
    status ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN') DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_listing (listing_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS marketplace_trade_ledger (
    id INT AUTO_INCREMENT PRIMARY KEY,
    listing_id VARCHAR(64) NOT NULL,
    seller_tenant_id VARCHAR(64) NOT NULL,
    buyer_tenant_id VARCHAR(64) NOT NULL,
    transaction_amount DECIMAL(18,2) NOT NULL,
    transaction_status VARCHAR(32) DEFAULT 'COMPLETED',
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_trade (seller_tenant_id, buyer_tenant_id)
) ENGINE=InnoDB;

-- 5. Restore Phase 18 Governance tables
CREATE TABLE IF NOT EXISTS governance_policy_registry (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    policy_type ENUM('SECURITY', 'ETHICS', 'ORCHESTRATION', 'ECONOMIC') NOT NULL,
    rules_json JSON NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    version INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS governance_audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    policy_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    decision ENUM('ALLOW', 'BLOCK', 'ADVISE', 'OVERRIDE') NOT NULL,
    reasoning TEXT NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_policy (policy_id)
) ENGINE=InnoDB;

-- 6. Restore Phase 19 Civilization tables
CREATE TABLE IF NOT EXISTS civilization_state_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    civilization_tier INT DEFAULT 1,
    resource_equilibrium_score FLOAT DEFAULT 1.0,
    stability_index FLOAT DEFAULT 1.0,
    state_json JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 7. Add missing columns to manufacturing_dispatches
-- Note: Using a procedure to safely add columns if they don't exist
DELIMITER //
CREATE PROCEDURE AddMissingIndustrialColumns()
BEGIN
    IF NOT EXISTS (SELECT * FROM information_schema.columns WHERE table_name = 'manufacturing_dispatches' AND column_name = 'federation_node_id' AND table_schema = DATABASE()) THEN
        ALTER TABLE manufacturing_dispatches ADD COLUMN federation_node_id VARCHAR(64) NULL;
    END IF;
    
    IF NOT EXISTS (SELECT * FROM information_schema.columns WHERE table_name = 'manufacturing_dispatches' AND column_name = 'governance_policy_score' AND table_schema = DATABASE()) THEN
        ALTER TABLE manufacturing_dispatches ADD COLUMN governance_policy_score FLOAT DEFAULT 0.0;
    END IF;
END //
DELIMITER ;

CALL AddMissingIndustrialColumns();
DROP PROCEDURE AddMissingIndustrialColumns;
