-- migrations/036_phase96_financial_operations_release_gates.sql

CREATE TABLE IF NOT EXISTS financial_operations_release_gates (
    id VARCHAR(255) PRIMARY KEY,
    release_gate_id VARCHAR(255) NOT NULL,
    readiness_run_id VARCHAR(255),
    tenant_id VARCHAR(255),
    order_id VARCHAR(255),
    invoice_id VARCHAR(255),
    gate_status VARCHAR(50) NOT NULL,
    gate_type VARCHAR(50) NOT NULL,
    gate_scope VARCHAR(50) NOT NULL,
    required_approvals INT NOT NULL DEFAULT 1,
    current_approvals INT NOT NULL DEFAULT 0,
    blockers_json JSONB,
    warnings_json JSONB,
    evidence_json JSONB,
    source_readiness_snapshot_json JSONB,
    metadata_json JSONB,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    approved_at TIMESTAMP,
    approved_by VARCHAR(255),
    blocked_at TIMESTAMP,
    blocked_by VARCHAR(255),
    revoked_at TIMESTAMP,
    revoked_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS financial_operations_release_gate_checks (
    id VARCHAR(255) PRIMARY KEY,
    release_gate_id VARCHAR(255) NOT NULL,
    check_code VARCHAR(100) NOT NULL,
    check_label VARCHAR(255) NOT NULL,
    check_status VARCHAR(50) NOT NULL,
    required_for_release BOOLEAN NOT NULL DEFAULT FALSE,
    severity VARCHAR(20) NOT NULL,
    evidence_json JSONB,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_operations_release_gate_approvals (
    id VARCHAR(255) PRIMARY KEY,
    release_gate_id VARCHAR(255) NOT NULL,
    approval_id VARCHAR(255) NOT NULL,
    approver_id VARCHAR(255) NOT NULL,
    approver_role VARCHAR(50) NOT NULL,
    approval_status VARCHAR(50) NOT NULL,
    approval_note TEXT,
    evidence_json JSONB,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    revoked_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS financial_operations_release_gate_audit_events (
    id VARCHAR(255) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    actor_id VARCHAR(255),
    actor_type VARCHAR(50) NOT NULL,
    release_gate_id VARCHAR(255),
    readiness_run_id VARCHAR(255),
    tenant_id VARCHAR(255),
    order_id VARCHAR(255),
    invoice_id VARCHAR(255),
    payload_json JSONB,
    created_at TIMESTAMP NOT NULL
);
