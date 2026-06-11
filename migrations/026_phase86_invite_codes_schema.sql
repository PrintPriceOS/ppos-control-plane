-- Migration 026: Phase 86 Invite Codes and Beta Registration Schema

CREATE TABLE IF NOT EXISTS marketplace_invite_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_code VARCHAR(255),
    invite_hash VARCHAR(255) NOT NULL,
    cohort_id UUID NOT NULL,
    tenant_id UUID,
    printhouse_id UUID,
    customer_email VARCHAR(255),
    customer_segment VARCHAR(50),
    allowed_order_types_json JSONB,
    allowed_countries_json JSONB,
    max_redemptions INT NOT NULL DEFAULT 1,
    redemptions_count INT NOT NULL DEFAULT 0,
    max_orders INT,
    orders_count INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    expires_at TIMESTAMPTZ,
    issued_by UUID,
    issued_by_role VARCHAR(50),
    issued_at TIMESTAMPTZ,
    redeemed_by_customer_id UUID,
    redeemed_at TIMESTAMPTZ,
    revoked_by UUID,
    revoked_by_role VARCHAR(50),
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    metadata_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS beta_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_code_id UUID,
    cohort_id UUID NOT NULL,
    tenant_id UUID,
    customer_id UUID,
    email VARCHAR(255) NOT NULL,
    registration_status VARCHAR(50) NOT NULL DEFAULT 'STARTED',
    terms_accepted_at TIMESTAMPTZ,
    privacy_accepted_at TIMESTAMPTZ,
    beta_limitations_accepted_at TIMESTAMPTZ,
    source_channel VARCHAR(50) NOT NULL DEFAULT 'INVITE_CODE',
    beta_scope_json JSONB,
    blocking_reasons_json JSONB,
    warning_reasons_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS beta_invite_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_code_id UUID,
    beta_registration_id UUID,
    cohort_id UUID,
    tenant_id UUID,
    customer_id UUID,
    event_type VARCHAR(100) NOT NULL,
    actor_user_id UUID,
    actor_role VARCHAR(50),
    message TEXT,
    metadata_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
