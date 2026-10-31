-- migrations/059_phase117_production_deployment_dry_run_rollback_drill.sql
-- Phase 117 - Production Deployment Dry Run / Rollback Drill
-- Dry-run only. No real deployment, no production activation, no financial execution.

CREATE TABLE IF NOT EXISTS production_deployment_dry_runs (
    id INT AUTO_INCREMENT PRIMARY KEY,

    dry_run_id VARCHAR(100) NOT NULL UNIQUE,
    readiness_reference_id VARCHAR(100) NULL,
    requested_by VARCHAR(100) NOT NULL,

    status ENUM(
        'PENDING',
        'DRY_RUN_RUNNING',
        'DRY_RUN_PASSED',
        'DRY_RUN_FAILED'
    ) NOT NULL DEFAULT 'PENDING',

    deployment_dry_run_only BOOLEAN NOT NULL DEFAULT TRUE,
    real_deployment_executed BOOLEAN NOT NULL DEFAULT FALSE,
    service_restart_executed BOOLEAN NOT NULL DEFAULT FALSE,
    rollback_executed BOOLEAN NOT NULL DEFAULT FALSE,
    source_mutation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    external_submission_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    production_activation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    full_public_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    live_provider_connectivity_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    payment_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    refund_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    payout_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE,

    simulated_deployment_steps_json JSON NULL,
    health_check_results_json JSON NULL,
    evidence_metadata_json JSON NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS production_deployment_dry_run_steps (
    id INT AUTO_INCREMENT PRIMARY KEY,

    step_id VARCHAR(100) NOT NULL UNIQUE,
    dry_run_id VARCHAR(100) NOT NULL,
    step_name VARCHAR(200) NOT NULL,
    step_type ENUM(
        'PRE_DEPLOY_CHECK',
        'MIGRATION_VERIFY',
        'BACKUP_VERIFY',
        'SERVICE_RESTART_SIMULATED',
        'HEALTH_CHECK_SIMULATED',
        'SMOKE_TEST_SIMULATED',
        'ROLLBACK_PLAN_VERIFY',
        'POST_DEPLOY_CHECK'
    ) NOT NULL DEFAULT 'PRE_DEPLOY_CHECK',
    status ENUM('PENDING', 'RUNNING', 'PASSED', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
    simulated_only BOOLEAN NOT NULL DEFAULT TRUE,
    result_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (dry_run_id) REFERENCES production_deployment_dry_runs(dry_run_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS production_deployment_rollback_drills (
    id INT AUTO_INCREMENT PRIMARY KEY,

    rollback_drill_id VARCHAR(100) NOT NULL UNIQUE,
    dry_run_id VARCHAR(100) NOT NULL,
    rollback_scenario VARCHAR(200) NOT NULL DEFAULT 'STANDARD_ROLLBACK',
    rollback_simulated_only BOOLEAN NOT NULL DEFAULT TRUE,
    real_rollback_executed BOOLEAN NOT NULL DEFAULT FALSE,
    rollback_steps_json JSON NULL,
    status ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    triggered_by VARCHAR(100) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (dry_run_id) REFERENCES production_deployment_dry_runs(dry_run_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS production_deployment_dry_run_audits (
    id INT AUTO_INCREMENT PRIMARY KEY,

    audit_id VARCHAR(100) NOT NULL UNIQUE,
    dry_run_id VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    actor VARCHAR(100) NOT NULL DEFAULT 'system',
    details_json JSON NULL,
    deployment_dry_run_only BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
