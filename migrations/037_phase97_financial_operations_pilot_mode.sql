-- migrations/037_phase97_financial_operations_pilot_mode.sql

CREATE TABLE IF NOT EXISTS financial_operations_pilot_programs (
    id VARCHAR(255) PRIMARY KEY,
    pilot_program_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255),
    program_name VARCHAR(255) NOT NULL,
    program_status VARCHAR(50) NOT NULL,
    pilot_scope VARCHAR(50) NOT NULL,
    allowed_operation_types_json JSON,
    blocked_operation_types_json JSON,
    max_orders INT,
    max_invoices INT,
    max_total_amount DECIMAL(15, 2),
    currency VARCHAR(10),
    requires_manual_approval BOOLEAN DEFAULT TRUE,
    dry_run_only BOOLEAN DEFAULT TRUE,
    external_execution_enabled BOOLEAN DEFAULT FALSE,
    full_public_enabled BOOLEAN DEFAULT FALSE,
    evidence_json JSON,
    metadata_json JSON,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    activated_at TIMESTAMP,
    activated_by VARCHAR(255),
    suspended_at TIMESTAMP,
    suspended_by VARCHAR(255),
    closed_at TIMESTAMP,
    closed_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS financial_operations_pilot_runs (
    id VARCHAR(255) PRIMARY KEY,
    pilot_run_id VARCHAR(255) NOT NULL,
    pilot_program_id VARCHAR(255) NOT NULL,
    release_gate_id VARCHAR(255),
    readiness_run_id VARCHAR(255),
    tenant_id VARCHAR(255),
    order_id VARCHAR(255),
    invoice_id VARCHAR(255),
    operation_type VARCHAR(100) NOT NULL,
    run_status VARCHAR(50) NOT NULL,
    execution_mode VARCHAR(50) NOT NULL,
    amount DECIMAL(15, 2),
    currency VARCHAR(10),
    blockers_json JSON,
    warnings_json JSON,
    evidence_json JSON,
    source_snapshot_json JSON,
    result_snapshot_json JSON,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    completed_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS financial_operations_pilot_approvals (
    id VARCHAR(255) PRIMARY KEY,
    pilot_run_id VARCHAR(255) NOT NULL,
    approval_id VARCHAR(255) NOT NULL,
    approver_id VARCHAR(255) NOT NULL,
    approver_role VARCHAR(50) NOT NULL,
    approval_status VARCHAR(50) NOT NULL,
    approval_note TEXT,
    evidence_json JSON,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    revoked_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS financial_operations_pilot_findings (
    id VARCHAR(255) PRIMARY KEY,
    pilot_run_id VARCHAR(255) NOT NULL,
    finding_code VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    category VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    recommended_action TEXT,
    evidence_json JSON,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS financial_operations_pilot_audit_events (
    id VARCHAR(255) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    actor_id VARCHAR(255),
    actor_type VARCHAR(50) NOT NULL,
    pilot_program_id VARCHAR(255),
    pilot_run_id VARCHAR(255),
    release_gate_id VARCHAR(255),
    readiness_run_id VARCHAR(255),
    tenant_id VARCHAR(255),
    order_id VARCHAR(255),
    invoice_id VARCHAR(255),
    payload_json JSON,
    created_at TIMESTAMP NOT NULL
);
