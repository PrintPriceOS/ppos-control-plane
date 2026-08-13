-- Phase 191H — Marketplace Readiness, Governed Review & Controlled Activation Schema

CREATE TABLE IF NOT EXISTS printhouse_marketplace_reviews (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    site_id VARCHAR(64) NULL,
    readiness_version VARCHAR(32) NOT NULL DEFAULT '191H_v1',
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT', -- DRAFT, READY_FOR_REVIEW, UNDER_REVIEW, CHANGES_REQUESTED, APPROVED, REJECTED, SUSPENDED
    submitted_by_json JSON NULL,
    submitted_at DATETIME NULL,
    reviewed_by_json JSON NULL,
    reviewed_at DATETIME NULL,
    reason_code VARCHAR(64) NULL,
    explanation TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ph_mp_rev_tenant (tenant_id),
    INDEX idx_ph_mp_rev_status (status),
    CONSTRAINT fk_ph_mp_rev_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS printhouse_review_snapshots (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    review_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    snapshot_hash VARCHAR(255) NOT NULL,
    snapshot_json JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ph_rev_snap_tenant (tenant_id),
    INDEX idx_ph_rev_snap_review (review_id),
    CONSTRAINT fk_ph_rev_snap_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_ph_rev_snap_review FOREIGN KEY (review_id) REFERENCES printhouse_marketplace_reviews(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS printhouse_activation_grants (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    review_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    site_id VARCHAR(64) NULL,
    granted_by_json JSON NOT NULL,
    marketplace_visible BOOLEAN NOT NULL DEFAULT FALSE,
    live_quoting_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    job_routing_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    production_dispatch_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, SUSPENDED, DEACTIVATED
    granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ph_act_grant_tenant (tenant_id),
    INDEX idx_ph_act_grant_review (review_id),
    CONSTRAINT fk_ph_act_grant_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_ph_act_grant_review FOREIGN KEY (review_id) REFERENCES printhouse_marketplace_reviews(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS printhouse_marketplace_review_audits (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    review_id VARCHAR(64) NOT NULL,
    action VARCHAR(64) NOT NULL,
    actor_json JSON NULL,
    changes_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ph_mprev_aud_tenant (tenant_id),
    INDEX idx_ph_mprev_aud_review (review_id),
    CONSTRAINT fk_ph_mprev_aud_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
