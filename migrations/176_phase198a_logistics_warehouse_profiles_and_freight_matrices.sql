-- =============================================================================
-- Migration 176: Phase 198A (LOGISTICS-02) — Warehouse Delivery Profiles,
-- Freight Rate Matrices (LTL/FTL Stepped Pallet Tiers) & Packaging Consumable Rates
-- =============================================================================
-- 1. Creates `warehouse_delivery_profiles` for editorial & fulfillment hubs
--    (e.g. Zeitfracht Erfurt, Arvato VVA Gütersloh, Amazon EU FBA, Standard Dock).
-- 2. Creates `freight_rate_matrices` for stepped pallet LTL/FTL, LDM, and
--    volumetric weight freight tariffs per origin/destination postal zone.
-- 3. Creates `packaging_consumable_rates` for EPAL Euro-pallets, double-wall
--    FEFCO 0201 cartons, and stretch-wrap consumables (segregated from freight).
-- 4. Seeds default warehouse profiles, baseline freight rate matrices, and
--    platform default packaging consumable rates idempotently (`INSERT IGNORE`).
-- =============================================================================

CREATE TABLE IF NOT EXISTS warehouse_delivery_profiles (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    country_code CHAR(2) NOT NULL DEFAULT 'DE',
    postal_code VARCHAR(16) NULL,
    city VARCHAR(100) NULL,
    address_line VARCHAR(255) NULL,
    max_pallet_height_mm INT UNSIGNED NOT NULL DEFAULT 1200,
    max_pallet_weight_kg DECIMAL(8,2) NOT NULL DEFAULT 1000.00,
    perimeter_margin_mm INT UNSIGNED NOT NULL DEFAULT 0,
    max_carton_weight_kg DECIMAL(6,2) NOT NULL DEFAULT 15.00,
    requires_slot_booking BOOLEAN NOT NULL DEFAULT FALSE,
    slot_booking_lead_time_hours INT UNSIGNED NOT NULL DEFAULT 48,
    requires_flat_top_layer BOOLEAN NOT NULL DEFAULT FALSE,
    requires_loading_dock BOOLEAN NOT NULL DEFAULT TRUE,
    penalty_oversized_pallet_eur DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    penalty_unbooked_slot_eur DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_wdp_country_postal (country_code, postal_code),
    INDEX idx_wdp_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS freight_rate_matrices (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    printhouse_id VARCHAR(64) NULL,
    origin_country CHAR(2) NOT NULL,
    origin_postal_zone VARCHAR(16) NOT NULL DEFAULT '*',
    destination_country CHAR(2) NOT NULL,
    destination_postal_zone VARCHAR(16) NOT NULL DEFAULT '*',
    carrier_name VARCHAR(100) NOT NULL,
    transit_days_min INT UNSIGNED NOT NULL DEFAULT 2,
    transit_days_max INT UNSIGNED NOT NULL DEFAULT 5,
    pricing_mode ENUM('PER_PALLET_STEPPED', 'PER_LDM', 'PER_KG_VOLUMETRIC') NOT NULL DEFAULT 'PER_PALLET_STEPPED',
    rate_tiers_json JSON NOT NULL,
    fuel_surcharge_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    tail_lift_surcharge_eur DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_frm_printhouse_route (printhouse_id, origin_country, destination_country, destination_postal_zone, is_active),
    INDEX idx_frm_carrier (carrier_name, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS packaging_consumable_rates (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    printhouse_id VARCHAR(64) NULL,
    euro_pallet_epal_eur DECIMAL(8,2) NOT NULL DEFAULT 14.50,
    carton_box_standard_eur DECIMAL(6,2) NOT NULL DEFAULT 0.85,
    stretch_wrap_per_pallet_eur DECIMAL(6,2) NOT NULL DEFAULT 2.20,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_pcr_printhouse_active (printhouse_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- Seed Initial Editorial Warehouse Delivery Profiles (Idempotent)
-- =============================================================================
INSERT IGNORE INTO warehouse_delivery_profiles (
    id, code, name, country_code, postal_code, city, address_line,
    max_pallet_height_mm, max_pallet_weight_kg, perimeter_margin_mm, max_carton_weight_kg,
    requires_slot_booking, slot_booking_lead_time_hours, requires_flat_top_layer, requires_loading_dock,
    penalty_oversized_pallet_eur, penalty_unbooked_slot_eur, is_active
) VALUES
(
    'wdp-zeitfracht-erfurt-001',
    'ZEITFRACHT_ERFURT',
    'Zeitfracht Medien GmbH (Erfurt Book Logistics Hub)',
    'DE',
    '99098',
    'Erfurt',
    'Ferdinand-Jühlke-Straße 7',
    1200,
    1000.00,
    30,
    15.00,
    TRUE,
    48,
    FALSE,
    TRUE,
    40.00,
    128.00,
    TRUE
),
(
    'wdp-arvato-vva-guetersloh-002',
    'ARVATO_VVA_GUETERSLOH',
    'VVA — Vereinigte Verlagsauslieferung (Arvato / Bertelsmann Gütersloh)',
    'DE',
    '33334',
    'Gütersloh',
    'An der Autobahn 100',
    1300,
    700.00,
    20,
    16.00,
    TRUE,
    48,
    TRUE,
    TRUE,
    40.00,
    128.00,
    TRUE
),
(
    'wdp-amazon-eu-fba-std-003',
    'AMAZON_EU_FBA_STD',
    'Amazon EU FBA Fulfillment Center (Standard Pallet Delivery)',
    'DE',
    '36251',
    'Bad Hersfeld',
    'Am Schloß Eichhof 1',
    1800,
    500.00,
    25,
    15.00,
    TRUE,
    72,
    TRUE,
    TRUE,
    50.00,
    150.00,
    TRUE
),
(
    'wdp-standard-commercial-dock-004',
    'STANDARD_COMMERCIAL_DOCK',
    'Standard Commercial / Editorial Warehouse (Loading Dock)',
    'DE',
    '*',
    'Standard',
    'Commercial Loading Dock',
    1650,
    950.00,
    15,
    16.00,
    FALSE,
    24,
    FALSE,
    TRUE,
    35.00,
    90.00,
    TRUE
);

-- =============================================================================
-- Seed Initial Platform Baseline Freight Rate Matrices (Idempotent)
-- =============================================================================
INSERT IGNORE INTO freight_rate_matrices (
    id, printhouse_id, origin_country, origin_postal_zone,
    destination_country, destination_postal_zone, carrier_name,
    transit_days_min, transit_days_max, pricing_mode, rate_tiers_json,
    fuel_surcharge_percent, tail_lift_surcharge_eur, is_active
) VALUES
(
    'frm-global-de-99-dachser-001',
    NULL,
    'DE',
    '*',
    'DE',
    '99',
    'DACHSER',
    1,
    2,
    'PER_PALLET_STEPPED',
    '{"tiers":[{"minPallets":1,"maxPallets":1,"ratePerPalletEur":85.00},{"minPallets":2,"maxPallets":2,"ratePerPalletEur":72.00},{"minPallets":3,"maxPallets":5,"ratePerPalletEur":64.00},{"minPallets":6,"maxPallets":10,"ratePerPalletEur":56.00},{"minPallets":11,"maxPallets":33,"ratePerPalletEur":48.00,"ftlFlatRateEur":1350.00}]}',
    6.50,
    35.00,
    TRUE
),
(
    'frm-global-de-33-schenker-002',
    NULL,
    'DE',
    '*',
    'DE',
    '33',
    'SCHENKER',
    1,
    3,
    'PER_PALLET_STEPPED',
    '{"tiers":[{"minPallets":1,"maxPallets":1,"ratePerPalletEur":88.00},{"minPallets":2,"maxPallets":2,"ratePerPalletEur":75.00},{"minPallets":3,"maxPallets":5,"ratePerPalletEur":66.00},{"minPallets":6,"maxPallets":10,"ratePerPalletEur":58.00},{"minPallets":11,"maxPallets":33,"ratePerPalletEur":50.00,"ftlFlatRateEur":1390.00}]}',
    6.50,
    35.00,
    TRUE
),
(
    'frm-global-de-all-raben-003',
    NULL,
    'DE',
    '*',
    'DE',
    '*',
    'RABEN',
    2,
    4,
    'PER_PALLET_STEPPED',
    '{"tiers":[{"minPallets":1,"maxPallets":1,"ratePerPalletEur":92.00},{"minPallets":2,"maxPallets":2,"ratePerPalletEur":78.00},{"minPallets":3,"maxPallets":5,"ratePerPalletEur":69.00},{"minPallets":6,"maxPallets":10,"ratePerPalletEur":60.00},{"minPallets":11,"maxPallets":33,"ratePerPalletEur":52.00,"ftlFlatRateEur":1450.00}]}',
    7.00,
    38.00,
    TRUE
),
(
    'frm-global-es-de-dachser-004',
    NULL,
    'ES',
    '*',
    'DE',
    '*',
    'DACHSER',
    3,
    5,
    'PER_PALLET_STEPPED',
    '{"tiers":[{"minPallets":1,"maxPallets":1,"ratePerPalletEur":165.00},{"minPallets":2,"maxPallets":2,"ratePerPalletEur":142.00},{"minPallets":3,"maxPallets":5,"ratePerPalletEur":125.00},{"minPallets":6,"maxPallets":10,"ratePerPalletEur":110.00},{"minPallets":11,"maxPallets":33,"ratePerPalletEur":95.00,"ftlFlatRateEur":2650.00}]}',
    8.50,
    45.00,
    TRUE
);

-- =============================================================================
-- Seed Initial Platform Packaging Consumable Rates (Idempotent)
-- =============================================================================
INSERT IGNORE INTO packaging_consumable_rates (
    id, printhouse_id, euro_pallet_epal_eur, carton_box_standard_eur, stretch_wrap_per_pallet_eur, is_active
) VALUES (
    'pcr-global-default-001',
    NULL,
    14.50,
    0.85,
    2.20,
    TRUE
);

