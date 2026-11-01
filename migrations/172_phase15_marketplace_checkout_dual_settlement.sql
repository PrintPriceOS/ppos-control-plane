-- =============================================================================
-- Migration 172: PHASE-15 — Marketplace Order Pipeline, Dual Checkout & Commercial Settlement Engine
-- Author: Antigravity (Principal Architect & Core Financial Engineer)
-- Date: 2026-11-01
-- =============================================================================
-- Extends `marketplace_orders` and `marketplace_order_files` with immutable
-- financial breakdowns, dual payment channels (STRIPE_CARD / STRIPE_SEPA / BANK_TRANSFER_B2B),
-- dual commercial settlement modalities (MODALITY_A_ESCROW_MOR / MODALITY_B_DIRECT_COMMISSION),
-- and production asset ingestion source tracking (DIRECT_UPLOAD / EXTERNAL_LINK).
-- =============================================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS apply_phase15_marketplace_checkout_schema$$

CREATE PROCEDURE apply_phase15_marketplace_checkout_schema()
BEGIN
    -- 1. external_order_ref on marketplace_orders
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'marketplace_orders' AND COLUMN_NAME = 'external_order_ref'
    ) THEN
        ALTER TABLE marketplace_orders ADD COLUMN external_order_ref VARCHAR(64) NULL AFTER order_id;
        CREATE INDEX idx_mo_external_order_ref ON marketplace_orders (external_order_ref);
    END IF;

    -- 2. Immutable financial breakdown columns on marketplace_orders
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'marketplace_orders' AND COLUMN_NAME = 'subtotal_manufacturing_eur'
    ) THEN
        ALTER TABLE marketplace_orders
            ADD COLUMN subtotal_manufacturing_eur DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER estimated_price,
            ADD COLUMN packaging_handling_eur DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER subtotal_manufacturing_eur,
            ADD COLUMN shipping_freight_eur DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER packaging_handling_eur,
            ADD COLUMN tax_rate_pct DECIMAL(5,2) NOT NULL DEFAULT 21.00 AFTER shipping_freight_eur,
            ADD COLUMN tax_amount_eur DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER tax_rate_pct,
            ADD COLUMN total_amount_eur DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER tax_amount_eur;
    END IF;

    -- 3. Dual payment channel & status columns on marketplace_orders
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'marketplace_orders' AND COLUMN_NAME = 'payment_method'
    ) THEN
        ALTER TABLE marketplace_orders
            ADD COLUMN payment_method ENUM('STRIPE_CARD','STRIPE_SEPA','BANK_TRANSFER_B2B') NOT NULL DEFAULT 'BANK_TRANSFER_B2B' AFTER total_amount_eur,
            ADD COLUMN payment_status VARCHAR(32) NOT NULL DEFAULT 'PENDING' AFTER payment_method,
            ADD COLUMN stripe_checkout_session_id VARCHAR(128) NULL AFTER payment_status,
            ADD COLUMN stripe_payment_intent_id VARCHAR(128) NULL AFTER stripe_checkout_session_id,
            ADD COLUMN bank_transfer_reference VARCHAR(128) NULL AFTER stripe_payment_intent_id;
        CREATE INDEX idx_mo_payment_status ON marketplace_orders (payment_status);
        CREATE INDEX idx_mo_stripe_session ON marketplace_orders (stripe_checkout_session_id);
        CREATE INDEX idx_mo_bank_ref ON marketplace_orders (bank_transfer_reference);
    END IF;

    -- 4. Dual commercial settlement modality columns on marketplace_orders
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'marketplace_orders' AND COLUMN_NAME = 'settlement_modality'
    ) THEN
        ALTER TABLE marketplace_orders
            ADD COLUMN settlement_modality ENUM('MODALITY_A_ESCROW_MOR','MODALITY_B_DIRECT_COMMISSION') NOT NULL DEFAULT 'MODALITY_A_ESCROW_MOR' AFTER bank_transfer_reference,
            ADD COLUMN platform_fee_pct DECIMAL(5,2) NOT NULL DEFAULT 10.00 AFTER settlement_modality,
            ADD COLUMN platform_fee_eur DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER platform_fee_pct,
            ADD COLUMN net_printhouse_payout_eur DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER platform_fee_eur,
            ADD COLUMN escrow_status VARCHAR(32) NOT NULL DEFAULT 'UNFUNDED' AFTER net_printhouse_payout_eur;
        CREATE INDEX idx_mo_settlement_modality ON marketplace_orders (settlement_modality);
        CREATE INDEX idx_mo_escrow_status ON marketplace_orders (escrow_status);
    END IF;

    -- 5. File ingestion & external link columns on marketplace_order_files
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'marketplace_order_files' AND COLUMN_NAME = 'source_type'
    ) THEN
        ALTER TABLE marketplace_order_files
            ADD COLUMN source_type ENUM('DIRECT_UPLOAD','EXTERNAL_LINK') NOT NULL DEFAULT 'DIRECT_UPLOAD' AFTER storage_path,
            ADD COLUMN external_url TEXT NULL AFTER source_type,
            ADD COLUMN ingestion_status VARCHAR(32) NOT NULL DEFAULT 'PENDING' AFTER external_url;
        CREATE INDEX idx_mof_ingestion_status ON marketplace_order_files (ingestion_status);
    END IF;
END$$

DELIMITER ;

CALL apply_phase15_marketplace_checkout_schema();
DROP PROCEDURE IF EXISTS apply_phase15_marketplace_checkout_schema;

