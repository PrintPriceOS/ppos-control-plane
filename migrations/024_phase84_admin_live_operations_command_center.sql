-- migrations/024_phase84_admin_live_operations_command_center.sql

CREATE TABLE IF NOT EXISTS admin_live_ops_snapshots (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    printhouse_id VARCHAR(255),
    live_order_id VARCHAR(255) NOT NULL,
    partner_live_job_id VARCHAR(255),
    marketplace_order_id VARCHAR(255),
    command_status VARCHAR(50) NOT NULL, -- NORMAL, ATTENTION_REQUIRED, ACTION_REQUIRED, BLOCKED, AT_RISK, BREACHED, INCIDENT_OPEN, PAUSED, REVOKED, COMPLETED
    live_order_status VARCHAR(50),
    partner_job_status VARCHAR(50),
    customer_visible_status VARCHAR(50),
    live_enablement_status VARCHAR(50),
    live_scope VARCHAR(50),
    sla_status VARCHAR(50),
    sla_risk_level VARCHAR(50), -- LOW, MEDIUM, HIGH, CRITICAL
    incident_summary_json JSON,
    blocker_summary_json JSON,
    warning_summary_json JSON,
    gate_summary_json JSON,
    handoff_summary_json JSON,
    file_access_summary_json JSON,
    partner_summary_json JSON,
    customer_action_summary_json JSON,
    payment_summary_json JSON,
    proof_summary_json JSON,
    artifact_trust_summary_json JSON,
    machine_summary_json JSON,
    completion_summary_json JSON,
    rollback_summary_json JSON,
    revocation_summary_json JSON,
    command_actions_json JSON,
    last_event_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_admin_live_ops_snapshots_tenant ON admin_live_ops_snapshots(tenant_id);
CREATE INDEX idx_admin_live_ops_snapshots_live_order ON admin_live_ops_snapshots(live_order_id);
CREATE INDEX idx_admin_live_ops_snapshots_status ON admin_live_ops_snapshots(command_status);

CREATE TABLE IF NOT EXISTS admin_live_ops_command_events (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    printhouse_id VARCHAR(255),
    live_order_id VARCHAR(255),
    partner_live_job_id VARCHAR(255),
    command_event_type VARCHAR(100) NOT NULL,
    actor_user_id VARCHAR(255),
    actor_role VARCHAR(50),
    message TEXT,
    before_json JSON,
    after_json JSON,
    metadata_json JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_admin_live_ops_command_events_live_order ON admin_live_ops_command_events(live_order_id);

CREATE TABLE IF NOT EXISTS admin_live_ops_escalations (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    printhouse_id VARCHAR(255),
    live_order_id VARCHAR(255),
    partner_live_job_id VARCHAR(255),
    escalation_type VARCHAR(100) NOT NULL,
    escalation_status VARCHAR(50) NOT NULL, -- OPEN, ACKNOWLEDGED, IN_PROGRESS, RESOLVED, DISMISSED
    severity VARCHAR(50) NOT NULL, -- INFO, WARNING, CRITICAL
    assigned_to VARCHAR(255),
    assigned_role VARCHAR(50),
    created_by VARCHAR(255),
    created_by_role VARCHAR(50),
    acknowledged_by VARCHAR(255),
    acknowledged_at TIMESTAMP,
    resolved_by VARCHAR(255),
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    metadata_json JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_admin_live_ops_escalations_tenant ON admin_live_ops_escalations(tenant_id);

CREATE TABLE IF NOT EXISTS admin_live_ops_filters_saved (
    id VARCHAR(255) PRIMARY KEY,
    actor_user_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255),
    filter_name VARCHAR(255) NOT NULL,
    filter_json JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
