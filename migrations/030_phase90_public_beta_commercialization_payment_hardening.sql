-- migrations/030_phase90_public_beta_commercialization_payment_hardening.sql

CREATE TABLE beta_payment_modes (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    cohort_id VARCHAR(255) NOT NULL,
    payment_mode VARCHAR(50) NOT NULL, -- DISABLED, PAYMENT_REFERENCE_ONLY, BANK_TRANSFER_MANUAL_VERIFICATION, EXTERNAL_PROVIDER_TEST, EXTERNAL_PROVIDER_LIVE_APPROVED
    mode_status VARCHAR(50) NOT NULL, -- DRAFT, ACTIVE, PAUSED, DISABLED
    currency VARCHAR(10),
    allowed_countries_json JSON,
    allowed_order_types_json JSON,
    max_amount_per_order DECIMAL(12,2),
    max_amount_per_customer DECIMAL(12,2),
    requires_manual_verification BOOLEAN DEFAULT false,
    requires_invoice_before_payment BOOLEAN DEFAULT false,
    requires_payment_before_handoff BOOLEAN DEFAULT false,
    requires_payment_before_production BOOLEAN DEFAULT false,
    provider_name VARCHAR(100),
    provider_account_ref VARCHAR(255),
    provider_readiness_json JSON,
    bank_transfer_instructions_json JSON,
    customer_safe_instructions_json JSON,
    risk_rules_json JSON,
    created_by VARCHAR(255),
    created_by_role VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE beta_payment_records (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    cohort_id VARCHAR(255) NOT NULL,
    customer_id VARCHAR(255) NOT NULL,
    beta_order_id VARCHAR(255),
    live_order_id VARCHAR(255),
    marketplace_order_id VARCHAR(255),
    pricing_session_id VARCHAR(255),
    offer_id VARCHAR(255),
    payment_mode_id VARCHAR(255) NOT NULL REFERENCES beta_payment_modes(id),
    payment_status VARCHAR(50) NOT NULL, -- NOT_REQUIRED, PAYMENT_REQUIRED, PAYMENT_REFERENCE_SUBMITTED, VERIFICATION_PENDING, PAYMENT_CONFIRMED, PAYMENT_FAILED, CANCELLED, REFUND_REQUESTED, REFUND_PENDING, REFUNDED, PARTIALLY_REFUNDED, DISPUTED, REVERSED
    amount_expected DECIMAL(12,2),
    amount_received DECIMAL(12,2),
    currency VARCHAR(10),
    customer_reference VARCHAR(255),
    provider_payment_id VARCHAR(255),
    provider_status VARCHAR(100),
    provider_payload_hash VARCHAR(255),
    evidence_json JSON,
    verification_status VARCHAR(50) NOT NULL DEFAULT 'NOT_STARTED', -- NOT_STARTED, PENDING, APPROVED, REJECTED, NEEDS_MORE_INFO
    verified_by VARCHAR(255),
    verified_by_role VARCHAR(50),
    verified_at TIMESTAMP,
    rejected_by VARCHAR(255),
    rejected_by_role VARCHAR(50),
    rejected_at TIMESTAMP,
    rejection_reason TEXT,
    confirmed_by VARCHAR(255),
    confirmed_by_role VARCHAR(50),
    confirmed_at TIMESTAMP,
    metadata_json JSON,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE beta_payment_events (
    id VARCHAR(255) PRIMARY KEY,
    beta_payment_record_id VARCHAR(255) REFERENCES beta_payment_records(id),
    tenant_id VARCHAR(255) NOT NULL,
    cohort_id VARCHAR(255),
    customer_id VARCHAR(255),
    beta_order_id VARCHAR(255),
    live_order_id VARCHAR(255),
    event_type VARCHAR(100) NOT NULL, -- PAYMENT_MODE_CREATED, PAYMENT_MODE_ACTIVATED, PAYMENT_MODE_PAUSED, PAYMENT_RECORD_CREATED, PAYMENT_REQUIRED, PAYMENT_REFERENCE_SUBMITTED, PAYMENT_EVIDENCE_SUBMITTED, PAYMENT_VERIFICATION_REQUESTED, PAYMENT_VERIFICATION_APPROVED, PAYMENT_VERIFICATION_REJECTED, PAYMENT_CONFIRMED, PAYMENT_FAILED, PAYMENT_CANCELLED, REFUND_REQUESTED, REFUND_APPROVED, REFUND_REJECTED, REFUND_COMPLETED, PAYMENT_REVERSED, PAYMENT_PROVIDER_WEBHOOK_RECEIVED, PAYMENT_PROVIDER_WEBHOOK_REJECTED
    actor_user_id VARCHAR(255),
    actor_role VARCHAR(50),
    message TEXT,
    before_json JSON,
    after_json JSON,
    metadata_json JSON,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE beta_commercial_audit_snapshots (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    cohort_id VARCHAR(255) NOT NULL,
    beta_order_id VARCHAR(255),
    live_order_id VARCHAR(255),
    snapshot_type VARCHAR(50) NOT NULL, -- BEFORE_PAYMENT_REQUIRED, AFTER_REFERENCE_SUBMITTED, BEFORE_CONFIRMATION, AFTER_CONFIRMATION, BEFORE_REFUND, AFTER_REFUND, BEFORE_CANCELLATION, AFTER_CANCELLATION
    payment_snapshot_json JSON,
    invoice_snapshot_json JSON,
    order_gate_snapshot_json JSON,
    public_guard_snapshot_json JSON,
    created_at TIMESTAMP DEFAULT NOW()
);
