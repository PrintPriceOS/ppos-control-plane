-- migrations/021_phase81_live_order_operations_limited_commercial_pilot.sql

CREATE TABLE IF NOT EXISTS live_orders (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    customer_id VARCHAR(36),
    printhouse_id VARCHAR(36),
    source_order_id VARCHAR(36),
    marketplace_order_id VARCHAR(36),
    live_enablement_id VARCHAR(36),
    live_order_number VARCHAR(100),
    external_reference VARCHAR(100),
    live_order_status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    live_scope VARCHAR(50) NOT NULL,
    order_type VARCHAR(50) NOT NULL,
    source_channel VARCHAR(50) NOT NULL DEFAULT 'API',
    rollback_status VARCHAR(50) NOT NULL DEFAULT 'NONE',
    customer_visible_status VARCHAR(100),
    internal_operator_status VARCHAR(100),
    required_files_json JSON,
    uploaded_files_json JSON,
    preflight_jobs_json JSON,
    proof_status VARCHAR(50),
    payment_status VARCHAR(50),
    artifact_trust_status VARCHAR(50),
    machine_assignment_status VARCHAR(50),
    handoff_status VARCHAR(50),
    sla_status VARCHAR(50),
    incident_status VARCHAR(50),
    live_guard_status VARCHAR(50),
    live_guard_snapshot_json JSON,
    governance_snapshot_json JSON,
    customer_safe_snapshot_json JSON,
    operator_snapshot_json JSON,
    created_by VARCHAR(36) NOT NULL,
    created_by_role VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    cancelled_at TIMESTAMP NULL,
    revoked_at TIMESTAMP NULL,
    UNIQUE KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS live_order_events (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    live_order_id VARCHAR(36) NOT NULL,
    marketplace_order_id VARCHAR(36),
    job_id VARCHAR(36),
    event_type VARCHAR(50) NOT NULL,
    event_status VARCHAR(50) NOT NULL DEFAULT 'INFO',
    actor_user_id VARCHAR(36) NOT NULL,
    actor_role VARCHAR(50) NOT NULL,
    message TEXT,
    metadata_json JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_live_order_events_tenant_order (tenant_id, live_order_id)
);

CREATE TABLE IF NOT EXISTS live_order_gate_snapshots (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    live_order_id VARCHAR(36) NOT NULL,
    marketplace_order_id VARCHAR(36),
    gate_name VARCHAR(50) NOT NULL,
    gate_status VARCHAR(50) NOT NULL,
    snapshot_json JSON,
    snapshot_hash VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_live_order_gate_snapshots (tenant_id, live_order_id, gate_name)
);

CREATE TABLE IF NOT EXISTS live_order_rollback_actions (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    live_order_id VARCHAR(36) NOT NULL,
    marketplace_order_id VARCHAR(36),
    rollback_type VARCHAR(50) NOT NULL,
    trigger_type VARCHAR(50) NOT NULL,
    rollback_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    reason TEXT,
    executed_by VARCHAR(36),
    executed_by_role VARCHAR(50),
    executed_at TIMESTAMP NULL,
    metadata_json JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_live_order_rollback_actions (tenant_id, live_order_id)
);
