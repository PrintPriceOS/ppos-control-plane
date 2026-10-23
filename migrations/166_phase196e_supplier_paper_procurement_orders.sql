-- migrations/166_phase196e_supplier_paper_procurement_orders.sql
-- Phase 196E: Supplier Paper Procurement Orders, Bidirectional RFQ, and Warehouse Receipts (Iterations I4 & I5)

-- 1. Procurement Orders and RFQs Table
CREATE TABLE IF NOT EXISTS supplier_paper_procurement_orders (
    id VARCHAR(64) PRIMARY KEY,
    order_number VARCHAR(64) NOT NULL UNIQUE,
    order_type ENUM('RFQ', 'ORDER') NOT NULL DEFAULT 'ORDER',
    tenant_id VARCHAR(64) NOT NULL,
    printhouse_id VARCHAR(64) NOT NULL,
    supplier_id VARCHAR(64) NOT NULL,
    offer_id VARCHAR(64) NULL,
    offer_revision_id VARCHAR(64) NULL,
    variant_id VARCHAR(64) NOT NULL,
    material_inventory_id VARCHAR(64) NULL,
    
    -- Immutable Snapshot of Physical & Technical Specifications
    snapshot_product_name VARCHAR(255) NOT NULL,
    snapshot_brand VARCHAR(128) NULL,
    snapshot_category VARCHAR(64) NOT NULL,
    snapshot_finish VARCHAR(64) NULL,
    snapshot_gsm INT NOT NULL,
    snapshot_width_mm DECIMAL(10, 2) NOT NULL,
    snapshot_height_mm DECIMAL(10, 2) NOT NULL,
    snapshot_caliper_um INT NULL,
    snapshot_grain_direction VARCHAR(16) NULL,

    -- Immutable Snapshot of Commercial & Pricing Terms
    snapshot_price_basis VARCHAR(32) NOT NULL,
    snapshot_price_per_basis DECIMAL(12, 4) NOT NULL,
    snapshot_currency VARCHAR(3) NOT NULL,
    snapshot_supplier_sku VARCHAR(64) NULL,
    snapshot_sheets_per_pack INT NULL,

    -- Order Quantities & Calculation
    ordered_quantity DECIMAL(14, 4) NOT NULL,
    ordered_quantity_basis VARCHAR(32) NOT NULL,
    total_sheets INT NOT NULL,
    delivered_quantity DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    delivered_sheets INT NOT NULL DEFAULT 0,
    received_quantity DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    received_sheets INT NOT NULL DEFAULT 0,
    total_amount DECIMAL(14, 2) NOT NULL,

    -- Order Lifecycle State Machine
    status ENUM('SUBMITTED', 'QUOTED', 'REJECTED', 'CONFIRMED', 'DISPATCHED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED') NOT NULL DEFAULT 'SUBMITTED',

    -- Logistics & Delivery
    delivery_site_name VARCHAR(128) NULL,
    delivery_address TEXT NULL,
    expected_delivery_date TIMESTAMP NULL,
    dispatched_at TIMESTAMP NULL,
    delivered_at TIMESTAMP NULL,
    cancelled_at TIMESTAMP NULL,
    cancellation_reason TEXT NULL,
    supplier_notes TEXT NULL,
    buyer_notes TEXT NULL,

    created_by_user_id VARCHAR(64) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_sppo_tenant (tenant_id, printhouse_id),
    INDEX idx_sppo_supplier (supplier_id, status),
    INDEX idx_sppo_variant (variant_id),
    INDEX idx_sppo_offer (offer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Warehouse Receipts Ledger (Atomic & Idempotent Tracking)
CREATE TABLE IF NOT EXISTS supplier_paper_order_receipts (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    printhouse_id VARCHAR(64) NOT NULL,
    supplier_id VARCHAR(64) NOT NULL,
    receipt_number VARCHAR(64) NOT NULL,
    received_quantity DECIMAL(14, 4) NOT NULL,
    received_sheets INT NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    material_inventory_id VARCHAR(64) NOT NULL,
    inventory_event_id VARCHAR(64) NULL,
    operator_id VARCHAR(64) NOT NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_spor_order (order_id),
    INDEX idx_spor_tenant_center (tenant_id, printhouse_id),
    CONSTRAINT fk_spor_order FOREIGN KEY (order_id) REFERENCES supplier_paper_procurement_orders (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
