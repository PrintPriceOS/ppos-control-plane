-- Migration 148: Governed Pricing Acceptance and Immutable Pricing Revisions
-- Phase 193D: Establish durable audit provenance, drift-free patch acceptance, and immutable rate revisions.

CREATE TABLE IF NOT EXISTS printhouse_pricing_revisions (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    printer_node_id VARCHAR(64) NOT NULL,
    
    source_type ENUM('CALIBRATION_ACCEPTANCE', 'MANUAL_EDIT', 'ROLLBACK_FORWARD', 'INITIAL_PROVISION') NOT NULL,
    source_calibration_session_id VARCHAR(64) NULL,
    source_calibration_run_id VARCHAR(64) NULL,
    parent_revision_id VARCHAR(64) NULL,
    
    rates_json JSON NOT NULL,
    rates_checksum VARCHAR(128) NOT NULL,
    baseline_rates_checksum VARCHAR(128) NULL,
    proposed_patch_checksum VARCHAR(128) NULL,
    
    engine_package VARCHAR(128) NOT NULL,
    engine_version VARCHAR(64) NOT NULL,
    engine_commit VARCHAR(64) NOT NULL,
    solver_version VARCHAR(64) NULL,
    
    created_by_json JSON NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    
    INDEX idx_ppr_tenant (tenant_id),
    INDEX idx_ppr_node (printer_node_id),
    INDEX idx_ppr_checksum (rates_checksum),
    INDEX idx_ppr_session (source_calibration_session_id),
    INDEX idx_ppr_run (source_calibration_run_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (printer_node_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS printhouse_pricing_calibration_acceptances (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    printer_node_id VARCHAR(64) NOT NULL,
    calibration_session_id VARCHAR(64) NOT NULL,
    calibration_run_id VARCHAR(64) NOT NULL UNIQUE,
    pricing_revision_id VARCHAR(64) NOT NULL,
    
    baseline_checksum VARCHAR(128) NOT NULL,
    proposed_patch_checksum VARCHAR(128) NOT NULL,
    resulting_rates_checksum VARCHAR(128) NOT NULL,
    
    target_manufacturing_price DECIMAL(12,4) NOT NULL,
    verified_manufacturing_price DECIMAL(12,4) NOT NULL,
    absolute_residual DECIMAL(12,6) NOT NULL,
    percent_residual DECIMAL(8,6) NOT NULL,
    
    acceptance_tolerance_absolute DECIMAL(12,4) NOT NULL,
    acceptance_tolerance_percent DECIMAL(8,6) NOT NULL,
    effective_acceptance_tolerance DECIMAL(12,4) NOT NULL,
    
    warnings_json JSON NULL,
    verification_json JSON NOT NULL,
    
    accepted_by_json JSON NOT NULL,
    accepted_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    
    INDEX idx_pca_tenant (tenant_id),
    INDEX idx_pca_node (printer_node_id),
    INDEX idx_pca_session (calibration_session_id),
    INDEX idx_pca_revision (pricing_revision_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (printer_node_id) REFERENCES printer_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (calibration_session_id) REFERENCES printhouse_pricing_calibration_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (calibration_run_id) REFERENCES printhouse_pricing_calibration_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (pricing_revision_id) REFERENCES printhouse_pricing_revisions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
