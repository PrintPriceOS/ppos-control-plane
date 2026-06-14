-- Migration 026: Phase 86 Invite Codes and Beta Registration Schema

CREATE TABLE IF NOT EXISTS marketplace_invite_codes (
    id VARCHAR(255) PRIMARY KEY,
    invite_code VARCHAR(255),
    invite_hash VARCHAR(255) NOT NULL,
    cohort_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255),
    printhouse_id VARCHAR(255),
    customer_email VARCHAR(255),
    customer_segment VARCHAR(50),
    allowed_order_types_json JSON,
    allowed_countries_json JSON,
    max_redemptions INT NOT NULL DEFAULT 1,
    redemptions_count INT NOT NULL DEFAULT 0,
    max_orders INT,
    orders_count INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    expires_at TIMESTAMPTZ,
    issued_by VARCHAR(255),
    issued_by_role VARCHAR(50),
    issued_at TIMESTAMPTZ,
    redeemed_by_customer_id VARCHAR(255),
    redeemed_at TIMESTAMPTZ,
    revoked_by VARCHAR(255),
    revoked_by_role VARCHAR(50),
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    metadata_json JSON,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS beta_registrations (
    id VARCHAR(255) PRIMARY KEY,
    invite_code_id VARCHAR(255),
    cohort_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255),
    customer_id VARCHAR(255),
    email VARCHAR(255) NOT NULL,
    registration_status VARCHAR(50) NOT NULL DEFAULT 'STARTED',
    terms_accepted_at TIMESTAMPTZ,
    privacy_accepted_at TIMESTAMPTZ,
    beta_limitations_accepted_at TIMESTAMPTZ,
    source_channel VARCHAR(50) NOT NULL DEFAULT 'INVITE_CODE',
    beta_scope_json JSON,
    blocking_reasons_json JSON,
    warning_reasons_json JSON,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS beta_invite_events (
    id VARCHAR(255) PRIMARY KEY,
    invite_code_id VARCHAR(255),
    beta_registration_id VARCHAR(255),
    cohort_id VARCHAR(255),
    tenant_id VARCHAR(255),
    customer_id VARCHAR(255),
    event_type VARCHAR(100) NOT NULL,
    actor_user_id VARCHAR(255),
    actor_role VARCHAR(50),
    message TEXT,
    metadata_json JSON,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
