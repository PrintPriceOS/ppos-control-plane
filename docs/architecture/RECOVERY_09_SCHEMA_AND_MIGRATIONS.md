# RECOVERY-09 — Phase 2: Additive Data Model, Migrations & Rollback

**Mission:** `PAPER-MATERIALS-RECOVERY-09`  
**Migration File:** [`migrations/174_phase197c_paper_evidence_and_technical_accreditation.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/174_phase197c_paper_evidence_and_technical_accreditation.sql)  
**Rollback File:** [`migrations/rollback/rollback_174_phase197c_paper_evidence_and_technical_accreditation.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/rollback/rollback_174_phase197c_paper_evidence_and_technical_accreditation.sql)  
**Baseline Check:** `Phase 183 Migration Integrity PASSED (177 baselined migrations)`  
**Production Application Status:** `NOT_APPLIED_IN_PRODUCTION (Awaiting explicit deployment approval)`

---

## 1. Zero-Breakage Additive Schema Design

Migration `174` is **100% additive**:
- It creates 3 new InnoDB tables (`paper_variant_caliper_evidence`, `paper_variant_caliper_audit_log`, `paper_variant_classification_evidence`).
- It performs **zero `ALTER TABLE` statements** on `paper_variants`, `paper_products`, `supplier_paper_offers`, or `spine_calculation_snapshots`.
- It preserves all existing industrial `ENUM`s (`caliper_source`, `caliper_confidence_status`, `paper_products.category`, `paper_variants.finish`, `paper_variants.grain_direction`) untouched.

---

## 2. Table Specifications

### 2.1 `paper_variant_caliper_evidence`
Stores both documentary datasheets (`MANUFACTURER_DATASHEET_PDF`, `SUPPLIER_TECHNICAL_SHEET_PDF`, ` SIBLING_FORMAT_EVIDENCE`) and physical `ISO 534` batch micrometer measurements (`PHYSICAL_MICROMETER_RECORD`, `COMBINED_DATASHEET_AND_MICROMETER`):
- **Primary & Foreign Keys:**
  - `evidence_id VARCHAR(64) PRIMARY KEY`
  - `tenant_id VARCHAR(64) NOT NULL`
  - `supplier_id VARCHAR(64) NULL`
  - `variant_id VARCHAR(64) NOT NULL` (`FOREIGN KEY REFERENCES paper_variants(id) ON DELETE RESTRICT`)
  - `product_id VARCHAR(64) NULL` (`FOREIGN KEY REFERENCES paper_products(id) ON DELETE RESTRICT`)
- **Documentary & Cryptographic Fields:**
  - `document_title`, `document_file_name`, `document_mime_type`, `document_size_bytes`
  - `document_storage_uri`, `document_sha256 CHAR(64)`
  - `manufacturer_name`, `datasheet_version`, `datasheet_published_date`, `measurement_standard`
  - `nominal_datasheet_caliper_um DECIMAL(8,2)`, `nominal_tolerance_um`, `nominal_tolerance_pct`, `nominal_bulk_cm3_g`
- **ISO 534 Physical Micrometer Fields:**
  - `measured_batch_caliper_um DECIMAL(8,2)`, `measured_facestock_caliper_um`, `measured_liner_caliper_um`
  - `supplier_lot_batch_id`, `lot_received_date`
  - `conditioning_temp_c DECIMAL(4,1)`, `conditioning_rh_pct DECIMAL(4,1)`, `conditioning_hours DECIMAL(5,1)` (`ISO 187` `23 ± 1 °C`, `50 ± 2% RH`)
  - `micrometer_make_model`, `micrometer_serial_number`, `micrometer_calibration_cert_id`, `micrometer_calibration_valid_until`
  - `substrate_tolerance_class`, `readings_json JSON` (10 individual readings), `readings_count`, `readings_mean_um`, `readings_std_dev_um`, `readings_cv_pct`, `readings_min_um`, `readings_max_um`
- **Contradiction & Governance State Machine:**
  - `has_source_contradiction BOOLEAN NOT NULL DEFAULT FALSE`
  - `contradiction_details_json JSON NULL`
  - `review_status ENUM('DRAFT','PENDING_TECH_REVIEW','APPROVED_FOR_TECHNICAL_USE','CERTIFIED_MEASURED','REJECTED','SUPERSEDED')`
  - `applied_to_catalog_variant BOOLEAN NOT NULL DEFAULT FALSE`
  - `idempotency_key VARCHAR(128) NULL` (`UNIQUE KEY uq_pvce_tenant_idempotency (tenant_id, idempotency_key)`)
  - `submitted_by`, `approved_by_technologist`, `decision_reason`

### 2.2 `paper_variant_caliper_audit_log`
Immutable append-only ledger recording every state transition and verification event:
- `action_type ENUM('EVIDENCE_CREATED','EVIDENCE_SUBMITTED_FOR_REVIEW','EVIDENCE_DOCUMENT_ATTACHED','CONTRADICTION_FLAGGED','EVIDENCE_APPROVED','EVIDENCE_REJECTED','EVIDENCE_SUPERSEDED','PROMOTED_TO_CATALOG_VARIANT')`
- Records `previous_review_status`, `new_review_status`, `previous_caliper_um`, `new_caliper_um` (proving `previous_caliper_um === new_caliper_um` on documentary/evidence approval), `document_sha256`, `actor_user_id`, `actor_role`, and `decision_reason`.

### 2.3 `paper_variant_classification_evidence`
Stores governed classification accreditation proposals for the `337` variants in `G1..G6`:
- Maps `functional_group` (`G1..G6`), `current_db_category`, `proposed_category`, `proposed_paper_type`, `proposed_coating_status`, `proposed_finish`, `document_sha256`, and `review_status` (`DRAFT`, `PENDING_TECH_REVIEW`, `APPROVED_FOR_TECHNICAL_USE`, `REJECTED`, `SUPERSEDED`) with `applied_to_catalog_product = FALSE`.

---

## 3. Rollback & Baseline Verification

- Rollback script [`migrations/rollback/rollback_174_phase197c_paper_evidence_and_technical_accreditation.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/rollback/rollback_174_phase197c_paper_evidence_and_technical_accreditation.sql) drops `paper_variant_classification_evidence`, `paper_variant_caliper_audit_log`, and `paper_variant_caliper_evidence` in reverse dependency order.
- Verified with `node scripts/smoke_phase183_migration_integrity.js` → **`Phase 183: PASSED`** (`177` baselined migrations, `0` drift errors).

