-- migrations/016_phase76c_printhouse_bindings.sql
-- Phase 76C — Printhouse Profile Binding Schema

CREATE TABLE IF NOT EXISTS marketplace_order_printhouse_bindings (
    id VARCHAR(50) PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL,
    tenant_id VARCHAR(50) NOT NULL,
    printhouse_id VARCHAR(50) NOT NULL,
    selected_machine_id VARCHAR(50),
    selected_media_id VARCHAR(50),
    selected_policy_profile_id VARCHAR(50),
    selected_sla_profile_id VARCHAR(50),
    printhouse_snapshot_json TEXT,
    machine_snapshot_json TEXT,
    media_snapshot_json TEXT,
    policy_profile_snapshot_json TEXT,
    sla_profile_snapshot_json TEXT,
    binding_status VARCHAR(50) NOT NULL DEFAULT 'DRAFT', -- DRAFT, BOUND, SUPERSEDED, CANCELLED
    bound_by_user_id VARCHAR(100),
    bound_by_role VARCHAR(100),
    bound_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_order_printhouse_binding (order_id, printhouse_id, binding_status)
);
