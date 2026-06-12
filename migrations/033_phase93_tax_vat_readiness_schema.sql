-- migrations/033_phase93_tax_vat_readiness_schema.sql

CREATE TABLE IF NOT EXISTS tax_vat_jurisdictions (
    id VARCHAR(255) PRIMARY KEY,
    jurisdiction_code VARCHAR(50) NOT NULL,
    country_code VARCHAR(2) NOT NULL,
    region_code VARCHAR(50),
    currency VARCHAR(10) NOT NULL,
    vat_system_type VARCHAR(50) NOT NULL,
    reverse_charge_supported BOOLEAN DEFAULT false,
    intra_eu_supported BOOLEAN DEFAULT false,
    marketplace_facilitator_supported BOOLEAN DEFAULT false,
    status VARCHAR(50) NOT NULL,
    metadata_json JSONB,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS tax_vat_rules (
    id VARCHAR(255) PRIMARY KEY,
    jurisdiction_id VARCHAR(255) NOT NULL,
    rule_code VARCHAR(100) NOT NULL,
    rule_type VARCHAR(50) NOT NULL,
    customer_type VARCHAR(50) NOT NULL,
    seller_type VARCHAR(50) NOT NULL,
    supply_type VARCHAR(50) NOT NULL,
    tax_treatment VARCHAR(100) NOT NULL,
    default_rate NUMERIC,
    reverse_charge_applicable BOOLEAN DEFAULT false,
    exemption_supported BOOLEAN DEFAULT false,
    effective_from TIMESTAMP NOT NULL,
    effective_to TIMESTAMP,
    status VARCHAR(50) NOT NULL,
    source_note TEXT,
    metadata_json JSONB,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS tax_vat_readiness_snapshots (
    id VARCHAR(255) PRIMARY KEY,
    snapshot_id VARCHAR(255) NOT NULL,
    order_id VARCHAR(255),
    invoice_id VARCHAR(255),
    tenant_id VARCHAR(255),
    reconciliation_run_id VARCHAR(255),
    jurisdiction_code VARCHAR(50),
    customer_country VARCHAR(2),
    seller_country VARCHAR(2),
    currency VARCHAR(10),
    taxable_amount NUMERIC,
    tax_amount_estimated NUMERIC,
    tax_rate_applied NUMERIC,
    tax_treatment VARCHAR(100),
    reverse_charge_flag BOOLEAN DEFAULT false,
    exemption_flag BOOLEAN DEFAULT false,
    readiness_status VARCHAR(50) NOT NULL,
    warnings_json JSONB,
    evidence_json JSONB,
    source_snapshot_json JSONB,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS tax_vat_readiness_findings (
    id VARCHAR(255) PRIMARY KEY,
    snapshot_id VARCHAR(255) NOT NULL,
    finding_code VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL,
    category VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    recommended_action TEXT,
    evidence_json JSONB,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS tax_vat_readiness_audit_events (
    id VARCHAR(255) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    actor_id VARCHAR(255),
    actor_type VARCHAR(50),
    order_id VARCHAR(255),
    invoice_id VARCHAR(255),
    tenant_id VARCHAR(255),
    snapshot_id VARCHAR(255),
    reconciliation_run_id VARCHAR(255),
    payload_json JSONB,
    created_at TIMESTAMP NOT NULL
);
