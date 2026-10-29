# RECOVERY-09 — Phase 1: Architecture Audit & Technical Reconciliation

**Mission:** `PAPER-MATERIALS-RECOVERY-09`  
**Repository:** `PrintPriceOS/ppos-control-plane`  
**Base Reference:** `feat/paper-materials-recovery-08` (`0df877f163ace0801fefdd30ffa9ab7657651d6f`)  
**Status:** `AUDITED_AND_VERIFIED`

---

## 1. Graphify & Module Dependency Inspection

Before modifying any component, route, or service, we queried the Graphify knowledge graph (`python -m graphify query "PaperMaterials paperSupplierHub routes paper_variants migrations"`) and confirmed all findings directly on disk across the four core domains:

| Domain | Primary Files Inspected | Architectural Role & Integration Boundary |
|---|---|---|
| **Paper Supplier Hub API** | [`src/api/routes/paperSuppliersRoutes.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/paperSuppliersRoutes.js), [`src/api/services/paperEvidenceService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/paperEvidenceService.js) | Mounted at `/api/v1/paper-suppliers` behind `requirePaperSupplierHubFlag`, `requireAdmin`, `requireSupplierScope`, and `requireApprovedSupplier`. Hosts the new `/accreditation/*` endpoints. |
| **Paper Supplier Hub UI** | [`src/ui/pages/supplier/SupplierCatalogOffersPage.tsx`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/ui/pages/supplier/SupplierCatalogOffersPage.tsx), [`src/ui/components/supplier/TechnicalAccreditationPanel.tsx`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/ui/components/supplier/TechnicalAccreditationPanel.tsx) | Adds the third governed tab (`ACCREDITATION`) with full `DE/EN/ES` localization parity (`src/ui/de.ts`, `src/ui/en.ts`, `src/ui/es.ts`). |
| **Spine Calculator & Provenance** | [`src/api/services/spine/paperCaliperReconciliationService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/paperCaliperReconciliationService.js), [`src/api/services/spine/spineCalculationService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/spineCalculationService.js), [`src/api/services/spine/spineCalculationEngine.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/spineCalculationEngine.js) | Enforces the 5-tier epistemic provenance model while keeping `canReleaseToManufacturing = false` and never mutating `paper_variants.caliper_um` upon documentary/evidence approval. |
| **Database Schema & Baseline** | [`migrations/171_phase197a_paper_caliper_and_reference_library.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/171_phase197a_paper_caliper_and_reference_library.sql), [`migrations/174_phase197c_paper_evidence_and_technical_accreditation.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/174_phase197c_paper_evidence_and_technical_accreditation.sql) | Additive MySQL 8 schema for technical caliper evidence, immutable audit logs, and classification evidence without altering existing industrial `ENUM`s. |

---

## 2. Audit of the 3 Evidence & Accreditation Tables

### 2.1 Foreign Keys & Referential Integrity
- `paper_variant_caliper_evidence.variant_id` → `FOREIGN KEY (variant_id) REFERENCES paper_variants(id) ON DELETE RESTRICT`
- `paper_variant_caliper_evidence.product_id` → `FOREIGN KEY (product_id) REFERENCES paper_products(id) ON DELETE RESTRICT`
- `paper_variant_caliper_audit_log.variant_id` → `FOREIGN KEY (variant_id) REFERENCES paper_variants(id) ON DELETE RESTRICT`
- `paper_variant_classification_evidence.variant_id` → `FOREIGN KEY (variant_id) REFERENCES paper_variants(id) ON DELETE RESTRICT`
- `paper_variant_classification_evidence.product_id` → `FOREIGN KEY (product_id) REFERENCES paper_products(id) ON DELETE RESTRICT`

`ON DELETE RESTRICT` prevents accidental orphan deletion of variants or products that hold metrological or documentary certification history.

### 2.2 Multi-Tenant & Supplier Isolation
- Every table includes `tenant_id VARCHAR(64) NOT NULL` and `supplier_id VARCHAR(64) NULL`, indexed by `(tenant_id, variant_id, review_status)` and `(tenant_id, supplier_id, review_status)`.
- Queries in [`PaperEvidenceService`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/paperEvidenceService.js) scope all reads and writes by `tenant_id`, ensuring Tenant B can never inspect or mutate Tenant A's technical evidence records.

### 2.3 Document Storage, Versioning & Retention Policy
- Uploaded PDFs are validated in memory (`%PDF-` magic header check + `<= 10 MB` limit), hashed with deterministic `SHA-256` (`document_sha256 CHAR(64)`), and referenced via content-addressable storage URI (`evidence-store://sha256/<sha256>/<safeFileName>`).
- Document metadata (`datasheet_version`, `datasheet_published_date`, `measurement_standard`) is mandatory on registration.
- Evidence records in terminal/reviewed states (`APPROVED_FOR_TECHNICAL_USE`, `CERTIFIED_MEASURED`, `REJECTED`, `SUPERSEDED`) are **immutable**—attempts to overwrite their PDF attachment or re-review them fail closed with HTTP `409 Conflict`.

---

## 3. Definitive Reconciliation of the `337` vs `338` Pending Classifications

During the `RECOVERY-08` review, a 1-row difference was noted between the raw SQL count of `paper_products.category = 'OTHER'` (`338` rows) and the effective count of variants without resolved technical classification (`337` rows).

### 3.1 Root Cause Identified
- In `MySQL Control`, exactly **`338`** variants belong to products where `paper_products.category = 'OTHER'`.
- However, **`1` of those `338` variants** already has a complete, accredited technical classification in `metadata_json.ods_materials_recovery`, which `resolveVariantTechnicalAttributes()` resolves at runtime:
  - **`variant_id`:** `var_85c142a50239e312`
  - **`product_id`:** `prod_2ef92801973c61f8`
  - **`product_name`:** `Efalin FINE LINEN 130 (Light Blue) 120 102x70cm`
  - **`raw_db_category`:** `OTHER`
  - **`resolved_paper_type`:** `DESIGN`
  - **`resolved_coating_status`:** `UNCOATED`
  - **`resolved_finish`:** `UNCOATED` (`EMBOSSED_LINEN`)
- Because `var_85c142a50239e312` was included in functional group `G1` in the `RECOVERY-08` table (`63` rows), the sum of `G1..G6` was `338` instead of `337`.

### 3.2 Reconciled `G1..G6` Matrix (`337` Effective Pending Variants)
Excluding `var_85c142a50239e312` from `G1` (`63 -> 62`) reconciles the matrix so that `G1..G6` sum unequivocally to **`337`** (persisted in [`docs/architecture/RECOVERY_09_PENDING_CLASSIFICATIONS_337.csv`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/RECOVERY_09_PENDING_CLASSIFICATIONS_337.csv)):

| Group Code | Functional Group Description | Total Pending (`OTHER / UNKNOWN / UNKNOWN`) | With Caliper (`YES`) | Missing Caliper (`NO`) | Proposed Target Category |
|---|---|---:|---:|---:|---|
| **`G1`** | Bookbinding Coverings (`Geltex`, `Efalin`, `Wibalin`, `Surbalin`, `Balacron`, `Guaflex`, `Buckram`, `Linens`) | **62** | 0 | 62 | `DESIGN` / `SPECIALTY` |
| **`G2`** | Creative, Design & Tinted Uncoated Papers (`Pop'Set`, `Keaykolour`, `Rives`, `Curious`, `Arena`, `Olin`, `Trophée`, `Colorplan`) | **113** | 64 | 49 | `DESIGN` |
| **`G3`** | Uncoated Offset, Preprint & Book Papers in Raw `OTHER` (`Amber`, `Munken`, `Holmen`, `Salzer`, `EOS`, `Alabaster`) | **74** | 69 | 5 | `OFFSET` / `UNCOATED` |
| **`G4`** | Packaging Boards, Graphic Cards & Bristol (`Carta Integra`, `Invercote`, `Incada`, `Tambrite`, `ensocoat`, `Greyboard`) | **27** | 16 | 11 | `CARTON` / `BOARD` |
| **`G5`** | Coated Publication Papers in Raw `OTHER` (`Arctic Volume`, `G-Print`, `Maxi`, `Galerie`, `Condat`, `Quatro`) | **12** | 11 | 1 | `COATED` |
| **`G6`** | Specialty, Synthetic, Self-Adhesive & Carbonless (`Reacto`, `Giroform`, `Sticotac`, `Raflatac`, `Yupo`, `Synaps`, `Priplak`, `Tyvek`) | **49** | 26 | 23 | `SPECIALTY` / `OTHER` |
| **TOTAL** | **Effective Pending Classifications** | **337** | **186** | **151** | **100% Accounted** |

