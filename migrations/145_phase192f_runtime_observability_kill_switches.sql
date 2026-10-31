-- Migration 145: Phase 192F Runtime Observability & Emergency Kill Switches
-- Establishes database persistence for emergency kill switch overrides and operational incidents.

CREATE TABLE IF NOT EXISTS runtime_kill_switches (
    id VARCHAR(64) PRIMARY KEY,
    scope VARCHAR(32) NOT NULL DEFAULT 'GLOBAL', -- GLOBAL, TENANT, PRINTHOUSE, SITE
    target_id VARCHAR(64) NULL, -- tenant_id / printhouse_id / site_id (NULL for GLOBAL)
    capability VARCHAR(64) NOT NULL, -- ALL, MARKETPLACE_VISIBLE, LIVE_QUOTING_ALLOWED, JOB_ROUTING_ALLOWED, PRODUCTION_DISPATCH_ALLOWED
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, CLEARED, EXPIRED
    reason_code VARCHAR(64) NOT NULL,
    description TEXT NULL,
    actor_id VARCHAR(64) NOT NULL DEFAULT 'system',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cleared_at TIMESTAMP NULL,
    cleared_by VARCHAR(64) NULL,
    INDEX idx_kill_scope_cap (scope, target_id, capability, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS runtime_incidents (
    id VARCHAR(64) PRIMARY KEY,
    domain VARCHAR(64) NOT NULL, -- DISCOVERY, QUOTING, MATCHING, ROUTING, DISPATCH, TELEMETRY, INTEGRATIONS
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN', -- OPEN, MITIGATED, RESOLVED
    reason_code VARCHAR(64) NOT NULL,
    description TEXT NULL,
    kill_switch_id VARCHAR(64) NULL,
    actor_id VARCHAR(64) NOT NULL DEFAULT 'system',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    INDEX idx_incidents_domain (domain, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
