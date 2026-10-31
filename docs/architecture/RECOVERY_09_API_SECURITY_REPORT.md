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
| `GET /accreditation/evidences/:evidenceId/document` | `VIEWER` | Streams the private PDF datasheet (`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store, max-age=0`) after verifying `tenant_id` and re-hashing on-disk `SHA-256`. | Yes | **NO (`false`)** |

---

## 2. Security Controls & Trail of Bits Verification (`RECOVERY-09` & `RECOVERY-09H`)

1. **Authenticated Session Identity & Segregation of Duties (`SOD_SELF_APPROVAL_FORBIDDEN`):**
   - `sanitizeClientBodyIdentity` in [`src/api/routes/paperSuppliersRoutes.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/paperSuppliersRoutes.js) strips any `actorId`, `technologistUserId`, `submitted_by`, `approved_by_technologist`, or `tenantId` supplied in `req.body`, guaranteeing that actor identity is resolved exclusively from `resolveActorContext(req)` (authenticated server session).
   - In [`PaperEvidenceService.reviewEvidence`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/paperEvidenceService.js), if `ev.submitted_by === effectiveTechId`, the request fails closed with HTTP `403` (`SOD_SELF_APPROVAL_FORBIDDEN`), even if the submitter holds `SUPPLIER_ADMIN` or `SUPER_ADMIN` privileges.
2. **Deep PDF Structural Security & Private Durable Store (`validateAndHashPdfDocument` + `persistPdfBufferToPrivateStore`):**
   - Rejects files larger than `10 MB` (`MAX_PDF_SIZE_BYTES = 10485760`) with HTTP `413` (`DOCUMENT_SIZE_LIMIT_EXCEEDED`) and enforces `application/pdf` MIME type (`INVALID_DOCUMENT_MIME_TYPE`, HTTP `422`).
   - Performs deep structural PDF inspection beyond `%PDF-`: verifies `%PDF-1.x` / `%PDF-2.0` header at offset 0 (`INVALID_PDF_MAGIC_SIGNATURE`), `%%EOF` trailer marker (`INVALID_PDF_EOF_TRAILER`), indirect object structure `\b\d+\s+\d+\s+obj\b` + `endobj` and `/Type /Catalog` or `/Type /Page` (`INVALID_PDF_OBJECT_STRUCTURE`), and blocks active/malicious PDF constructs (`/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFiles`, `/RichMedia`, `/SubmitForm`, `/ImportData`, `<script>` -> `PDF_ACTIVE_CONTENT_FORBIDDEN`, HTTP `422`).
   - Persists validated PDFs to a private content-addressable store (`var/private_evidence_store/<safeTenantId>/<sha256>.pdf` with `0o600` file permissions and `0o700` directory permissions), guarded by `path.resolve` prefix checks against path traversal (`PATH_TRAVERSAL_BLOCKED`), automatic orphan cleanup (`cleanupOrphanEvidenceFile`) on DB rollback, and SHA-256 re-verification before download (`EVIDENCE_DOCUMENT_INTEGRITY_MISMATCH`).
3. **Transactional Concurrency & Race-Condition Protection (`SELECT ... FOR UPDATE` + Atomic CAS):**
   - `registerDocumentaryEvidence`, `attachPdfToEvidence`, `submitEvidenceForReview`, and `reviewEvidence` execute inside `_withTransaction` using `SELECT ... FOR UPDATE` row locking and atomic Compare-And-Swap (`UPDATE ... WHERE evidence_id = ? AND tenant_id = ? AND review_status IN ('DRAFT', 'PENDING_TECH_REVIEW')`), ensuring concurrent approvals/rejections cannot double-transition or write duplicate audit rows (`EVIDENCE_ALREADY_REVIEWED`, HTTP `409`).
   - `paper_variant_caliper_audit_log` is strictly append-only (`AUDIT_LOG_IMMUTABLE`, HTTP `403`).
4. **Source Contradiction Detection (`detectSourceContradictions`):**
   - Automatically compares proposed datasheet thickness, measured micrometer thickness, existing catalog thickness, and `RECOVERY-08` reference candidates.
   - Any divergence `> 5.0%` (and `> 5 µm`) sets `has_source_contradiction = TRUE`, writes a `CONTRADICTION_FLAGGED` audit event, and blocks approval unless the reviewing technologist explicitly passes `acknowledgeContradiction = true` with a documented justification (`UNACKNOWLEDGED_SOURCE_CONTRADICTION`, HTTP `409`).
5. **Physical Micrometer Track Guard (`PHYSICAL_MICROMETER_REQUIRED_FOR_TRACK`):**
   - Variants assigned to `PHYSICAL_MICROMETER_TRACK` (`145` embossed/covering/multilayer substrates such as `Geltex`, `Efalin`, `Wibalin`, `Surbalin`, `Sticotac`, `Reacto`) cannot be approved via documentary datasheet alone (HTTP `422`).
6. **Strict Non-Mutation of `paper_variants.caliper_um`:**
   - Neither `registerDocumentaryEvidence`, `registerPhysicalMicrometerEvidence`, nor `reviewEvidence` issues an `UPDATE paper_variants` statement. Every approval sets `applied_to_catalog_variant = FALSE` and returns `productiveCaliperModified: false`.

