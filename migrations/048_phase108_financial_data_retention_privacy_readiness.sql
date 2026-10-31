-- migrations/048_phase108_financial_data_retention_privacy_readiness.sql

CREATE TABLE IF NOT EXISTS financial_operations_data_retention_policies (
    id VARCHAR(255) PRIMARY KEY,
    retention_policy_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255),
    policy_name VARCHAR(255) NOT NULL,
    policy_status VARCHAR(50) NOT NULL,
    policy_scope VARCHAR(255),
    data_domain VARCHAR(100) NOT NULL,
    data_categories_json JSON,
    retention_period_days INT,
    legal_hold_required BOOLEAN DEFAULT FALSE,
    deletion_allowed BOOLEAN DEFAULT FALSE,
    anonymization_allowed BOOLEAN DEFAULT FALSE,
    redaction_required BOOLEAN DEFAULT TRUE,
    manual_review_required BOOLEAN DEFAULT TRUE,
    production_execution_enabled BOOLEAN DEFAULT FALSE,
    full_public_enabled BOOLEAN DEFAULT FALSE,
    evidence_json JSON,
    metadata_json JSON,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    approved_at TIMESTAMP,
    approved_by VARCHAR(255),
    revoked_at TIMESTAMP,
    revoked_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS financial_operations_data_retention_reviews (
    id VARCHAR(255) PRIMARY KEY,
    retention_review_id VARCHAR(255) NOT NULL,
    retention_policy_id VARCHAR(255),
    tenant_id VARCHAR(255),
    review_status VARCHAR(50) NOT NULL,
    review_scope VARCHAR(255),
    data_domain VARCHAR(100) NOT NULL,
    candidate_record_count INT DEFAULT 0,
    eligible_for_retention_count INT DEFAULT 0,
    eligible_for_redaction_count INT DEFAULT 0,
    eligible_for_deletion_count INT DEFAULT 0,
    blocked_by_legal_hold_count INT DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS financial_operations_privacy_request_reviews (
    id VARCHAR(255) PRIMARY KEY,
    privacy_request_review_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255),
    request_type VARCHAR(100) NOT NULL,
    request_status VARCHAR(50) NOT NULL,
    requester_reference VARCHAR(255),
    requester_reference_hash VARCHAR(255),
    data_subject_reference VARCHAR(255),
    data_subject_reference_hash VARCHAR(255),
    data_domains_json JSON,
    redaction_preview_json JSON,
    export_preview_json JSON,
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

CREATE TABLE IF NOT EXISTS financial_operations_data_privacy_findings (
    id VARCHAR(255) PRIMARY KEY,
    retention_policy_id VARCHAR(255),
    retention_review_id VARCHAR(255),
    privacy_request_review_id VARCHAR(255),
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

CREATE TABLE IF NOT EXISTS financial_operations_data_privacy_audit_events (
    id VARCHAR(255) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    actor_id VARCHAR(255),
    actor_type VARCHAR(50) NOT NULL,
    retention_policy_id VARCHAR(255),
    retention_review_id VARCHAR(255),
    privacy_request_review_id VARCHAR(255),
    tenant_id VARCHAR(255),
    payload_json JSON,
    created_at TIMESTAMP NOT NULL
);
