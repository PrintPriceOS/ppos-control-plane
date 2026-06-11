-- migrations/023_phase83_partner_printhouse_live_operations_job_board.sql
-- Migration for Partner Printhouse Live Operations Job Board

CREATE TABLE IF NOT EXISTS partner_live_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    printhouse_id UUID NOT NULL,
    live_order_id UUID NOT NULL,
    marketplace_order_id UUID,
    job_number VARCHAR(100) NOT NULL,
    partner_job_status VARCHAR(50) NOT NULL, -- ASSIGNED, AWAITING_ACCEPTANCE, ACCEPTED, REJECTED, ON_HOLD, READY_FOR_PRODUCTION, IN_PRODUCTION, PRODUCTION_PAUSED, PRODUCTION_BLOCKED, COMPLETED, CANCELLED, REVOKED
    partner_visible_status VARCHAR(50),
    live_enablement_id UUID,
    live_scope VARCHAR(50),
    assigned_machine_id UUID,
    assigned_machine_name VARCHAR(255),
    production_priority INTEGER DEFAULT 0,
    due_at TIMESTAMP WITH TIME ZONE,
    sla_status VARCHAR(50),
    handoff_package_id UUID,
    handoff_status VARCHAR(50),
    file_access_status VARCHAR(50),
    final_production_audit_status VARCHAR(50),
    partner_safe_customer_json JSONB,
    partner_safe_specifications_json JSONB,
    partner_safe_artifacts_json JSONB,
    partner_safe_handoff_json JSONB,
    partner_guard_snapshot_json JSONB,
    blocking_reasons_json JSONB,
    warning_reasons_json JSONB,
    accepted_by VARCHAR(255),
    accepted_by_role VARCHAR(50),
    accepted_at TIMESTAMP WITH TIME ZONE,
    rejected_by VARCHAR(255),
    rejected_by_role VARCHAR(50),
    rejected_at TIMESTAMP WITH TIME ZONE,
    rejection_reason VARCHAR(255),
    hold_reason VARCHAR(255),
    completed_by VARCHAR(255),
    completed_by_role VARCHAR(50),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_partner_live_jobs_tenant_printhouse ON partner_live_jobs(tenant_id, printhouse_id);
CREATE INDEX IF NOT EXISTS idx_partner_live_jobs_live_order_id ON partner_live_jobs(live_order_id);

CREATE TABLE IF NOT EXISTS partner_live_job_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    printhouse_id UUID NOT NULL,
    partner_live_job_id UUID NOT NULL,
    live_order_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    actor_user_id VARCHAR(255),
    actor_role VARCHAR(50),
    message TEXT,
    metadata_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_partner_live_job_events_job_id ON partner_live_job_events(partner_live_job_id);

CREATE TABLE IF NOT EXISTS partner_live_job_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    printhouse_id UUID NOT NULL,
    partner_live_job_id UUID NOT NULL,
    live_order_id UUID NOT NULL,
    incident_type VARCHAR(100) NOT NULL,
    incident_status VARCHAR(50) NOT NULL, -- OPEN, ACKNOWLEDGED, RESOLVED, DISMISSED
    severity VARCHAR(50) NOT NULL, -- INFO, WARNING, CRITICAL
    partner_message TEXT,
    operator_message TEXT,
    customer_safe_message TEXT,
    created_by VARCHAR(255),
    created_by_role VARCHAR(50),
    acknowledged_by VARCHAR(255),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(255),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_partner_live_job_incidents_job_id ON partner_live_job_incidents(partner_live_job_id);

CREATE TABLE IF NOT EXISTS partner_file_access_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    printhouse_id UUID NOT NULL,
    partner_live_job_id UUID NOT NULL,
    live_order_id UUID NOT NULL,
    file_id UUID,
    artifact_id UUID,
    access_type VARCHAR(100) NOT NULL, -- VIEW_METADATA, DOWNLOAD, PREVIEW, HANDOFF_PACKAGE_DOWNLOAD
    actor_user_id VARCHAR(255),
    actor_role VARCHAR(50),
    ip_address VARCHAR(45),
    user_agent TEXT,
    result VARCHAR(50) NOT NULL, -- ALLOWED, BLOCKED
    blocking_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_partner_file_access_audits_job_id ON partner_file_access_audits(partner_live_job_id);
