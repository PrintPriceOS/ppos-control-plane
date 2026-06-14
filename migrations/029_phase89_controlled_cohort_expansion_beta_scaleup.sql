-- migrations/029_phase89_controlled_cohort_expansion_beta_scaleup.sql

CREATE TABLE cohort_expansion_executions (
    id VARCHAR(255) PRIMARY KEY,
    expansion_review_id VARCHAR(255) NOT NULL,
    source_cohort_id VARCHAR(255) NOT NULL,
    target_cohort_id VARCHAR(255),
    tenant_id VARCHAR(255) NOT NULL,
    execution_status VARCHAR(50) NOT NULL,
    expansion_type VARCHAR(50) NOT NULL,
    previous_limits_json JSON,
    proposed_limits_json JSON,
    applied_limits_json JSON,
    rollback_limits_json JSON,
    readiness_snapshot_json JSON,
    hardening_snapshot_json JSON,
    observability_snapshot_json JSON,
    guard_snapshot_json JSON,
    blocking_reasons_json JSON,
    warning_reasons_json JSON,
    requested_by VARCHAR(255),
    requested_by_role VARCHAR(50),
    requested_at TIMESTAMP,
    approved_by VARCHAR(255),
    approved_by_role VARCHAR(50),
    approved_at TIMESTAMP,
    executed_by VARCHAR(255),
    executed_by_role VARCHAR(50),
    executed_at TIMESTAMP,
    paused_by VARCHAR(255),
    paused_by_role VARCHAR(50),
    paused_at TIMESTAMP,
    rollback_by VARCHAR(255),
    rollback_by_role VARCHAR(50),
    rollback_at TIMESTAMP,
    rollback_reason TEXT,
    metadata_json JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    before_json JSON,
    after_json JSON,
    metadata_json JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cohort_expansion_limit_snapshots (
    id VARCHAR(255) PRIMARY KEY,
    expansion_execution_id VARCHAR(255) NOT NULL,
    cohort_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    snapshot_type VARCHAR(50) NOT NULL,
    limits_json JSON,
    public_guard_config_json JSON,
    launch_control_flags_json JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
