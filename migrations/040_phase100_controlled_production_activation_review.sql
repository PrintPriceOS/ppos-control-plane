-- migrations/040_phase100_controlled_production_activation_review.sql

CREATE TABLE IF NOT EXISTS financial_operations_production_activation_reviews (
    id VARCHAR(255) PRIMARY KEY,
    activation_review_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255),
    hardening_run_id VARCHAR(255),
    sandbox_id VARCHAR(255),
    pilot_program_id VARCHAR(255),
    release_gate_id VARCHAR(255),
    readiness_run_id VARCHAR(255),
    review_status VARCHAR(50) NOT NULL,
    review_scope VARCHAR(50) NOT NULL,
    security_status VARCHAR(50) NOT NULL,
    operational_status VARCHAR(50) NOT NULL,
    compliance_readiness_status VARCHAR(50) NOT NULL,
    audit_status VARCHAR(50) NOT NULL,
    rollback_status VARCHAR(50) NOT NULL,
    go_no_go_status VARCHAR(50) NOT NULL,
    required_approvals INT DEFAULT 1,
    current_approvals INT DEFAULT 0,
    blockers_json JSONB,
    warnings_json JSONB,
    evidence_json JSONB,
    source_snapshot_json JSONB,
    metadata_json JSONB,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    completed_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS financial_operations_production_activation_review_checks (
    id VARCHAR(255) PRIMARY KEY,
    activation_review_id VARCHAR(255) NOT NULL,
    check_code VARCHAR(100) NOT NULL,
    check_label VARCHAR(255) NOT NULL,
    check_status VARCHAR(50) NOT NULL,
    category VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    required_for_activation_review BOOLEAN DEFAULT TRUE,
    evidence_json JSONB,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_operations_production_activation_review_findings (
    id VARCHAR(255) PRIMARY KEY,
    activation_review_id VARCHAR(255) NOT NULL,
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

CREATE TABLE IF NOT EXISTS financial_operations_production_activation_review_approvals (
    id VARCHAR(255) PRIMARY KEY,
    activation_review_id VARCHAR(255) NOT NULL,
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

CREATE TABLE IF NOT EXISTS financial_operations_production_activation_review_audit_events (
    id VARCHAR(255) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    actor_id VARCHAR(255),
    actor_type VARCHAR(50) NOT NULL,
    activation_review_id VARCHAR(255),
    hardening_run_id VARCHAR(255),
    sandbox_id VARCHAR(255),
    pilot_program_id VARCHAR(255),
    release_gate_id VARCHAR(255),
    readiness_run_id VARCHAR(255),
    tenant_id VARCHAR(255),
    payload_json JSONB,
    created_at TIMESTAMP NOT NULL
);
