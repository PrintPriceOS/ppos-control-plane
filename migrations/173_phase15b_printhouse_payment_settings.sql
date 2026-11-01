-- migrations/173_phase15b_printhouse_payment_settings.sql
-- PHASE-15B: Printhouse Financial Configuration, Stripe Connect & B2B Banking Settings

CREATE TABLE IF NOT EXISTS printhouse_payment_settings (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    tenant_id VARCHAR(128) NOT NULL,
    printhouse_id VARCHAR(128) NULL,
    stripe_account_id VARCHAR(128) NULL,
    stripe_publishable_key VARCHAR(255) NULL,
    stripe_restricted_key_encrypted TEXT NULL,
    stripe_webhook_secret VARCHAR(255) NULL,
    stripe_mode ENUM('TEST', 'LIVE') NOT NULL DEFAULT 'TEST',
    bank_account_holder VARCHAR(255) NOT NULL DEFAULT '',
    bank_iban VARCHAR(64) NOT NULL DEFAULT '',
    bank_bic_swift VARCHAR(32) NOT NULL DEFAULT '',
    bank_name VARCHAR(128) NULL,
    legal_entity_name VARCHAR(255) NOT NULL DEFAULT '',
    vat_tax_id VARCHAR(64) NOT NULL DEFAULT '',
    fiscal_address TEXT NOT NULL,
    e_invoice_routing_code VARCHAR(64) NULL,
    default_settlement_modality ENUM('MODALITY_A_ESCROW_MOR', 'MODALITY_B_DIRECT_COMMISSION') NOT NULL DEFAULT 'MODALITY_A_ESCROW_MOR',
    auto_payout_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    status ENUM('CONFIGURED', 'INCOMPLETE', 'VERIFIED') NOT NULL DEFAULT 'INCOMPLETE',
    last_verified_at DATETIME NULL,
    updated_by VARCHAR(128) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_pps_tenant_id (tenant_id),
    INDEX idx_pps_printhouse_id (printhouse_id),
    INDEX idx_pps_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

