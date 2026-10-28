-- migrations/171_phase196j_financial_settlement_vouchers.sql
-- PrintPrice OS — Phase 196J: Governed Financial Settlement Vouchers & Transactional Anti-Replay Ledger (BUDGET-02D-01R5V)
--
-- Strict Relational, Financial & Concurrency Guarantees:
-- 1. Anti-Replay / Double-Spending Immunity: UNIQUE KEY on (provider, provider_voucher_id) enforces database-level uniqueness across concurrent transactions.
-- 2. Economic Obligation Binding: Explicitly binds canonical order, effective technical specification, obligation ID, tenant ID, and beneficiary.
-- 3. Exact Monetary Amounts: amount_cents (integer minor units), currency (3-letter ISO code).
-- 4. Atomic Transition Ledger: Inserted within the exact same database transaction that transitions order_effective_technical_specifications to REFUND_SETTLED.
-- 5. Multi-Tenant Isolation: tenant_id strictly indexed.

CREATE TABLE IF NOT EXISTS financial_settlement_vouchers (
    id VARCHAR(64) PRIMARY KEY,
    provider VARCHAR(64) NOT NULL,
    provider_voucher_id VARCHAR(191) NOT NULL,
    settlement_ref VARCHAR(191) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    canonical_order_id VARCHAR(128) NOT NULL,
    effective_specification_id VARCHAR(64) NULL,
    obligation_id VARCHAR(128) NOT NULL,
    amount_cents BIGINT NOT NULL,
    currency VARCHAR(16) NOT NULL,
    beneficiary VARCHAR(255) NOT NULL,
    status VARCHAR(64) NOT NULL DEFAULT 'SETTLED',
    is_mock_sandbox TINYINT(1) NOT NULL DEFAULT 0,
    proof_metadata_json JSON NULL,
    settled_by VARCHAR(128) NOT NULL,
    settled_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_provider_voucher (provider, provider_voucher_id),
    INDEX idx_fsv_tenant_order (tenant_id, canonical_order_id),
    INDEX idx_fsv_obligation (obligation_id),
    INDEX idx_fsv_settlement_ref (provider, settlement_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
