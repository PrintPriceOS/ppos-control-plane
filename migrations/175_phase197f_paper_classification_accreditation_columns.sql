-- =============================================================================
-- Migration 175: Phase 197F — RECOVERY-12 Governed Paper Classification Evidence
-- & 4-Way Segregation of Duties Promotion Support
-- =============================================================================
-- 1. Extends `paper_variant_classification_evidence.proposed_coating_status` ENUM
--    to include `'ONE_SIDE_COATED'`.
-- 2. Extends `paper_variant_classification_evidence.evidence_source_type` ENUM
--    to include `'PHYSICAL_SAMPLE_INSPECTION'`.
-- 3. Adds `previous_coating_status`, `previous_grain_direction`, `proposed_grain_direction`,
--    `promotion_request_id`, `promotion_requested_by`, `promotion_requested_by_role`,
--    `promotion_requested_at`, `promotion_request_reason`,
--    `promotion_id`, `promoted_by`, `promoted_by_role`, `promoted_at`, `promotion_reason`,
--    and `metadata_json` to `paper_variant_classification_evidence`.
-- 4. Strictly non-destructive: does NOT modify `paper_variants.caliper_um` or any
--    existing catalog data.
-- =============================================================================

ALTER TABLE paper_variant_classification_evidence
    MODIFY COLUMN proposed_coating_status ENUM(
        'COATED',
        'DOUBLE_SIDE_COATED',
        'UNCOATED',
        'ONE_SIDE_COATED',
        'SYNTHETIC',
        'SPECIALTY',
        'UNKNOWN'
    ) NOT NULL DEFAULT 'UNKNOWN',
    MODIFY COLUMN evidence_source_type ENUM(
        'MILL_DATASHEET',
        'SUPPLIER_CATALOG_SPEC',
        'ODS_EXPLICIT_HEADER',
        'PHYSICAL_SAMPLE_INSPECTION'
    ) NOT NULL DEFAULT 'MILL_DATASHEET',
    ADD COLUMN previous_coating_status ENUM(
        'COATED',
        'DOUBLE_SIDE_COATED',
        'UNCOATED',
        'ONE_SIDE_COATED',
        'SYNTHETIC',
        'SPECIALTY',
        'UNKNOWN'
    ) NOT NULL DEFAULT 'UNKNOWN' AFTER proposed_finish,
    ADD COLUMN previous_grain_direction ENUM(
        'LONG_GRAIN',
        'SHORT_GRAIN',
        'UNKNOWN'
    ) NOT NULL DEFAULT 'UNKNOWN' AFTER proposed_coating_status,
    ADD COLUMN proposed_grain_direction ENUM(
        'LONG_GRAIN',
        'SHORT_GRAIN',
        'UNKNOWN'
    ) NOT NULL DEFAULT 'UNKNOWN' AFTER previous_grain_direction,
    ADD COLUMN promotion_request_id VARCHAR(64) NULL AFTER approved_at,
    ADD COLUMN promotion_requested_by VARCHAR(128) NULL AFTER promotion_request_id,
    ADD COLUMN promotion_requested_by_role VARCHAR(64) NULL AFTER promotion_requested_by,
    ADD COLUMN promotion_requested_at TIMESTAMP NULL AFTER promotion_requested_by_role,
    ADD COLUMN promotion_request_reason VARCHAR(512) NULL AFTER promotion_requested_at,
    ADD COLUMN promotion_id VARCHAR(64) NULL AFTER promotion_request_reason,
    ADD COLUMN promoted_by VARCHAR(128) NULL AFTER promotion_id,
    ADD COLUMN promoted_by_role VARCHAR(64) NULL AFTER promoted_by,
    ADD COLUMN promoted_at TIMESTAMP NULL AFTER promoted_by_role,
    ADD COLUMN promotion_reason VARCHAR(512) NULL AFTER promoted_at,
    ADD COLUMN metadata_json JSON NULL AFTER notes;

