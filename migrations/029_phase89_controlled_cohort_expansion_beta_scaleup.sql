-- migrations/029_phase89_controlled_cohort_expansion_beta_scaleup.sql

CREATE TABLE cohort_expansion_executions (
    id VARCHAR(255) PRIMARY KEY,
    expansion_review_id VARCHAR(255) NOT NULL,
    source_cohort_id VARCHAR(255) NOT NULL,
    target_cohort_id VARCHAR(255),
    tenant_id VARCHAR(255) NOT NULL,
    execution_status VARCHAR(50) NOT NULL,
    expansion_type VARCHAR(50) NOT NULL,
    previous_limits_json JSONB,
    proposed_limits_json JSONB,
    applied_limits_json JSONB,
    rollback_limits_json JSONB,
    readiness_snapshot_json JSONB,
    hardening_snapshot_json JSONB,
    observability_snapshot_json JSONB,
    guard_snapshot_json JSONB,
    blocking_reasons_json JSONB,
    warning_reasons_json JSONB,
    requested_by VARCHAR(255),
    requested_by_role VARCHAR(50),
    requested_at TIMESTAMP WITH TIME ZONE,
    approved_by VARCHAR(255),
    approved_by_role VARCHAR(50),
    approved_at TIMESTAMP WITH TIME ZONE,
    executed_by VARCHAR(255),
    executed_by_role VARCHAR(50),
    executed_at TIMESTAMP WITH TIME ZONE,
    paused_by VARCHAR(255),
    paused_by_role VARCHAR(50),
    paused_at TIMESTAMP WITH TIME ZONE,
    rollback_by VARCHAR(255),
    rollback_by_role VARCHAR(50),
    rollback_at TIMESTAMP WITH TIME ZONE,
    rollback_reason TEXT,
    metadata_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE cohort_expansion_execution_events (
    id VARCHAR(255) PRIMARY KEY,
    expansion_execution_id VARCHAR(255) NOT NULL,
    expansion_review_id VARCHAR(255),
    source_cohort_id VARCHAR(255),
    target_cohort_id VARCHAR(255),
    tenant_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    actor_user_id VARCHAR(255),
    actor_role VARCHAR(50),
    message TEXT,
    before_json JSONB,
    after_json JSONB,
    metadata_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE cohort_expansion_limit_snapshots (
    id VARCHAR(255) PRIMARY KEY,
    expansion_execution_id VARCHAR(255) NOT NULL,
    cohort_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    snapshot_type VARCHAR(50) NOT NULL,
    limits_json JSONB,
    public_guard_config_json JSONB,
    launch_control_flags_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
