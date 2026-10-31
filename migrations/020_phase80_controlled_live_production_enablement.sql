-- migrations/020_phase80_controlled_live_production_enablement.sql

CREATE TABLE IF NOT EXISTS live_production_enablements (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    printhouse_id VARCHAR(64) NOT NULL,
    enablement_status ENUM('NOT_REQUESTED', 'REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE', 'PAUSED', 'REVOKED', 'REJECTED', 'BLOCKED') NOT NULL DEFAULT 'NOT_REQUESTED',
    commercial_status ENUM('PILOT_ONLY', 'LIVE_REVIEW', 'APPROVED_FOR_LIVE', 'LIVE', 'LIVE_PAUSED', 'LIVE_REVOKED') NOT NULL DEFAULT 'PILOT_ONLY',
    live_production_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    live_scope ENUM('INTERNAL_TEST', 'PARTNER_PILOT', 'LIMITED_LIVE', 'FULL_LIVE') DEFAULT NULL,
    
    allowed_order_types_json JSON DEFAULT NULL,
    allowed_customer_segments_json JSON DEFAULT NULL,
    allowed_printhouse_ids_json JSON DEFAULT NULL,
    allowed_machine_ids_json JSON DEFAULT NULL,
    
    max_live_orders_per_day INT DEFAULT NULL,
    max_live_jobs_per_day INT DEFAULT NULL,
    max_live_file_size_mb INT DEFAULT NULL,
    max_live_handoff_packages_per_day INT DEFAULT NULL,
    
    require_manual_handoff_approval BOOLEAN DEFAULT TRUE,
    require_operator_confirmation BOOLEAN DEFAULT TRUE,
    require_payment_confirmation BOOLEAN DEFAULT TRUE,
    require_customer_proof_approval BOOLEAN DEFAULT TRUE,
    require_artifact_trust_certified BOOLEAN DEFAULT TRUE,
    require_policy_profile_passed BOOLEAN DEFAULT TRUE,
    require_machine_compatibility_passed BOOLEAN DEFAULT TRUE,
    require_quota_check_passed BOOLEAN DEFAULT TRUE,
    require_sla_monitoring_active BOOLEAN DEFAULT TRUE,
    
    readiness_snapshot_json JSON DEFAULT NULL,
    approval_snapshot_json JSON DEFAULT NULL,
    revocation_snapshot_json JSON DEFAULT NULL,
    blocking_reasons_json JSON DEFAULT NULL,
    warning_reasons_json JSON DEFAULT NULL,
    
    requested_by VARCHAR(64) DEFAULT NULL,
    requested_by_role VARCHAR(64) DEFAULT NULL,
    requested_at DATETIME DEFAULT NULL,
    
    reviewed_by VARCHAR(64) DEFAULT NULL,
    reviewed_by_role VARCHAR(64) DEFAULT NULL,
    reviewed_at DATETIME DEFAULT NULL,
    
    approved_by VARCHAR(64) DEFAULT NULL,
    approved_by_role VARCHAR(64) DEFAULT NULL,
    approved_at DATETIME DEFAULT NULL,
    
    activated_by VARCHAR(64) DEFAULT NULL,
    activated_by_role VARCHAR(64) DEFAULT NULL,
    activated_at DATETIME DEFAULT NULL,
    
    paused_by VARCHAR(64) DEFAULT NULL,
    paused_by_role VARCHAR(64) DEFAULT NULL,
    paused_at DATETIME DEFAULT NULL,
    
    revoked_by VARCHAR(64) DEFAULT NULL,
    revoked_by_role VARCHAR(64) DEFAULT NULL,
    revoked_at DATETIME DEFAULT NULL,
    
    rejection_reason TEXT DEFAULT NULL,
    pause_reason TEXT DEFAULT NULL,
    revocation_reason TEXT DEFAULT NULL,
    
    metadata_json JSON DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_tenant_printhouse (tenant_id, printhouse_id),
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_printhouse_id (printhouse_id),
    INDEX idx_enablement_status (enablement_status),
    INDEX idx_live_production_enabled (live_production_enabled)
);

CREATE TABLE IF NOT EXISTS live_production_approval_events (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    printhouse_id VARCHAR(64) NOT NULL,
    enablement_id VARCHAR(64) NOT NULL,
    event_type ENUM(
        'LIVE_ENABLEMENT_REQUESTED', 
        'LIVE_ENABLEMENT_UNDER_REVIEW', 
        'LIVE_ENABLEMENT_APPROVED', 
        'LIVE_ENABLEMENT_REJECTED', 
        'LIVE_ENABLEMENT_ACTIVATED', 
        'LIVE_ENABLEMENT_PAUSED', 
        'LIVE_ENABLEMENT_RESUMED', 
        'LIVE_ENABLEMENT_REVOKED', 
        'LIVE_ENABLEMENT_BLOCKED', 
        'LIVE_READINESS_EVALUATED', 
        'LIVE_SCOPE_CHANGED', 
        'LIVE_GUARD_BLOCKED_ACTION'
    ) NOT NULL,
    actor_user_id VARCHAR(64) NOT NULL,
    actor_role VARCHAR(64) NOT NULL,
    before_json JSON DEFAULT NULL,
    after_json JSON DEFAULT NULL,
    message TEXT DEFAULT NULL,
    metadata_json JSON DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_printhouse_id (printhouse_id),
    INDEX idx_enablement_id (enablement_id),
    INDEX idx_event_type (event_type),
    INDEX idx_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS live_production_guard_decisions (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    printhouse_id VARCHAR(64) NOT NULL,
    order_id VARCHAR(64) DEFAULT NULL,
    job_id VARCHAR(64) DEFAULT NULL,
    enablement_id VARCHAR(64) NOT NULL,
    action ENUM(
        'CREATE_LIVE_ORDER', 
        'ENTER_LIVE_QUEUE', 
        'START_LIVE_PRODUCTION', 
        'GENERATE_LIVE_HANDOFF', 
        'SEND_TO_PRINTHOUSE', 
        'MARK_LIVE_COMPLETED'
    ) NOT NULL,
    decision ENUM('ALLOWED', 'BLOCKED', 'WARNING', 'REVIEW_REQUIRED') NOT NULL,
    blocking_reasons_json JSON DEFAULT NULL,
    warning_reasons_json JSON DEFAULT NULL,
    governance_snapshot_json JSON DEFAULT NULL,
    actor_user_id VARCHAR(64) NOT NULL,
    actor_role VARCHAR(64) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_printhouse_id (printhouse_id),
    INDEX idx_order_id (order_id),
    INDEX idx_job_id (job_id),
    INDEX idx_enablement_id (enablement_id),
    INDEX idx_action (action),
    INDEX idx_decision (decision),
    INDEX idx_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS live_production_revocations (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    printhouse_id VARCHAR(64) NOT NULL,
    enablement_id VARCHAR(64) NOT NULL,
    revocation_type ENUM(
        'MANUAL', 
        'GOVERNANCE_FAILURE', 
        'PAYMENT_FAILURE', 
        'SECURITY_INCIDENT', 
        'SLA_FAILURE', 
        'TENANT_ISOLATION_FAILURE', 
        'OPERATOR_DECISION'
    ) NOT NULL,
    reason TEXT NOT NULL,
    impact_scope ENUM('NEW_ORDERS_ONLY', 'QUEUE_AND_NEW_ORDERS', 'FULL_STOP') NOT NULL,
    affected_orders_json JSON DEFAULT NULL,
    rollback_actions_json JSON DEFAULT NULL,
    actor_user_id VARCHAR(64) NOT NULL,
    actor_role VARCHAR(64) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_printhouse_id (printhouse_id),
    INDEX idx_enablement_id (enablement_id),
    INDEX idx_created_at (created_at)
);
