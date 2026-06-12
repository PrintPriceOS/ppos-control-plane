-- migrations/042_phase102_provider_contract_sla_readiness.sql

CREATE TABLE IF NOT EXISTS financial_operations_provider_contracts (
    id VARCHAR(255) PRIMARY KEY,
    provider_contract_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255),
    provider_sandbox_id VARCHAR(255),
    provider_key VARCHAR(100) NOT NULL,
    provider_type VARCHAR(100) NOT NULL,
    provider_name VARCHAR(255) NOT NULL,
    contract_status VARCHAR(50) NOT NULL,
    contract_scope TEXT,
    contract_reference VARCHAR(255),
    contract_version VARCHAR(50),
    effective_from TIMESTAMP,
    effective_to TIMESTAMP,
    signed_at TIMESTAMP,
    signed_by VARCHAR(255),
    legal_review_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    finance_review_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    security_review_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    operations_review_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    data_processing_review_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    evidence_json JSONB,
    metadata_json JSONB,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    approved_at TIMESTAMP,
    approved_by VARCHAR(255),
    rejected_at TIMESTAMP,
    rejected_by VARCHAR(255),
    revoked_at TIMESTAMP,
    revoked_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS financial_operations_provider_slas (
    id VARCHAR(255) PRIMARY KEY,
    provider_sla_id VARCHAR(255) NOT NULL,
    provider_contract_id VARCHAR(255) NOT NULL,
    provider_sandbox_id VARCHAR(255),
    provider_key VARCHAR(100) NOT NULL,
    provider_type VARCHAR(100) NOT NULL,
    sla_status VARCHAR(50) NOT NULL,
    uptime_target VARCHAR(10),
    response_time_target VARCHAR(50),
    incident_response_target VARCHAR(50),
    support_hours VARCHAR(100),
    escalation_path_json JSONB,
    monitoring_requirements_json JSONB,
    rollback_requirements_json JSONB,
    rate_limit_commitments_json JSONB,
    evidence_json JSONB,
    metadata_json JSONB,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    approved_at TIMESTAMP,
    approved_by VARCHAR(255),
    revoked_at TIMESTAMP,
    revoked_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS financial_operations_provider_contract_sla_checks (
    id VARCHAR(255) PRIMARY KEY,
    provider_contract_id VARCHAR(255),
    provider_sla_id VARCHAR(255),
    check_code VARCHAR(100) NOT NULL,
    check_label VARCHAR(255) NOT NULL,
    check_status VARCHAR(50) NOT NULL,
    category VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    required_for_provider_readiness BOOLEAN DEFAULT TRUE,
    evidence_json JSONB,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_operations_provider_contract_sla_findings (
    id VARCHAR(255) PRIMARY KEY,
    provider_contract_id VARCHAR(255),
    provider_sla_id VARCHAR(255),
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

CREATE TABLE IF NOT EXISTS financial_operations_provider_contract_sla_audit_events (
    id VARCHAR(255) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    actor_id VARCHAR(255),
    actor_type VARCHAR(50) NOT NULL,
    provider_contract_id VARCHAR(255),
    provider_sla_id VARCHAR(255),
    provider_sandbox_id VARCHAR(255),
    tenant_id VARCHAR(255),
    provider_key VARCHAR(100),
    provider_type VARCHAR(100),
    payload_json JSONB,
    created_at TIMESTAMP NOT NULL
);
