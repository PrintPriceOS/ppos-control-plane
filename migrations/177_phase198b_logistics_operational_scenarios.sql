-- =============================================================================
-- Migration 177: Phase 198B (LOGISTICS-04) — Operational Logistics Scenarios:
-- Dual Tracking Protocol, 48h Slot Booking Governance & LDM/Double-Deck/Plant Stackability
-- =============================================================================
-- 1. Extends `freight_rate_matrices` with operational scenario governance columns:
--    - `tracking_integration_mode` ENUM('CARRIER_API', 'MANUAL_PORTAL_OR_CMR') DEFAULT 'CARRIER_API'
--    - `slot_booking_management` ENUM('CARRIER_MANAGED', 'SHIPPER_MANAGED') DEFAULT 'CARRIER_MANAGED'
--    - `carrier_slot_buffer_days` INT UNSIGNED DEFAULT 2
--    - `stackability_handling` ENUM('STRICT_LDM_NON_STACKABLE', 'DOUBLE_DECK_SUPPORTED', 'AUTO_STACK_AT_PRINTSHOP') DEFAULT 'STRICT_LDM_NON_STACKABLE'
--    - `ldm_taxable_weight_ratio_kg` DECIMAL(8,2) DEFAULT 1850.00
-- 2. Updates platform baseline freight rate matrices with realistic carrier operational
--    defaults (Dachser / DB Schenker / Raben).
-- =============================================================================

ALTER TABLE freight_rate_matrices
    ADD COLUMN tracking_integration_mode ENUM('CARRIER_API', 'MANUAL_PORTAL_OR_CMR') NOT NULL DEFAULT 'CARRIER_API' AFTER tail_lift_surcharge_eur,
    ADD COLUMN slot_booking_management ENUM('CARRIER_MANAGED', 'SHIPPER_MANAGED') NOT NULL DEFAULT 'CARRIER_MANAGED' AFTER tracking_integration_mode,
    ADD COLUMN carrier_slot_buffer_days INT UNSIGNED NOT NULL DEFAULT 2 AFTER slot_booking_management,
    ADD COLUMN stackability_handling ENUM('STRICT_LDM_NON_STACKABLE', 'DOUBLE_DECK_SUPPORTED', 'AUTO_STACK_AT_PRINTSHOP') NOT NULL DEFAULT 'STRICT_LDM_NON_STACKABLE' AFTER carrier_slot_buffer_days,
    ADD COLUMN ldm_taxable_weight_ratio_kg DECIMAL(8,2) NOT NULL DEFAULT 1850.00 AFTER stackability_handling;

UPDATE freight_rate_matrices
SET
    tracking_integration_mode = 'CARRIER_API',
    slot_booking_management = 'CARRIER_MANAGED',
    carrier_slot_buffer_days = 2,
    stackability_handling = 'DOUBLE_DECK_SUPPORTED',
    ldm_taxable_weight_ratio_kg = 1850.00
WHERE id IN ('frm-global-de-99-dachser-001', 'frm-global-es-de-dachser-004');

UPDATE freight_rate_matrices
SET
    tracking_integration_mode = 'CARRIER_API',
    slot_booking_management = 'CARRIER_MANAGED',
    carrier_slot_buffer_days = 2,
    stackability_handling = 'STRICT_LDM_NON_STACKABLE',
    ldm_taxable_weight_ratio_kg = 1850.00
WHERE id IN ('frm-global-de-33-schenker-002', 'frm-global-de-all-raben-003');

