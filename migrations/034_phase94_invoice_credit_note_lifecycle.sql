-- migrations/034_phase94_invoice_credit_note_lifecycle.sql

CREATE TABLE IF NOT EXISTS governed_invoices (
    id VARCHAR(255) PRIMARY KEY,
    invoice_id VARCHAR(255) NOT NULL,
    order_id VARCHAR(255),
    tenant_id VARCHAR(255),
    customer_id VARCHAR(255),
    seller_tenant_id VARCHAR(255),
    reconciliation_run_id VARCHAR(255),
    tax_vat_snapshot_id VARCHAR(255),
    invoice_number VARCHAR(255),
    invoice_type VARCHAR(50) NOT NULL,
    lifecycle_status VARCHAR(50) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    subtotal_amount NUMERIC NOT NULL,
    tax_amount NUMERIC NOT NULL,
    total_amount NUMERIC NOT NULL,
    source_snapshot_json JSONB,
    tax_readiness_snapshot_json JSONB,
    reconciliation_snapshot_json JSONB,
    metadata_json JSONB,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    finalized_at TIMESTAMP,
    finalized_by VARCHAR(255),
    voided_at TIMESTAMP,
    voided_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS governed_invoice_versions (
    id VARCHAR(255) PRIMARY KEY,
    invoice_id VARCHAR(255) NOT NULL,
    version_number INTEGER NOT NULL,
    lifecycle_status VARCHAR(50) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    subtotal_amount NUMERIC NOT NULL,
    tax_amount NUMERIC NOT NULL,
    total_amount NUMERIC NOT NULL,
    invoice_payload_json JSONB,
    change_reason TEXT,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS governed_credit_notes (
    id VARCHAR(255) PRIMARY KEY,
    credit_note_id VARCHAR(255) NOT NULL,
    invoice_id VARCHAR(255) NOT NULL,
    order_id VARCHAR(255),
    tenant_id VARCHAR(255),
    credit_note_number VARCHAR(255),
    lifecycle_status VARCHAR(50) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    subtotal_amount NUMERIC NOT NULL,
    tax_amount NUMERIC NOT NULL,
    total_amount NUMERIC NOT NULL,
    reason_code VARCHAR(100) NOT NULL,
    reason_note TEXT,
    source_invoice_snapshot_json JSONB,
    metadata_json JSONB,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    finalized_at TIMESTAMP,
    finalized_by VARCHAR(255),
    voided_at TIMESTAMP,
    voided_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS governed_credit_note_versions (
    id VARCHAR(255) PRIMARY KEY,
    credit_note_id VARCHAR(255) NOT NULL,
    version_number INTEGER NOT NULL,
    lifecycle_status VARCHAR(50) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    subtotal_amount NUMERIC NOT NULL,
    tax_amount NUMERIC NOT NULL,
    total_amount NUMERIC NOT NULL,
    credit_note_payload_json JSONB,
    change_reason TEXT,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_credit_note_links (
    id VARCHAR(255) PRIMARY KEY,
    invoice_id VARCHAR(255) NOT NULL,
    credit_note_id VARCHAR(255) NOT NULL,
    link_type VARCHAR(50) NOT NULL,
    amount_applied NUMERIC NOT NULL,
    currency VARCHAR(10) NOT NULL,
    metadata_json JSONB,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_lifecycle_audit_events (
    id VARCHAR(255) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    actor_id VARCHAR(255),
    actor_type VARCHAR(50) NOT NULL,
    invoice_id VARCHAR(255),
    credit_note_id VARCHAR(255),
    order_id VARCHAR(255),
    tenant_id VARCHAR(255),
    reconciliation_run_id VARCHAR(255),
    tax_vat_snapshot_id VARCHAR(255),
    payload_json JSONB,
    created_at TIMESTAMP NOT NULL
);
