-- migrations/031_phase91_partner_commercial_settlement_payout_readiness.sql

CREATE TABLE partner_commercial_terms (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    printhouse_id VARCHAR(255) NOT NULL,
    terms_status VARCHAR(50) NOT NULL, -- DRAFT, ACTIVE, PAUSED, DISABLED
    currency VARCHAR(10),
    settlement_model VARCHAR(50) NOT NULL, -- FIXED_PRICE, COST_PLUS_MARGIN, REVENUE_SHARE, MANUAL_QUOTE, HYBRID
    platform_fee_type VARCHAR(50) NOT NULL, -- NONE, FIXED, PERCENTAGE, MIXED
    platform_fee_value DECIMAL(12,2),
    partner_share_percentage DECIMAL(5,2),
    minimum_payout_amount DECIMAL(12,2),
    payout_delay_days INTEGER,
    payout_method VARCHAR(50) NOT NULL, -- MANUAL_BANK_TRANSFER, STRIPE_CONNECT_READY, EXTERNAL_PROVIDER_READY, MANUAL_ONLY
    requires_manual_payout_approval BOOLEAN DEFAULT true,
    requires_completion_evidence BOOLEAN DEFAULT true,
    requires_no_dispute BOOLEAN DEFAULT true,
    requires_no_refund_pending BOOLEAN DEFAULT true,
    requires_customer_payment_confirmed BOOLEAN DEFAULT true,
    tax_withholding_json JSONB,
    bank_details_ref VARCHAR(255),
    customer_safe_summary_json JSONB,
    partner_safe_summary_json JSONB,
    created_by VARCHAR(255),
    created_by_role VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE partner_settlement_records (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    printhouse_id VARCHAR(255) NOT NULL,
    partner_live_job_id VARCHAR(255) NOT NULL,
    live_order_id VARCHAR(255) NOT NULL,
    beta_order_id VARCHAR(255),
    marketplace_order_id VARCHAR(255),
    customer_payment_record_id VARCHAR(255),
    commercial_terms_id VARCHAR(255) REFERENCES partner_commercial_terms(id),
    settlement_status VARCHAR(50) NOT NULL, -- NOT_READY, CALCULATION_PENDING, CALCULATED, HOLD, DISPUTED, READY_FOR_REVIEW, APPROVED_FOR_PAYOUT, PAYOUT_SCHEDULED_MANUAL, PAYOUT_EXECUTED_EXTERNALLY, PAYOUT_FAILED, CANCELLED, REVERSED
    payout_readiness_status VARCHAR(50) NOT NULL, -- NOT_ELIGIBLE, BLOCKED, READY_FOR_REVIEW, APPROVED, NOT_APPROVED
    amount_customer_paid DECIMAL(12,2),
    gross_order_amount DECIMAL(12,2),
    partner_payable_amount DECIMAL(12,2),
    platform_fee_amount DECIMAL(12,2),
    refund_amount DECIMAL(12,2),
    reversal_amount DECIMAL(12,2),
    dispute_hold_amount DECIMAL(12,2),
    net_payable_amount DECIMAL(12,2),
    currency VARCHAR(10),
    calculation_snapshot_json JSONB,
    readiness_snapshot_json JSONB,
    blocking_reasons_json JSONB,
    warning_reasons_json JSONB,
    approved_by VARCHAR(255),
    approved_by_role VARCHAR(50),
    approved_at TIMESTAMP WITH TIME ZONE,
    payout_execution_reference VARCHAR(255),
    payout_evidence_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE partner_settlement_line_items (
    id VARCHAR(255) PRIMARY KEY,
    partner_settlement_record_id VARCHAR(255) REFERENCES partner_settlement_records(id),
    line_item_type VARCHAR(50) NOT NULL, -- PRINT_COST, PARTNER_REVENUE, PLATFORM_FEE, REFUND_DEDUCTION, REVERSAL_DEDUCTION, DISPUTE_HOLD, MANUAL_ADJUSTMENT, TAX_WITHHOLDING, OTHER
    description TEXT,
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(10),
    metadata_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE partner_payout_holds (
    id VARCHAR(255) PRIMARY KEY,
    partner_settlement_record_id VARCHAR(255) REFERENCES partner_settlement_records(id),
    tenant_id VARCHAR(255) NOT NULL,
    printhouse_id VARCHAR(255) NOT NULL,
    hold_type VARCHAR(50) NOT NULL, -- CUSTOMER_DISPUTE, REFUND_PENDING, PAYMENT_REVERSAL, PRODUCTION_EVIDENCE_MISSING, INCIDENT_OPEN, QUALITY_REVIEW, MANUAL_REVIEW, POLICY_HOLD, COMMERCIAL_TERMS_MISSING, PAYOUT_METHOD_MISSING
    hold_status VARCHAR(50) NOT NULL, -- ACTIVE, RELEASED, DISMISSED
    severity VARCHAR(20) NOT NULL, -- INFO, WARNING, CRITICAL
    reason TEXT,
    created_by VARCHAR(255),
    created_by_role VARCHAR(50),
    released_by VARCHAR(255),
    released_by_role VARCHAR(50),
    released_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE partner_settlement_events (
    id VARCHAR(255) PRIMARY KEY,
    partner_settlement_record_id VARCHAR(255) REFERENCES partner_settlement_records(id),
    tenant_id VARCHAR(255) NOT NULL,
    printhouse_id VARCHAR(255) NOT NULL,
    live_order_id VARCHAR(255),
    partner_live_job_id VARCHAR(255),
    event_type VARCHAR(50) NOT NULL, -- COMMERCIAL_TERMS_CREATED, COMMERCIAL_TERMS_ACTIVATED, SETTLEMENT_RECORD_CREATED, SETTLEMENT_CALCULATED, SETTLEMENT_BLOCKED, PAYOUT_HOLD_CREATED, PAYOUT_HOLD_RELEASED, PAYOUT_READY_FOR_REVIEW, PAYOUT_APPROVED, PAYOUT_APPROVAL_REJECTED, PAYOUT_MARKED_MANUAL_SCHEDULED, PAYOUT_MARKED_EXTERNALLY_EXECUTED, PAYOUT_FAILED, REFUND_IMPACT_APPLIED, REVERSAL_IMPACT_APPLIED, DISPUTE_IMPACT_APPLIED
    actor_user_id VARCHAR(255),
    actor_role VARCHAR(50),
    message TEXT,
    before_json JSONB,
    after_json JSONB,
    metadata_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
