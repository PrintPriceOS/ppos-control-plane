-- migrations/174_phase197c_paper_evidence_and_technical_accreditation.sql
-- PrintPrice OS — Phase 197C (PAPER-MATERIALS-RECOVERY-09):
-- Technical Evidence Registry, ISO 534 Micrometer Metrology Ledger & Immutable Audit Log
--
-- Strict Governance & Isolation Guarantees:
-- 1. Purely additive schema: creates 3 new tables without altering existing industrial ENUMs on paper_products or paper_variants.
-- 2. Strict tenant & supplier scoping with foreign keys to paper_variants(id) and paper_products(id).
-- 3. Separation of Duties (SoD): tracks submitted_by vs approved_by_technologist.
-- 4. Separation of Documentary Approval vs Productive Caliper Promotion:
--    - Approving a datasheet or micrometer record in paper_variant_caliper_evidence DOES NOT automatically
--      mutate paper_variants.caliper_um unless explicitly promoted through governed technologist action.
-- 5. Separation of Caliper Accreditation vs Technical Classification (337 pending OTHER/UNKNOWN variants).

CREATE TABLE IF NOT EXISTS paper_variant_caliper_evidence (
    evidence_id VARCHAR(64) NOT NULL PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    supplier_id VARCHAR(64) NULL,
    variant_id VARCHAR(64) NOT NULL,
    product_id VARCHAR(64) NOT NULL,

    accreditation_track ENUM(
        'DATASHEET_REQUEST_TRACK',
        'PHYSICAL_MICROMETER_TRACK',
        'CONFLICT_RECONCILIATION_TRACK'
    ) NOT NULL DEFAULT 'DATASHEET_REQUEST_TRACK',

    evidence_type ENUM(
        'MANUFACTURER_DATASHEET_PDF',
        'SUPPLIER_TECHNICAL_SHEET_PDF',
        'PHYSICAL_MICROMETER_RECORD',
        'COMBINED_DATASHEET_AND_MICROMETER'
    ) NOT NULL,

    -- Documentary & Provenance Metadata
    document_title VARCHAR(255) NULL,
    document_file_name VARCHAR(255) NULL,
    document_mime_type VARCHAR(128) NULL,
    document_size_bytes INT NULL,
    document_storage_uri VARCHAR(512) NULL,
    document_sha256 CHAR(64) NULL,
    manufacturer_name VARCHAR(128) NOT NULL,
    supplier_channel VARCHAR(128) NULL,
    supplier_sku VARCHAR(128) NULL,
    datasheet_version VARCHAR(64) NULL,
    datasheet_published_date DATE NULL,
    measurement_standard VARCHAR(64) NOT NULL DEFAULT 'ISO 534:2011',
    shade_embossing_invariance_confirmed BOOLEAN NOT NULL DEFAULT FALSE,

    -- Nominal Value & Tolerance (Datasheet / Reference)
    nominal_datasheet_caliper_um DECIMAL(8, 2) NULL,
    nominal_unit VARCHAR(16) NOT NULL DEFAULT 'um',
    nominal_tolerance_um DECIMAL(6, 2) NULL,
    nominal_tolerance_pct DECIMAL(5, 2) NULL,
    nominal_bulk_cm3_g DECIMAL(6, 3) NULL,

    -- Physical Batch Measurement (ISO 534 Micrometer)
    measured_batch_caliper_um DECIMAL(8, 2) NULL,
    measured_facestock_caliper_um DECIMAL(8, 2) NULL,
    measured_liner_caliper_um DECIMAL(8, 2) NULL,
    supplier_lot_batch_id VARCHAR(128) NULL,
    lot_received_date DATE NULL,
    conditioning_temp_c DECIMAL(4, 1) NULL,
    conditioning_rh_pct DECIMAL(4, 1) NULL,
    conditioning_hours DECIMAL(4, 1) NULL,
    micrometer_make_model VARCHAR(128) NULL,
    micrometer_serial_number VARCHAR(64) NULL,
    micrometer_calibration_cert_id VARCHAR(128) NULL,
    micrometer_calibration_valid_until DATE NULL,
    substrate_tolerance_class VARCHAR(64) NULL,
    readings_json JSON NULL,
    readings_count INT NULL,
    readings_mean_um DECIMAL(8, 2) NULL,
    readings_std_dev_um DECIMAL(6, 3) NULL,
    readings_cv_pct DECIMAL(5, 2) NULL,
    readings_min_um DECIMAL(8, 2) NULL,
    readings_max_um DECIMAL(8, 2) NULL,

    -- Proposed Target & Source Contradiction Detection
    proposed_effective_caliper_um DECIMAL(8, 2) NOT NULL,
    proposed_caliper_source ENUM(
        'MEASURED_MICROMETER',
        'MANUFACTURER_DATASHEET',
        'LIVONIA_REFERENCE_IMPORT',
        'SUPPLIER_IMPORT',
        'BULK_DERIVED',
        'NONE'
    ) NOT NULL DEFAULT 'MANUFACTURER_DATASHEET',
    proposed_confidence_status ENUM(
        'VERIFIED',
        'REFERENCE_IMPORTED',
        'PROVISIONAL_ESTIMATED',
        'MISSING'
    ) NOT NULL DEFAULT 'REFERENCE_IMPORTED',
    has_source_contradiction BOOLEAN NOT NULL DEFAULT FALSE,
    contradiction_details_json JSON NULL,

    -- Review Lifecycle & Segregation of Duties (SoD)
    review_status ENUM(
        'DRAFT',
        'PENDING_TECH_REVIEW',
        'APPROVED_FOR_TECHNICAL_USE',
        'CERTIFIED_MEASURED',
        'REJECTED',
        'SUPERSEDED'
    ) NOT NULL DEFAULT 'DRAFT',
    applied_to_catalog_variant BOOLEAN NOT NULL DEFAULT FALSE,
    idempotency_key VARCHAR(128) NULL,
    submitted_by VARCHAR(128) NOT NULL,
    submitted_by_role VARCHAR(64) NULL,
    submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_by_technologist VARCHAR(128) NULL,
    approved_by_role VARCHAR(64) NULL,
    approved_at TIMESTAMP NULL,
    decision_reason VARCHAR(512) NULL,
    technical_notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_pvce_tenant_variant (tenant_id, variant_id, review_status),
    INDEX idx_pvce_variant_status (variant_id, review_status),
    INDEX idx_pvce_supplier_status (supplier_id, review_status),
    INDEX idx_pvce_track_status (accreditation_track, review_status),
    INDEX idx_pvce_sha256 (document_sha256),
    UNIQUE KEY uk_pvce_tenant_idempotency (tenant_id, idempotency_key),
    CONSTRAINT fk_pvce_variant FOREIGN KEY (variant_id) REFERENCES paper_variants(id) ON DELETE CASCADE,
    CONSTRAINT fk_pvce_product FOREIGN KEY (product_id) REFERENCES paper_products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS paper_variant_caliper_audit_log (
    audit_id VARCHAR(64) NOT NULL PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    supplier_id VARCHAR(64) NULL,
    variant_id VARCHAR(64) NOT NULL,
    evidence_id VARCHAR(64) NOT NULL,
    action_type ENUM(
        'EVIDENCE_CREATED',
        'EVIDENCE_DOCUMENT_ATTACHED',
        'EVIDENCE_SUBMITTED_FOR_REVIEW',
        'EVIDENCE_APPROVED',
        'EVIDENCE_REJECTED',
        'CONTRADICTION_FLAGGED',
        'CATALOG_CALIPER_PROMOTED',
        'EVIDENCE_SUPERSEDED'
    ) NOT NULL,
    previous_review_status VARCHAR(64) NULL,
    new_review_status VARCHAR(64) NOT NULL,
    previous_caliper_um DECIMAL(8, 2) NULL,
    new_caliper_um DECIMAL(8, 2) NULL,
    previous_caliper_source VARCHAR(64) NULL,
    new_caliper_source VARCHAR(64) NULL,
    previous_confidence_status VARCHAR(64) NULL,
    new_confidence_status VARCHAR(64) NULL,
    previous_revision INT NOT NULL DEFAULT 1,
    new_revision INT NOT NULL DEFAULT 1,
    nominal_datasheet_caliper_um DECIMAL(8, 2) NULL,
    measured_batch_caliper_um DECIMAL(8, 2) NULL,
    document_sha256 CHAR(64) NULL,
    actor_user_id VARCHAR(128) NOT NULL,
    actor_role VARCHAR(64) NOT NULL,
    decision_reason VARCHAR(512) NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    INDEX idx_pvcal_variant_time (variant_id, created_at),
    INDEX idx_pvcal_evidence (evidence_id),
    INDEX idx_pvcal_tenant_time (tenant_id, created_at),
    CONSTRAINT fk_pvcal_variant FOREIGN KEY (variant_id) REFERENCES paper_variants(id) ON DELETE CASCADE,
    CONSTRAINT fk_pvcal_evidence FOREIGN KEY (evidence_id) REFERENCES paper_variant_caliper_evidence(evidence_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS paper_variant_classification_evidence (
    classification_evidence_id VARCHAR(64) NOT NULL PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    supplier_id VARCHAR(64) NULL,
    variant_id VARCHAR(64) NOT NULL,
    product_id VARCHAR(64) NOT NULL,
    functional_group VARCHAR(64) NOT NULL DEFAULT 'G6_SPECIALTY_SYNTHETIC_CARBONLESS_ADHESIVE',
    previous_category ENUM('CARTON', 'OFFSET', 'COATED', 'UNCOATED', 'DESIGN', 'DIGITAL', 'OTHER') NOT NULL DEFAULT 'OTHER',
    proposed_category ENUM('CARTON', 'OFFSET', 'COATED', 'UNCOATED', 'DESIGN', 'DIGITAL', 'OTHER') NOT NULL,
    previous_finish VARCHAR(64) NULL,
    proposed_finish VARCHAR(64) NOT NULL,
    proposed_coating_status ENUM('COATED', 'UNCOATED', 'SYNTHETIC', 'SPECIALTY', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    evidence_source_type ENUM('MILL_DATASHEET', 'SUPPLIER_CATALOG_SPEC', 'ODS_EXPLICIT_HEADER') NOT NULL DEFAULT 'MILL_DATASHEET',
    document_title VARCHAR(255) NOT NULL,
    document_storage_uri VARCHAR(512) NULL,
    document_sha256 CHAR(64) NULL,
    review_status ENUM('DRAFT', 'PENDING_TECH_REVIEW', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING_TECH_REVIEW',
    applied_to_catalog_product BOOLEAN NOT NULL DEFAULT FALSE,
    idempotency_key VARCHAR(128) NULL,
    submitted_by VARCHAR(128) NOT NULL,
    submitted_by_role VARCHAR(64) NULL,
    submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_by_technologist VARCHAR(128) NULL,
    approved_by_role VARCHAR(64) NULL,
    approved_at TIMESTAMP NULL,
    decision_reason VARCHAR(512) NULL,
    notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_pvcle_tenant_variant (tenant_id, variant_id, review_status),
    INDEX idx_pvcle_variant_status (variant_id, review_status),
    UNIQUE KEY uk_pvcle_tenant_idempotency (tenant_id, idempotency_key),
    CONSTRAINT fk_pvcle_variant FOREIGN KEY (variant_id) REFERENCES paper_variants(id) ON DELETE CASCADE,
    CONSTRAINT fk_pvcle_product FOREIGN KEY (product_id) REFERENCES paper_products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

