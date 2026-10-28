-- migrations/173_phase197b_spine_binding_profiles_and_snapshots.sql
-- PrintPrice OS — Phase 197B (SPINE-03): Spine Binding Profiles & Immutable Calculation Snapshots
--
-- Strict Governance & Validation Separation Guarantees:
-- 1. Distinguishes explicitly the four validation/certification tiers:
--    - EXCEL_EXAMPLE_PARITY: Reproduces cached outputs of original Excel examples.
--    - MATH_BRANCH_VALIDATED: Mathematically verified across formula branches and rounding rules.
--    - PRINTHOUSE_TECHNICALLY_VALIDATED: Validated by printhouse technologists for specific machinery.
--    - PRODUCTION_CERTIFIED: Physically certified on press/bindery for autonomous manufacturing release.
--    (These four levels are NEVER treated as equivalent.)
-- 2. Flexi profiles remain strictly EXPERIMENTAL_DISABLED.
-- 3. Hardcover profiles remain strictly REQUIRES_TECH_APPROVAL.
-- 4. Softcover Alegro profile starts at MATH_BRANCH_VALIDATED (not physically certified for autonomous manufacturing until printhouse sign-off).
-- 5. Immutable spine_calculation_snapshots linked to order intents, paper decisions, quote revisions, and effective technical specifications.

CREATE TABLE IF NOT EXISTS spine_binding_profiles (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    printhouse_id VARCHAR(64) NULL,
    
    profile_code VARCHAR(64) NOT NULL,
    profile_version VARCHAR(32) NOT NULL DEFAULT '2.0.0',
    display_name VARCHAR(255) NOT NULL,
    machinery_line VARCHAR(128) NOT NULL,
    
    -- Operational & Certification Governance (Strict 4-tier separation)
    operational_status ENUM('MATH_VALIDATED_ACTIVE', 'REQUIRES_TECH_APPROVAL', 'EXPERIMENTAL_DISABLED', 'ARCHIVED') NOT NULL DEFAULT 'REQUIRES_TECH_APPROVAL',
    certification_tier ENUM('EXCEL_EXAMPLE_PARITY', 'MATH_BRANCH_VALIDATED', 'PRINTHOUSE_TECHNICALLY_VALIDATED', 'PRODUCTION_CERTIFIED') NOT NULL DEFAULT 'MATH_BRANCH_VALIDATED',
    
    supported_binding_categories_json JSON NOT NULL,
    supported_processing_types_json JSON NOT NULL,
    rules_config_json JSON NOT NULL,
    
    is_default_for_printhouse BOOLEAN NOT NULL DEFAULT FALSE,
    created_by VARCHAR(64) NOT NULL DEFAULT 'system',
    approved_by_technologist VARCHAR(64) NULL,
    approved_at TIMESTAMP NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_sbp_tenant_printer (tenant_id, printhouse_id),
    INDEX idx_sbp_code_ver (profile_code, profile_version),
    INDEX idx_sbp_status (operational_status),
    UNIQUE KEY uk_sbp_tenant_printer_code_ver (tenant_id, printhouse_id, profile_code, profile_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS spine_calculation_snapshots (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    printhouse_id VARCHAR(64) NULL,
    
    external_order_intent_id VARCHAR(128) NULL,
    canonical_order_id VARCHAR(128) NULL,
    paper_decision_id VARCHAR(64) NULL,
    quote_revision_id VARCHAR(64) NULL,
    effective_specification_id VARCHAR(64) NULL,
    
    profile_code VARCHAR(64) NOT NULL,
    profile_version VARCHAR(32) NOT NULL,
    certification_tier ENUM('EXCEL_EXAMPLE_PARITY', 'MATH_BRANCH_VALIDATED', 'PRINTHOUSE_TECHNICALLY_VALIDATED', 'PRODUCTION_CERTIFIED') NOT NULL,
    
    binding_category ENUM('SOFTCOVER_STANDARD', 'SOFTCOVER_WITH_FLAPS', 'HARDCOVER', 'FLEXI_STANDARD', 'FLEXI_WITH_FLAPS') NOT NULL,
    processing_type ENUM('GLUED', 'SEWN') NOT NULL,
    spine_shape ENUM('SQUARE', 'ROUND') NOT NULL DEFAULT 'SQUARE',
    
    trim_width_mm DECIMAL(8, 2) NOT NULL,
    trim_height_mm DECIMAL(8, 2) NOT NULL,
    net_block_thickness_mm DECIMAL(8, 4) NOT NULL,
    total_block_with_endpapers_mm DECIMAL(8, 4) NOT NULL,
    spine_width_mm DECIMAL(8, 2) NULL,
    flat_cover_width_mm DECIMAL(8, 2) NULL,
    flat_cover_height_mm DECIMAL(8, 2) NULL,
    
    validation_status ENUM('MATH_VALIDATED', 'PROVISIONAL_ESTIMATE', 'REQUIRES_TECH_REVIEW', 'INVALID_BLOCKED') NOT NULL,
    caliper_confidence_summary ENUM('VERIFIED', 'REFERENCE_IMPORTED', 'PROVISIONAL_ESTIMATED', 'MISSING') NOT NULL,
    snapshot_lifecycle_status ENUM('ACTIVE', 'SUPERSEDED', 'INVALIDATED') NOT NULL DEFAULT 'ACTIVE',
    invalidation_reason VARCHAR(255) NULL,
    
    -- Concurrency & Idempotency
    idempotency_key VARCHAR(128) NULL,
    input_canonical_hash CHAR(64) NOT NULL,
    output_canonical_hash CHAR(64) NOT NULL,
    
    input_payload_json JSON NOT NULL,
    geometry_breakdown_json JSON NOT NULL,
    validation_issues_json JSON NULL,
    
    created_by VARCHAR(64) NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    superseded_at TIMESTAMP(6) NULL,
    superseded_by_snapshot_id VARCHAR(64) NULL,
    
    INDEX idx_scs_tenant_intent (tenant_id, external_order_intent_id, snapshot_lifecycle_status),
    INDEX idx_scs_order (tenant_id, canonical_order_id, snapshot_lifecycle_status),
    INDEX idx_scs_revision (quote_revision_id),
    INDEX idx_scs_decision (paper_decision_id),
    UNIQUE KEY uk_scs_tenant_idempotency (tenant_id, idempotency_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
