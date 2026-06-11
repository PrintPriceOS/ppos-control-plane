-- migrations/024_phase84_admin_live_operations_command_center.sql

CREATE TABLE IF NOT EXISTS admin_live_ops_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    printhouse_id UUID,
    live_order_id UUID NOT NULL,
    partner_live_job_id UUID,
    marketplace_order_id UUID,
    command_status VARCHAR(50) NOT NULL, -- NORMAL, ATTENTION_REQUIRED, ACTION_REQUIRED, BLOCKED, AT_RISK, BREACHED, INCIDENT_OPEN, PAUSED, REVOKED, COMPLETED
    live_order_status VARCHAR(50),
    partner_job_status VARCHAR(50),
    customer_visible_status VARCHAR(50),
    live_enablement_status VARCHAR(50),
    live_scope VARCHAR(50),
    sla_status VARCHAR(50),
    sla_risk_level VARCHAR(50), -- LOW, MEDIUM, HIGH, CRITICAL
    incident_summary_json JSONB,
    blocker_summary_json JSONB,
    warning_summary_json JSONB,
    gate_summary_json JSONB,
    handoff_summary_json JSONB,
    file_access_summary_json JSONB,
    partner_summary_json JSONB,
    customer_action_summary_json JSONB,
    payment_summary_json JSONB,
    proof_summary_json JSONB,
    artifact_trust_summary_json JSONB,
    machine_summary_json JSONB,
    completion_summary_json JSONB,
    rollback_summary_json JSONB,
    revocation_summary_json JSONB,
    command_actions_json JSONB,
    last_event_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_live_ops_snapshots_tenant ON admin_live_ops_snapshots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_admin_live_ops_snapshots_live_order ON admin_live_ops_snapshots(live_order_id);
CREATE INDEX IF NOT EXISTS idx_admin_live_ops_snapshots_status ON admin_live_ops_snapshots(command_status);

CREATE TABLE IF NOT EXISTS admin_live_ops_command_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    printhouse_id UUID,
    live_order_id UUID,
    partner_live_job_id UUID,
    command_event_type VARCHAR(100) NOT NULL,
    actor_user_id VARCHAR(255),
    actor_role VARCHAR(50),
    message TEXT,
    before_json JSONB,
    after_json JSONB,
    metadata_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_live_ops_command_events_live_order ON admin_live_ops_command_events(live_order_id);

CREATE TABLE IF NOT EXISTS admin_live_ops_escalations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    printhouse_id UUID,
    live_order_id UUID,
    partner_live_job_id UUID,
    escalation_type VARCHAR(100) NOT NULL,
    escalation_status VARCHAR(50) NOT NULL, -- OPEN, ACKNOWLEDGED, IN_PROGRESS, RESOLVED, DISMISSED
    severity VARCHAR(50) NOT NULL, -- INFO, WARNING, CRITICAL
    assigned_to VARCHAR(255),
    assigned_role VARCHAR(50),
    created_by VARCHAR(255),
    created_by_role VARCHAR(50),
    acknowledged_by VARCHAR(255),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(255),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    metadata_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_live_ops_escalations_tenant ON admin_live_ops_escalations(tenant_id);

CREATE TABLE IF NOT EXISTS admin_live_ops_filters_saved (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id VARCHAR(255) NOT NULL,
    tenant_id UUID,
    filter_name VARCHAR(255) NOT NULL,
    filter_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
