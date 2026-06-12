-- migrations/041_phase101_provider_connectivity_sandbox_readiness.sql

CREATE TABLE IF NOT EXISTS financial_operations_provider_sandboxes (
    id VARCHAR(255) PRIMARY KEY,
    provider_sandbox_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255),
    provider_key VARCHAR(100) NOT NULL,
    provider_type VARCHAR(100) NOT NULL,
    provider_name VARCHAR(255) NOT NULL,
    sandbox_status VARCHAR(50) NOT NULL,
    connectivity_mode VARCHAR(50) NOT NULL,
    allowed_operation_types_json JSONB,
    blocked_operation_types_json JSONB,
    credentials_mode VARCHAR(50) NOT NULL,
    credential_reference VARCHAR(255),
    live_credentials_present BOOLEAN DEFAULT FALSE,
    sandbox_credentials_present BOOLEAN DEFAULT FALSE,
    live_provider_connectivity_enabled BOOLEAN DEFAULT FALSE,
    sandbox_only BOOLEAN DEFAULT TRUE,
    mock_provider_enabled BOOLEAN DEFAULT TRUE,
    stubbed_provider_enabled BOOLEAN DEFAULT TRUE,
    full_public_enabled BOOLEAN DEFAULT FALSE,
    evidence_json JSONB,
    metadata_json JSONB,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    activated_at TIMESTAMP,
    activated_by VARCHAR(255),
    suspended_at TIMESTAMP,
    suspended_by VARCHAR(255),
    revoked_at TIMESTAMP,
    revoked_by VARCHAR(255),
    closed_at TIMESTAMP,
    closed_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS financial_operations_provider_sandbox_connection_tests (
    id VARCHAR(255) PRIMARY KEY,
    connection_test_id VARCHAR(255) NOT NULL,
    provider_sandbox_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255),
    provider_key VARCHAR(100) NOT NULL,
    provider_type VARCHAR(100) NOT NULL,
    test_status VARCHAR(50) NOT NULL,
    connectivity_mode VARCHAR(50) NOT NULL,
    operation_type VARCHAR(100) NOT NULL,
    request_payload_json JSONB,
    response_payload_json JSONB,
    blockers_json JSONB,
    warnings_json JSONB,
    evidence_json JSONB,
    result_snapshot_json JSONB,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    completed_at TIMESTAMP,
    completed_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS financial_operations_provider_sandbox_findings (
    id VARCHAR(255) PRIMARY KEY,
    provider_sandbox_id VARCHAR(255) NOT NULL,
    connection_test_id VARCHAR(255),
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

CREATE TABLE IF NOT EXISTS financial_operations_provider_sandbox_audit_events (
    id VARCHAR(255) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    actor_id VARCHAR(255),
    actor_type VARCHAR(50) NOT NULL,
    provider_sandbox_id VARCHAR(255),
    connection_test_id VARCHAR(255),
    tenant_id VARCHAR(255),
    provider_key VARCHAR(100),
    provider_type VARCHAR(100),
    payload_json JSONB,
    created_at TIMESTAMP NOT NULL
);
