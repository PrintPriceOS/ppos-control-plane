-- migrations/009_marketplace_orchestration.sql
-- Idempotent Relational Persistence Layer for BPE / Manufacturing Marketplace Orchestration.

-- 1. Core Session Registry
CREATE TABLE IF NOT EXISTS job_marketplace_sessions (
    id VARCHAR(64) PRIMARY KEY,
    job_id VARCHAR(64) NOT NULL,
    order_id VARCHAR(64) NULL,
    tenant_id VARCHAR(128) NULL,
    source VARCHAR(64) NULL,
    source_ref VARCHAR(128) NULL,
    selection_mode ENUM('AUTO','ADMIN_OVERRIDE') DEFAULT 'AUTO',
    session_status ENUM('OPEN','SELECTED','CANCELLED','EXPIRED','FAILED') DEFAULT 'OPEN',
    selected_offer_id VARCHAR(64) NULL,
    pricing_engine VARCHAR(64) NULL,
    pricing_engine_trace_id VARCHAR(128) NULL,
    metadata_json JSON NULL,
    error_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_marketplace_job_id(job_id),
    INDEX idx_marketplace_order_id(order_id),
    INDEX idx_marketplace_tenant_id(tenant_id),
    INDEX idx_marketplace_source(source),
    INDEX idx_marketplace_source_ref(source_ref),
    INDEX idx_marketplace_status(session_status),
    INDEX idx_marketplace_selected_offer(selected_offer_id)
) ENGINE=InnoDB;

-- 2. Multitenant Factory Offers / Proposals
CREATE TABLE IF NOT EXISTS manufacturing_offers (
    id VARCHAR(64) PRIMARY KEY,
    job_id VARCHAR(64) NOT NULL,
    order_id VARCHAR(64) NULL,
    marketplace_session_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(128) NULL,
    printer_id VARCHAR(128) NULL,
    printer_name VARCHAR(255) NULL,
    house_id VARCHAR(128) NULL,
    machine_id VARCHAR(128) NULL,
    quote_id VARCHAR(128) NULL,
    routing_audit_id VARCHAR(128) NULL,
    economic_routing_audit_id VARCHAR(128) NULL,
    currency VARCHAR(8) DEFAULT 'EUR',
    production_cost DECIMAL(14,4) NULL,
    suggested_price DECIMAL(14,4) NULL,
    estimated_margin DECIMAL(14,4) NULL,
    margin_pct DECIMAL(10,4) NULL,
    lead_time_days INT NULL,
    production_lead_days INT NULL,
    shipping_days INT NULL,
    delivery_time VARCHAR(128) NULL,
    offer_expires_at DATETIME NULL,
    offer_status ENUM('PENDING','SENT','VIEWED','ACCEPTED','REJECTED','EXPIRED','CANCELLED','FAILED') DEFAULT 'PENDING',
    offer_rank INT NULL,
    offer_priority_score DECIMAL(10,4) NULL,
    offer_selected TINYINT(1) DEFAULT 0,
    raw_estimate_json JSON NULL,
    metadata_json JSON NULL,
    error_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_offer_job_id(job_id),
    INDEX idx_offer_order_id(order_id),
    INDEX idx_offer_session(marketplace_session_id),
    INDEX idx_offer_tenant_id(tenant_id),
    INDEX idx_offer_printer_id(printer_id),
    INDEX idx_offer_house_id(house_id),
    INDEX idx_offer_status(offer_status),
    INDEX idx_offer_selected(offer_selected),
    INDEX idx_offer_rank(offer_rank)
) ENGINE=InnoDB;

-- 3. Immutable Event Ledger
CREATE TABLE IF NOT EXISTS marketplace_events (
    id VARCHAR(64) PRIMARY KEY,
    job_id VARCHAR(64) NOT NULL,
    order_id VARCHAR(64) NULL,
    marketplace_session_id VARCHAR(64) NULL,
    offer_id VARCHAR(64) NULL,
    tenant_id VARCHAR(128) NULL,
    source VARCHAR(64) NULL,
    source_ref VARCHAR(128) NULL,
    event_type VARCHAR(64) NOT NULL,
    event_level ENUM('INFO','WARN','ERROR') DEFAULT 'INFO',
    message TEXT NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_event_job_id(job_id),
    INDEX idx_event_order_id(order_id),
    INDEX idx_event_session(marketplace_session_id),
    INDEX idx_event_offer_id(offer_id),
    INDEX idx_event_type(event_type),
    INDEX idx_event_created_at(created_at)
) ENGINE=InnoDB;

-- Ensure order_id exists idempotently for pre-existing deployments
-- ALTER TABLE job_marketplace_sessions ADD COLUMN IF NOT EXISTS order_id VARCHAR(64) NULL;
-- ALTER TABLE manufacturing_offers ADD COLUMN IF NOT EXISTS order_id VARCHAR(64) NULL;
-- ALTER TABLE marketplace_events ADD COLUMN IF NOT EXISTS order_id VARCHAR(64) NULL;

