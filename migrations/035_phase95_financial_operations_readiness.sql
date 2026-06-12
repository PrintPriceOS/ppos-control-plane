-- migrations/035_phase95_financial_operations_readiness.sql

CREATE TABLE IF NOT EXISTS financial_operations_readiness_runs (
    id VARCHAR(255) PRIMARY KEY,
    readiness_run_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255),
    order_id VARCHAR(255),
    invoice_id VARCHAR(255),
    reconciliation_run_id VARCHAR(255),
    tax_vat_snapshot_id VARCHAR(255),
    governed_invoice_id VARCHAR(255),
    governed_credit_note_id VARCHAR(255),
    readiness_status VARCHAR(50) NOT NULL,
    reconciliation_status VARCHAR(50) NOT NULL,
    tax_vat_status VARCHAR(50) NOT NULL,
    invoice_status VARCHAR(50) NOT NULL,
    credit_note_status VARCHAR(50) NOT NULL,
    accounting_export_status VARCHAR(50) NOT NULL,
    blockers_json JSONB,
    warnings_json JSONB,
    evidence_json JSONB,
    source_snapshot_json JSONB,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_operations_readiness_findings (
    id VARCHAR(255) PRIMARY KEY,
    readiness_run_id VARCHAR(255) NOT NULL,
    finding_code VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    category VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    recommended_action TEXT,
    evidence_json JSONB,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS financial_operations_readiness_checklist (
    id VARCHAR(255) PRIMARY KEY,
    readiness_run_id VARCHAR(255) NOT NULL,
    checklist_code VARCHAR(100) NOT NULL,
    checklist_label VARCHAR(255) NOT NULL,
    checklist_status VARCHAR(50) NOT NULL,
    required_for_launch BOOLEAN NOT NULL DEFAULT FALSE,
    evidence_json JSONB,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_operations_readiness_audit_events (
    id VARCHAR(255) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    actor_id VARCHAR(255),
    actor_type VARCHAR(50) NOT NULL,
    readiness_run_id VARCHAR(255),
    order_id VARCHAR(255),
    invoice_id VARCHAR(255),
    tenant_id VARCHAR(255),
    reconciliation_run_id VARCHAR(255),
    tax_vat_snapshot_id VARCHAR(255),
    governed_invoice_id VARCHAR(255),
    governed_credit_note_id VARCHAR(255),
    payload_json JSONB,
    created_at TIMESTAMP NOT NULL
);
