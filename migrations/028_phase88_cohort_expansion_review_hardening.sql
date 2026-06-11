-- migrations/028_phase88_cohort_expansion_review_hardening.sql

CREATE TABLE cohort_expansion_reviews (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    cohort_id VARCHAR(255) NOT NULL,
    review_status VARCHAR(50) NOT NULL,
    review_decision VARCHAR(50),
    review_notes TEXT,
    health_snapshot_json JSONB,
    hardening_snapshot_json JSONB,
    created_by VARCHAR(255),
    created_by_role VARCHAR(50),
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE beta_hardening_actions (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    cohort_id VARCHAR(255) NOT NULL,
    expansion_review_id VARCHAR(255),
    category VARCHAR(50) NOT NULL,
    severity VARCHAR(50) NOT NULL,
    is_mandatory BOOLEAN DEFAULT false,
    action_status VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    resolution_notes TEXT,
    created_by VARCHAR(255),
    resolved_by VARCHAR(255),
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE cohort_expansion_audit_events (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255),
    cohort_id VARCHAR(255),
    expansion_review_id VARCHAR(255),
    hardening_action_id VARCHAR(255),
    event_type VARCHAR(50) NOT NULL,
    actor_id VARCHAR(255),
    actor_role VARCHAR(50),
    metadata_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
