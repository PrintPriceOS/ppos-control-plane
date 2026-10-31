-- migrations/168_phase196g_order_quote_revisions.sql
-- PrintPrice OS — Phase 196G: Governed Persistence for Order Quote Revisions & Single-Use Tokens (BUDGET-02C-01)
--
-- Strict Relational, Financial & Security Guarantees:
-- 1. Full Economic Auditability: Base net, revised net, delta net, base tax, revised tax, delta tax and gross totals with DECIMAL(12, 4) precision.
-- 2. Concurrency Serialization: Generated stored column active_revision_slot with UNIQUE KEY uk_oqr_active_slot ensures AT MOST ONE PENDING revision per order intent simultaneously.
-- 3. Cryptographic Token Protection: quote_revision_tokens stores only token_hash (SHA-256) and public prefix; raw plaintext token is NEVER persisted in database.
-- 4. Multi-Tenant Isolation: tenant_id indexed across all three tables with strict cascade/restrict integrity.
-- 5. Append-Only Event Ledger: order_revision_audit_events tracks all lifecycle state transitions immutably.

CREATE TABLE IF NOT EXISTS order_quote_revisions (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    
    printhouse_id VARCHAR(64) NOT NULL,
    
    -- Hybrid Order References (Budget App External Reference & Internal Canonical Order)
    external_order_intent_id VARCHAR(64) NOT NULL,
    canonical_order_id VARCHAR(64) NULL,
    paper_decision_id VARCHAR(64) NOT NULL,
    
    revision_number INT NOT NULL DEFAULT 1,
    status ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED', 'REVOKED') NOT NULL DEFAULT 'PENDING',
    
    -- Concurrency Engine: Exactly ONE PENDING revision per (tenant, order_intent)
    active_revision_slot VARCHAR(192) GENERATED ALWAYS AS (
        IF(status = 'PENDING', CONCAT(tenant_id, ':', external_order_intent_id), NULL)
    ) STORED,
    
    -- Canonical Monetary Breakdown (DECIMAL(12, 4) for intermediate rounding accuracy)
    currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
    base_net_amount DECIMAL(12, 4) NOT NULL,
    delta_net_amount DECIMAL(12, 4) NOT NULL,
    revised_net_amount DECIMAL(12, 4) NOT NULL,
    
    -- Governed Fiscal Breakdown (Resolved by Control Plane Tax Engine)
    -- delta_tax_amount = revised_tax_amount - base_tax_amount
    base_tax_amount DECIMAL(12, 4) NOT NULL,
    delta_tax_amount DECIMAL(12, 4) NOT NULL,
    revised_tax_amount DECIMAL(12, 4) NOT NULL,
    tax_rate_pct DECIMAL(5, 2) NOT NULL,
    
    base_gross_amount DECIMAL(12, 4) NOT NULL,
    delta_gross_amount DECIMAL(12, 4) NOT NULL,
    revised_gross_amount DECIMAL(12, 4) NOT NULL,
    
    -- Engine Traceability & Reproducibility
    bpe_calculation_id VARCHAR(128) NOT NULL,
    bpe_engine_version VARCHAR(32) NOT NULL,
    bpe_rates_checksum VARCHAR(128) NOT NULL,
    
    -- Immutable Cryptographic Snapshots
    snapshot_canonical_hash CHAR(64) NOT NULL,
    breakdown_json JSON NOT NULL,
    technical_specs_snapshot_json JSON NOT NULL,
    applied_policies_json JSON NOT NULL,
    tax_resolution_snapshot_json JSON NULL,
    
    -- Temporal Validity & Printhouse Working Hours
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    effective_business_hours INT NOT NULL DEFAULT 48,
    supplier_offer_valid_until TIMESTAMP NULL,
    printhouse_timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Madrid',
    
    -- Client Response & Forensic Consent Record
    consent_record_json JSON NULL,
    responded_at TIMESTAMP NULL,
    revocation_reason VARCHAR(255) NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_oqr_tenant (tenant_id),
    INDEX idx_oqr_printhouse (printhouse_id),
    INDEX idx_oqr_ext_intent (external_order_intent_id),
    INDEX idx_oqr_order (canonical_order_id),
    INDEX idx_oqr_decision (paper_decision_id),
    INDEX idx_oqr_status (status),
    INDEX idx_oqr_expires_at (expires_at),
    INDEX idx_oqr_created_at (created_at),
    UNIQUE KEY uk_oqr_active_slot (active_revision_slot),
    
    -- Internal SQL Foreign Key to order_paper_decisions
    CONSTRAINT fk_oqr_paper_decision FOREIGN KEY (paper_decision_id) REFERENCES order_paper_decisions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quote_revision_tokens (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    revision_id VARCHAR(64) NOT NULL,
    
    -- Zero Plaintext Persistence: SHA-256 hash of raw CSPRNG token
    token_hash CHAR(64) NOT NULL,
    token_prefix VARCHAR(16) NOT NULL,
    recipient_email_hash CHAR(64) NOT NULL,
    
    -- Cryptographic Context Binding
    bound_amount DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    bound_currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
    
    status ENUM('PENDING', 'CONSUMED', 'EXPIRED', 'REVOKED') NOT NULL DEFAULT 'PENDING',
    expires_at TIMESTAMP NOT NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    
    -- Cryptographic Real OTP Challenge & Delivery Proof (SEC-C01)
    otp_hash CHAR(64) NULL,
    otp_salt VARCHAR(32) NULL,
    otp_expires_at TIMESTAMP NULL,
    otp_attempts INT NOT NULL DEFAULT 0,
    otp_max_attempts INT NOT NULL DEFAULT 3,
    otp_delivery_channel VARCHAR(32) NULL,
    otp_delivery_status ENUM('NOT_APPLICABLE', 'PENDING', 'PROVIDER_ACCEPTED', 'DELIVERED', 'FAILED') NOT NULL DEFAULT 'NOT_APPLICABLE',
    otp_delivered_at TIMESTAMP NULL,
    otp_delivery_proof_json JSON NULL,
    
    consumed_at TIMESTAMP NULL,
    consumed_ip_hash CHAR(64) NULL,
    consumed_user_agent_hash CHAR(64) NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_qrt_tenant (tenant_id),
    INDEX idx_qrt_revision (revision_id),
    INDEX idx_qrt_prefix (token_prefix),
    INDEX idx_qrt_status (status),
    INDEX idx_qrt_expires_at (expires_at),
    INDEX idx_qrt_otp_delivery (otp_delivery_status),
    UNIQUE KEY uk_qrt_token_hash (token_hash),
    
    CONSTRAINT fk_qrt_revision FOREIGN KEY (revision_id) REFERENCES order_quote_revisions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_revision_audit_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    revision_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    actor_type VARCHAR(32) NOT NULL,
    actor_id VARCHAR(64) NOT NULL,
    payload_json JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_orae_tenant (tenant_id),
    INDEX idx_orae_revision (revision_id),
    INDEX idx_orae_event_type (event_type),
    INDEX idx_orae_created_at (created_at),
    UNIQUE KEY uk_orae_event_id (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
