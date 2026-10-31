-- migrations/039_phase99_financial_operations_production_hardening.sql

CREATE TABLE IF NOT EXISTS financial_operations_hardening_runs (
    id VARCHAR(255) PRIMARY KEY,
    hardening_run_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255),
    sandbox_id VARCHAR(255),
    pilot_program_id VARCHAR(255),
    release_gate_id VARCHAR(255),
    readiness_run_id VARCHAR(255),
    hardening_status VARCHAR(50) NOT NULL,
    hardening_scope VARCHAR(50) NOT NULL,
    security_status VARCHAR(50) NOT NULL,
    configuration_status VARCHAR(50) NOT NULL,
    observability_status VARCHAR(50) NOT NULL,
    rollback_status VARCHAR(50) NOT NULL,
    incident_response_status VARCHAR(50) NOT NULL,
    audit_status VARCHAR(50) NOT NULL,
    blockers_json JSON,
    warnings_json JSON,
    evidence_json JSON,
    source_snapshot_json JSON,
    metadata_json JSON,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    completed_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS financial_operations_hardening_checks (
    id VARCHAR(255) PRIMARY KEY,
    hardening_run_id VARCHAR(255) NOT NULL,
    check_code VARCHAR(100) NOT NULL,
    check_label VARCHAR(255) NOT NULL,
    check_status VARCHAR(50) NOT NULL,
    category VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    required_for_production BOOLEAN DEFAULT TRUE,
    evidence_json JSON,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_operations_hardening_findings (
    id VARCHAR(255) PRIMARY KEY,
    hardening_run_id VARCHAR(255) NOT NULL,
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

CREATE TABLE IF NOT EXISTS financial_operations_hardening_audit_events (
    id VARCHAR(255) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    actor_id VARCHAR(255),
    actor_type VARCHAR(50) NOT NULL,
    hardening_run_id VARCHAR(255),
    sandbox_id VARCHAR(255),
    pilot_program_id VARCHAR(255),
    release_gate_id VARCHAR(255),
    readiness_run_id VARCHAR(255),
    tenant_id VARCHAR(255),
    payload_json JSON,
    created_at TIMESTAMP NOT NULL
);
