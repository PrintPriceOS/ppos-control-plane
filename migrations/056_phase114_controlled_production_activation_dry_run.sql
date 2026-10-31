-- migrations/056_phase114_controlled_production_activation_dry_run.sql
-- Phase 114 — Controlled Production Activation Dry Run
-- Review-only / dry-run schema. No live production activation is enabled by this migration.

CREATE TABLE IF NOT EXISTS production_activation_dry_runs (
    id INT AUTO_INCREMENT PRIMARY KEY,

    dry_run_id VARCHAR(100) NOT NULL UNIQUE,
    gate_reference_id VARCHAR(100) NOT NULL,
    requested_by VARCHAR(100) NOT NULL,

    status ENUM(
        'DRAFT',
        'READY_FOR_DRY_RUN',
        'DRY_RUN_RUNNING',
        'DRY_RUN_PASSED',
        'DRY_RUN_FAILED',
        'DRY_RUN_REJECTED',
        'ROLLBACK_SIMULATED'
    ) NOT NULL DEFAULT 'DRAFT',

    dry_run_only BOOLEAN NOT NULL DEFAULT TRUE,
    external_submission_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    source_mutation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    full_public_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    live_provider_connectivity_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    payment_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    refund_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    payout_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE,

    checklist_snapshot_json JSON NULL,
    safety_invariants_json JSON NULL,
    simulated_activation_steps_json JSON NULL,
    simulated_rollback_steps_json JSON NULL,
    audit_metadata_json JSON NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,

    INDEX idx_prod_activation_dry_runs_dry_run_id (dry_run_id),
    INDEX idx_prod_activation_dry_runs_gate_reference_id (gate_reference_id),
    INDEX idx_prod_activation_dry_runs_status (status),
    INDEX idx_prod_activation_dry_runs_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS production_activation_dry_run_steps (
    id INT AUTO_INCREMENT PRIMARY KEY,

    step_id VARCHAR(100) NOT NULL UNIQUE,
    dry_run_id VARCHAR(100) NOT NULL,

    step_key VARCHAR(100) NOT NULL,
    step_name VARCHAR(255) NOT NULL,

    step_status ENUM(
        'PENDING',
        'READY',
        'RUNNING',
        'PASSED',
        'FAILED',
        'SKIPPED',
        'BLOCKED'
    ) NOT NULL DEFAULT 'PENDING',

    safety_checked BOOLEAN NOT NULL DEFAULT TRUE,
    dry_run_only BOOLEAN NOT NULL DEFAULT TRUE,
    external_submission_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    source_mutation_enabled BOOLEAN NOT NULL DEFAULT FALSE,

    payload_snapshot_json JSON NULL,
    result_snapshot_json JSON NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_prod_activation_dry_run_steps_dry_run_id (dry_run_id),
    INDEX idx_prod_activation_dry_run_steps_step_status (step_status),
    INDEX idx_prod_activation_dry_run_steps_step_key (step_key),

    CONSTRAINT fk_prod_activation_dry_run_steps_dry_run
        FOREIGN KEY (dry_run_id)
        REFERENCES production_activation_dry_runs (dry_run_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS production_activation_dry_run_audits (
    id INT AUTO_INCREMENT PRIMARY KEY,

    audit_id VARCHAR(100) NOT NULL UNIQUE,
    dry_run_id VARCHAR(100) NOT NULL,

    action_type VARCHAR(100) NOT NULL,
    actor_id VARCHAR(100) NOT NULL,
    actor_role VARCHAR(100) NOT NULL,

    message TEXT NOT NULL,
    metadata_json JSON NULL,

    dry_run_only BOOLEAN NOT NULL DEFAULT TRUE,
    external_submission_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    source_mutation_enabled BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_prod_activation_dry_run_audits_dry_run_id (dry_run_id),
    INDEX idx_prod_activation_dry_run_audits_action_type (action_type),
    INDEX idx_prod_activation_dry_run_audits_created_at (created_at),

    CONSTRAINT fk_prod_activation_dry_run_audits_dry_run
        FOREIGN KEY (dry_run_id)
        REFERENCES production_activation_dry_runs (dry_run_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS production_activation_rollback_simulations (
    id INT AUTO_INCREMENT PRIMARY KEY,

    rollback_id VARCHAR(100) NOT NULL UNIQUE,
    dry_run_id VARCHAR(100) NOT NULL,

    status ENUM(
        'DRAFT',
        'ROLLBACK_SIMULATION_RUNNING',
        'ROLLBACK_SIMULATION_PASSED',
        'ROLLBACK_SIMULATION_FAILED',
        'ROLLBACK_SIMULATION_REJECTED'
    ) NOT NULL DEFAULT 'DRAFT',

    dry_run_only BOOLEAN NOT NULL DEFAULT TRUE,
    rollback_simulated_only BOOLEAN NOT NULL DEFAULT TRUE,
    external_submission_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    source_mutation_enabled BOOLEAN NOT NULL DEFAULT FALSE,

    simulated_errors_json JSON NULL,
    steps_rolled_back_json JSON NULL,
    audit_metadata_json JSON NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,

    INDEX idx_prod_activation_rollback_simulations_dry_run_id (dry_run_id),
    INDEX idx_prod_activation_rollback_simulations_status (status),
    INDEX idx_prod_activation_rollback_simulations_created_at (created_at),

    CONSTRAINT fk_prod_activation_rollback_simulations_dry_run
        FOREIGN KEY (dry_run_id)
        REFERENCES production_activation_dry_runs (dry_run_id)
        ON DELETE CASCADE
);