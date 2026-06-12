-- migrations/049_phase109_financial_compliance_reporting_readiness.sql

CREATE TABLE IF NOT EXISTS financial_operations_compliance_report_definitions (
    id VARCHAR(255) PRIMARY KEY,
    compliance_report_definition_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255),
    report_key VARCHAR(100) NOT NULL,
    report_name VARCHAR(255) NOT NULL,
    report_status VARCHAR(50) NOT NULL,
    report_scope VARCHAR(255),
    report_domain VARCHAR(100) NOT NULL,
    jurisdiction VARCHAR(100),
    reporting_period_type VARCHAR(50),
    data_sources_json JSONB,
    required_sections_json JSONB,
    redaction_required BOOLEAN DEFAULT TRUE,
    manual_review_required BOOLEAN DEFAULT TRUE,
    external_submission_enabled BOOLEAN DEFAULT FALSE,
    tax_filing_enabled BOOLEAN DEFAULT FALSE,
    production_execution_enabled BOOLEAN DEFAULT FALSE,
    full_public_enabled BOOLEAN DEFAULT FALSE,
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

CREATE TABLE IF NOT EXISTS financial_operations_compliance_report_runs (
    id VARCHAR(255) PRIMARY KEY,
    compliance_report_run_id VARCHAR(255) NOT NULL,
    compliance_report_definition_id VARCHAR(255),
    tenant_id VARCHAR(255),
    report_key VARCHAR(100) NOT NULL,
    report_domain VARCHAR(100) NOT NULL,
    run_status VARCHAR(50) NOT NULL,
    run_scope VARCHAR(255),
    reporting_period_start TIMESTAMP,
    reporting_period_end TIMESTAMP,
    source_record_count INT DEFAULT 0,
    included_record_count INT DEFAULT 0,
    excluded_record_count INT DEFAULT 0,
    finding_count INT DEFAULT 0,
    blocker_count INT DEFAULT 0,
    warning_count INT DEFAULT 0,
    blockers_json JSONB,
    warnings_json JSONB,
    evidence_json JSONB,
    source_snapshot_json JSONB,
    result_snapshot_json JSONB,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    completed_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS financial_operations_compliance_report_sections (
    id VARCHAR(255) PRIMARY KEY,
    compliance_report_section_id VARCHAR(255) NOT NULL,
    compliance_report_run_id VARCHAR(255) NOT NULL,
    section_key VARCHAR(100) NOT NULL,
    section_label VARCHAR(255) NOT NULL,
    section_status VARCHAR(50) NOT NULL,
    source_count INT DEFAULT 0,
    evidence_json JSONB,
    preview_json JSONB,
    redacted_preview_json JSONB,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_operations_compliance_report_findings (
    id VARCHAR(255) PRIMARY KEY,
    compliance_report_run_id VARCHAR(255),
    compliance_report_section_id VARCHAR(255),
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

CREATE TABLE IF NOT EXISTS financial_operations_compliance_report_audit_events (
    id VARCHAR(255) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    actor_id VARCHAR(255),
    actor_type VARCHAR(50) NOT NULL,
    compliance_report_definition_id VARCHAR(255),
    compliance_report_run_id VARCHAR(255),
    compliance_report_section_id VARCHAR(255),
    tenant_id VARCHAR(255),
    payload_json JSONB,
    created_at TIMESTAMP NOT NULL
);
