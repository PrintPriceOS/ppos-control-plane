-- migrations/032_phase92_financial_reconciliation_accounting_export_readiness.sql

CREATE TABLE IF NOT EXISTS financial_reconciliation_runs (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    cohort_id VARCHAR(255),
    run_status VARCHAR(50) NOT NULL, -- DRAFT, RUNNING, COMPLETED, COMPLETED_WITH_WARNINGS, FAILED, CANCELLED
    run_scope VARCHAR(50) NOT NULL, -- BETA_COHORT, TENANT, PRINTHOUSE, DATE_RANGE, ALL_BETA
    date_from TIMESTAMP,
    date_to TIMESTAMP,
    currency VARCHAR(10) NOT NULL,
    total_customer_payments NUMERIC DEFAULT 0,
    total_refunds NUMERIC DEFAULT 0,
    total_reversals NUMERIC DEFAULT 0,
    total_partner_payables NUMERIC DEFAULT 0,
    total_platform_fees NUMERIC DEFAULT 0,
    total_payout_ready NUMERIC DEFAULT 0,
    total_payout_executed_external NUMERIC DEFAULT 0,
    total_unresolved_holds NUMERIC DEFAULT 0,
    mismatch_count INTEGER DEFAULT 0,
    warning_count INTEGER DEFAULT 0,
    blocking_count INTEGER DEFAULT 0,
    summary_json JSONB,
    created_by VARCHAR(255) NOT NULL,
    created_by_role VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_ledger_snapshots (
    id VARCHAR(255) PRIMARY KEY,
    reconciliation_run_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    cohort_id VARCHAR(255),
    printhouse_id VARCHAR(255),
    customer_id VARCHAR(255),
    beta_order_id VARCHAR(255),
    live_order_id VARCHAR(255),
    marketplace_order_id VARCHAR(255),
    customer_payment_record_id VARCHAR(255),
    partner_settlement_record_id VARCHAR(255),
    snapshot_type VARCHAR(50) NOT NULL, -- CUSTOMER_PAYMENT, REFUND, REVERSAL, PARTNER_SETTLEMENT, PLATFORM_FEE, PAYOUT_READINESS, PAYOUT_EXECUTION_EVIDENCE, COMMERCIAL_ADJUSTMENT
    amount NUMERIC NOT NULL,
    currency VARCHAR(10) NOT NULL,
    ledger_status VARCHAR(50) NOT NULL, -- EXPECTED, RECORDED, CONFIRMED, PENDING, FAILED, REVERSED, REFUNDED, HELD, DISPUTED
    source_status VARCHAR(100),
    source_reference VARCHAR(255),
    source_event_id VARCHAR(255),
    safe_source_hash VARCHAR(255),
    snapshot_json JSONB,
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_reconciliation_mismatches (
    id VARCHAR(255) PRIMARY KEY,
    reconciliation_run_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    cohort_id VARCHAR(255),
    mismatch_type VARCHAR(100) NOT NULL, -- PAYMENT_AMOUNT_MISMATCH, CURRENCY_MISMATCH, MISSING_PAYMENT_RECORD, MISSING_REFUND_RECORD, MISSING_SETTLEMENT_RECORD, MISSING_PAYOUT_EVIDENCE, PAYOUT_READY_WITH_HOLD, SETTLEMENT_WITHOUT_PAYMENT, PAYMENT_WITHOUT_SETTLEMENT, REFUND_NOT_APPLIED_TO_SETTLEMENT, REVERSAL_NOT_APPLIED_TO_SETTLEMENT, PLATFORM_FEE_MISMATCH, UNRESOLVED_DISPUTE, EXPORT_BLOCKER, OTHER
    severity VARCHAR(50) NOT NULL, -- INFO, WARNING, BLOCKER, CRITICAL
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    expected_value_json JSONB,
    actual_value_json JSONB,
    message TEXT NOT NULL,
    resolution_status VARCHAR(50) NOT NULL, -- OPEN, ACKNOWLEDGED, RESOLVED, DISMISSED
    resolved_by VARCHAR(255),
    resolved_by_role VARCHAR(100),
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS accounting_export_batches (
    id VARCHAR(255) PRIMARY KEY,
    reconciliation_run_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    cohort_id VARCHAR(255),
    export_status VARCHAR(50) NOT NULL, -- DRAFT, READY, BLOCKED, GENERATED, EXPORTED_MANUALLY, CANCELLED
    export_format VARCHAR(50) NOT NULL, -- CSV, JSON, XLSX, GENERIC_LEDGER_JSON, ACCOUNTING_IMPORT_CSV
    export_scope VARCHAR(50) NOT NULL, -- PAYMENTS, REFUNDS, SETTLEMENTS, PLATFORM_FEES, PAYOUTS, FULL_RECONCILIATION
    file_path TEXT,
    file_hash VARCHAR(255),
    row_count INTEGER DEFAULT 0,
    totals_json JSONB,
    blocking_reasons_json JSONB,
    warning_reasons_json JSONB,
    generated_by VARCHAR(255),
    generated_by_role VARCHAR(100),
    generated_at TIMESTAMP,
    marked_exported_by VARCHAR(255),
    marked_exported_by_role VARCHAR(100),
    marked_exported_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_reconciliation_events (
    id VARCHAR(255) PRIMARY KEY,
    reconciliation_run_id VARCHAR(255) NOT NULL,
    export_batch_id VARCHAR(255),
    mismatch_id VARCHAR(255),
    tenant_id VARCHAR(255) NOT NULL,
    cohort_id VARCHAR(255),
    event_type VARCHAR(100) NOT NULL, -- RECONCILIATION_RUN_CREATED, RECONCILIATION_STARTED, LEDGER_SNAPSHOT_CREATED, MISMATCH_DETECTED, MISMATCH_ACKNOWLEDGED, MISMATCH_RESOLVED, MISMATCH_DISMISSED, EXPORT_BATCH_CREATED, EXPORT_BATCH_GENERATED, EXPORT_BATCH_BLOCKED, EXPORT_MARKED_MANUAL, RECONCILIATION_COMPLETED, RECONCILIATION_FAILED
    actor_user_id VARCHAR(255) NOT NULL,
    actor_role VARCHAR(100) NOT NULL,
    message TEXT,
    before_json JSONB,
    after_json JSONB,
    metadata_json JSONB,
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_reconciliation_adjustments (
    id VARCHAR(255) PRIMARY KEY,
    reconciliation_run_id VARCHAR(255) NOT NULL,
    mismatch_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    adjustment_type VARCHAR(100) NOT NULL, -- MANUAL_PLATFORM_FEE_ADJUSTMENT, MANUAL_PARTNER_PAYABLE_ADJUSTMENT, MANUAL_REFUND_ADJUSTMENT, MANUAL_REVERSAL_ADJUSTMENT, MANUAL_LEDGER_NOTE, OTHER
    adjustment_status VARCHAR(50) NOT NULL, -- DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, APPLIED, CANCELLED
    amount NUMERIC NOT NULL,
    currency VARCHAR(10) NOT NULL,
    reason TEXT NOT NULL,
    before_json JSONB,
    after_json JSONB,
    created_by VARCHAR(255) NOT NULL,
    created_by_role VARCHAR(100) NOT NULL,
    approved_by VARCHAR(255),
    approved_by_role VARCHAR(100),
    applied_by VARCHAR(255),
    applied_by_role VARCHAR(100),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
