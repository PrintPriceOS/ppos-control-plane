-- Migration 144: Phase 192E.2 Distributed Dispatch Idempotency & Persistent Telemetry Events
-- Establishes database unique constraints to guarantee restart-safe idempotency and distributed replay protection.

CREATE TABLE IF NOT EXISTS manufacturing_dispatches (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    printhouse_id VARCHAR(64) NOT NULL,
    site_id VARCHAR(64) NOT NULL,
    machine_id VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ALLOCATED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_order_dispatch (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS printer_telemetry_events (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    event_id VARCHAR(64) NOT NULL,
    job_id VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_tenant_event (tenant_id, event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
