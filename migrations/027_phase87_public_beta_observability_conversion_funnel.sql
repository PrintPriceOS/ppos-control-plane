-- migrations/027_phase87_public_beta_observability_conversion_funnel.sql

CREATE TABLE beta_funnel_events (
    id VARCHAR(255) PRIMARY KEY,
    event_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255),
    cohort_id VARCHAR(255),
    customer_id VARCHAR(255),
    beta_registration_id VARCHAR(255),
    invite_code_id VARCHAR(255),
    live_order_id VARCHAR(255),
    beta_order_id VARCHAR(255),
    offer_id VARCHAR(255),
    pricing_session_id VARCHAR(255),
    preflight_job_id VARCHAR(255),
    partner_live_job_id VARCHAR(255),
    event_type VARCHAR(50) NOT NULL,
    event_source VARCHAR(50) NOT NULL,
    event_status VARCHAR(50) NOT NULL,
    correlation_id VARCHAR(255),
    session_id VARCHAR(255),
    idempotency_key VARCHAR(255),
    safe_metadata_json JSON,
    internal_metadata_json JSON,
    pii_minimized_json JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE beta_funnel_stage_snapshots (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    cohort_id VARCHAR(255) NOT NULL,
    stage_name VARCHAR(50) NOT NULL,
    total_count INTEGER DEFAULT 0,
    unique_customers_count INTEGER DEFAULT 0,
    conversion_rate NUMERIC(5,2),
    drop_off_count INTEGER DEFAULT 0,
    drop_off_rate NUMERIC(5,2),
    avg_time_from_previous_stage_seconds INTEGER,
    p50_time_seconds INTEGER,
    p95_time_seconds INTEGER,
    blockers_json JSON,
    warnings_json JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE beta_observability_alerts (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    cohort_id VARCHAR(255) NOT NULL,
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(50) NOT NULL,
    alert_status VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    metric_snapshot_json JSON,
    created_by VARCHAR(255),
    created_by_role VARCHAR(50),
    acknowledged_by VARCHAR(255),
    acknowledged_at TIMESTAMP,
    resolved_by VARCHAR(255),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE beta_funnel_saved_views (
    id VARCHAR(255) PRIMARY KEY,
    actor_user_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    view_name VARCHAR(255) NOT NULL,
    filter_json JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
