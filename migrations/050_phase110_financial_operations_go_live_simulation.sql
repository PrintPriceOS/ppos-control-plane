-- migrations/050_phase110_financial_operations_go_live_simulation.sql

CREATE TABLE IF NOT EXISTS financial_operations_go_live_simulations (
    id VARCHAR(255) PRIMARY KEY,
    go_live_simulation_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255),
    simulation_name VARCHAR(255) NOT NULL,
    simulation_status VARCHAR(50) NOT NULL,
    simulation_scope VARCHAR(255),
    simulation_mode VARCHAR(50),
    readiness_run_id VARCHAR(255),
    activation_review_id VARCHAR(255),
    compliance_report_run_id VARCHAR(255),
    retention_review_id VARCHAR(255),
    provider_sandbox_id VARCHAR(255),
    settlement_file_run_id VARCHAR(255),
    failure_retry_run_id VARCHAR(255),
    go_no_go_status VARCHAR(50),
    simulated_activation_status VARCHAR(50),
    rollback_status VARCHAR(50),
    incident_readiness_status VARCHAR(50),
    compliance_status VARCHAR(50),
    privacy_status VARCHAR(50),
    provider_status VARCHAR(50),
    blockers_json JSON,
    warnings_json JSON,
    evidence_json JSON,
    source_snapshot_json JSON,
    result_snapshot_json JSON,
    metadata_json JSON,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    completed_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS financial_operations_go_live_simulation_steps (
    id VARCHAR(255) PRIMARY KEY,
    go_live_step_id VARCHAR(255) NOT NULL,
    go_live_simulation_id VARCHAR(255) NOT NULL,
    step_key VARCHAR(100) NOT NULL,
    step_label VARCHAR(255) NOT NULL,
    step_status VARCHAR(50) NOT NULL,
    step_order INT,
    category VARCHAR(100),
    required_for_go_live_simulation BOOLEAN DEFAULT TRUE,
    blockers_json JSON,
    warnings_json JSON,
    evidence_json JSON,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    completed_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS financial_operations_go_live_simulation_checklists (
    id VARCHAR(255) PRIMARY KEY,
    go_live_checklist_id VARCHAR(255) NOT NULL,
    go_live_simulation_id VARCHAR(255) NOT NULL,
    checklist_key VARCHAR(100) NOT NULL,
    checklist_status VARCHAR(50) NOT NULL,
    checklist_scope VARCHAR(100),
    required_items_json JSON,
    completed_items_json JSON,
    missing_items_json JSON,
    evidence_json JSON,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_operations_go_live_simulation_findings (
    id VARCHAR(255) PRIMARY KEY,
    go_live_simulation_id VARCHAR(255),
    go_live_step_id VARCHAR(255),
    go_live_checklist_id VARCHAR(255),
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

CREATE TABLE IF NOT EXISTS financial_operations_go_live_simulation_audit_events (
    id VARCHAR(255) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    actor_id VARCHAR(255),
    actor_type VARCHAR(50) NOT NULL,
    go_live_simulation_id VARCHAR(255),
    go_live_step_id VARCHAR(255),
    go_live_checklist_id VARCHAR(255),
    tenant_id VARCHAR(255),
    payload_json JSON,
    created_at TIMESTAMP NOT NULL
);
