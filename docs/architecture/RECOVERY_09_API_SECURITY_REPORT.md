# RECOVERY-09 — Phase 3: Evidence API Contract & Security Audit Report

**Mission:** `PAPER-MATERIALS-RECOVERY-09`  
**Routes Module:** [`src/api/routes/paperSuppliersRoutes.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/paperSuppliersRoutes.js)  
**Service Module:** [`src/api/services/paperEvidenceService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/paperEvidenceService.js)  
**Security Audit Framework:** Trail of Bits (`differential-review`, `insecure-defaults`, `sharp-edges`)

---

## 1. Endpoint Inventory & RBAC Matrix

All endpoints are mounted under `/api/v1/paper-suppliers/accreditation` and protected by `requirePaperSupplierHubFlag` (`PAPER_SUPPLIER_HUB_ENABLED === 'true'`), `requireAdmin`, `requireSupplierScope(...)`, and `requireApprovedSupplier`:

| HTTP Method & Path | Required Scope | Purpose | Idempotent | Mutates `paper_variants.caliper_um`? |
|---|---|---|---|---|
| `GET /accreditation/missing-materials` | `VIEWER` | Lists the `252` missing-caliper variants with filters (`supplier`, `family`, `priorityTier`, `track`, `search`) and live tenant evidence status. | Yes | **NO (`false`)** |
| `GET /accreditation/variants/:variantId/evidences` | `VIEWER` | Retrieves variant metadata, 5-tier `spineProvenance`, `caliperEvidences`, `classificationEvidences`, and `auditHistory`. | Yes | **NO (`false`)** |
| `GET /accreditation/variants/:variantId/history` | `VIEWER` | Retrieves the immutable `paper_variant_caliper_audit_log` ledger for a variant. | Yes | **NO (`false`)** |
| `POST /accreditation/evidences/documentary` | `OPERATOR` | Registers official manufacturer datasheet or supplier technical declaration with PDF validation (`%PDF-`, `<= 10 MB`, `SHA-256`). | Yes (`Idempotency-Key`) | **NO (`false`)** |
| `POST /accreditation/evidences/:evidenceId/attachment` | `OPERATOR` | Attaches or updates PDF datasheet on a `DRAFT` or `PENDING_TECH_REVIEW` evidence record. | Yes | **NO (`false`)** |
| `POST /accreditation/evidences/micrometer` | `OPERATOR` | Registers `ISO 534` physical batch micrometer measurement (`10` readings, `CV%` check, `ISO 187` `23±1 °C` / `50±2% RH`, valid calibration). | Yes (`Idempotency-Key`) | **NO (`false`)** |
| `POST /accreditation/evidences/:evidenceId/submit` | `OPERATOR` | Transitions `DRAFT` evidence to `PENDING_TECH_REVIEW`. | Yes | **NO (`false`)** |
| `POST /accreditation/evidences/:evidenceId/review` | `ADMIN` / Technologist | Approves (`APPROVED_FOR_TECHNICAL_USE` / `CERTIFIED_MEASURED`) or rejects (`REJECTED`) an evidence record. | Yes | **NO (`false`)** |

---

## 2. Security Controls & Trail of Bits Verification

1. **Segregation of Duties (SoD) Enforcement (`SOD_SELF_APPROVAL_FORBIDDEN`):**
   - In [`PaperEvidenceService.reviewEvidence`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/paperEvidenceService.js#L1052-L1059), if `ev.submitted_by === effectiveTechId`, the request fails closed with HTTP `403` (`SOD_SELF_APPROVAL_FORBIDDEN`), even if the submitter holds `SUPPLIER_ADMIN` or `SUPER_ADMIN` privileges.
2. **PDF Upload Hardening (`validateAndHashPdfDocument`):**
   - Rejects files larger than `10 MB` (`MAX_PDF_SIZE_BYTES = 10485760`) with HTTP `413` (`DOCUMENT_SIZE_LIMIT_EXCEEDED`) both at the `multer` middleware boundary and inside `validateAndHashPdfDocument`.
   - Verifies the 5-byte ASCII magic header `%PDF-`; non-PDF binaries (e.g., `MZ` executables or HTML/script payloads) fail closed with HTTP `422` (`INVALID_PDF_MAGIC_SIGNATURE`).
   - Sanitizes filenames (`replace(/[^a-zA-Z0-9._-]/g, '_')`) to prevent path traversal and computes a deterministic `SHA-256` digest stored in `document_sha256`.
3. **Source Contradiction Detection (`detectSourceContradictions`):**
   - Automatically compares proposed datasheet thickness, measured micrometer thickness, existing catalog thickness, and `RECOVERY-08` reference candidates.
   - Any divergence `> 5.0%` (and `> 5 µm`) sets `has_source_contradiction = TRUE`, writes a `CONTRADICTION_FLAGGED` audit event, and blocks approval unless the reviewing technologist explicitly passes `acknowledgeContradiction = true` with a documented justification (`UNACKNOWLEDGED_SOURCE_CONTRADICTION`, HTTP `409`).
4. **Physical Micrometer Track Guard (`PHYSICAL_MICROMETER_REQUIRED_FOR_TRACK`):**
   - Variants assigned to `PHYSICAL_MICROMETER_TRACK` (`145` embossed/covering/multilayer substrates such as `Geltex`, `Efalin`, `Wibalin`, `Surbalin`, `Sticotac`, `Reacto`) cannot be approved via documentary datasheet alone (HTTP `422`).
5. **Strict Non-Mutation of `paper_variants.caliper_um`:**
   - Neither `registerDocumentaryEvidence`, `registerPhysicalMicrometerEvidence`, nor `reviewEvidence` issues an `UPDATE paper_variants` statement. Every approval sets `applied_to_catalog_variant = FALSE` and returns `productiveCaliperModified: false`.

