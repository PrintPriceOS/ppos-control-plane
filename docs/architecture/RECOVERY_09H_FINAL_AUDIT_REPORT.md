# RECOVERY-09H — Final Audit Report (Referential Integrity, Document Security, Concurrency & Deployment Readiness)

**Mission:** `PAPER-MATERIALS-RECOVERY-09H — Auditoría final de integridad, seguridad y preparación de despliegue`  
**Repository:** `PrintPriceOS/ppos-control-plane`  
**Base Branch:** `feat/paper-materials-recovery-09` (Audited Commit: `3478fbbfe5fa8fa3091550398de5f68d4a4bf7e8`)  
**Final Verdict:** **`RECOVERY_09H_READY_FOR_DEPLOYMENT_APPROVAL`**  
**Production Migrations / Caliper Writes Executed:** **`0`** (`1,272` calipers present, `252` missing, `9` historical conflicts untouched)  
**Pending Security Task:** **`SECURITY_ROTATION_PENDING` (Open & Tracked)**

---

## 1. Executive Summary of Audit Findings & Remediations

During `PAPER-MATERIALS-RECOVERY-09H`, all 6 audit dimensions requested before authorizing production migrations or deployment were thoroughly inspected, hardened, and certified with automated unit, UI, and ephemeral MySQL 8 integration suites:

| Audit Dimension | Finding in `3478fbbfe5fa8fa3091550398de5f68d4a4bf7e8` | Remediation & Hardening Applied in `RECOVERY-09H` | Verification Status |
|---|---|---|---|
| **1. Referential Integrity (`migrations/174_...sql` & Lifecycle)** | `migrations/174_...sql` declared `ON DELETE CASCADE` on all 6 foreign keys (`fk_pvce_variant`, `fk_pvce_product`, `fk_pvcal_variant`, `fk_pvcal_evidence`, `fk_pvcle_variant`, `fk_pvcle_product`), contradicting evidence retention requirements. | Replaced all `ON DELETE CASCADE` with `ON DELETE RESTRICT` across all 6 FKs; updated `migrations/migration-integrity-baseline.json` (`Phase 183: PASSED`); updated [`paperOfferService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/paperOfferService.js) (`deleteTechnicalVariant`, `retractImportBatch`, `previewCatalogAction`) and [`paperSuppliersRoutes.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/paperSuppliersRoutes.js) so hard-deleting a variant with technical evidence returns HTTP `409` (`VARIANT_HAS_TECHNICAL_EVIDENCE`), while soft supplier catalog actions (`ARCHIVE`, `RESTORE`, `WITHDRAW`) remain 100% compatible. | **CERTIFIED (`ON DELETE RESTRICT` + Lifecycle HTTP 409)** |
| **2. Document Security & Private Durable PDF Store** | PDF validation only checked the 5-byte `%PDF-` header and `<= 10 MB` size in memory without writing the PDF to a durable private store or cleaning up orphan files on DB rollback. | Upgraded [`validateAndHashPdfDocument`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/paperEvidenceService.js) to verify `application/pdf` MIME, `%PDF-1.x` / `%PDF-2.0` header at offset 0, `%%EOF` trailer, internal indirect objects (`1 0 obj` / `endobj`) + `/Type /Catalog` or `/Type /Page`, and reject active/malicious PDF constructs (`/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFiles`, `/RichMedia`, `/SubmitForm`, `/ImportData`, `<script>` -> `PDF_ACTIVE_CONTENT_FORBIDDEN`). Implemented durable content-addressable private storage (`var/private_evidence_store/<safeTenantId>/<sha256>.pdf`, `0o600` file mode, `0o700` dir mode, `path.resolve` traversal guard), automatic orphan cleanup on DB rollback (`cleanupOrphanEvidenceFile` + `sweepOrphanEvidenceFiles`), and authenticated download `GET /accreditation/evidences/:evidenceId/document` with tenant isolation and on-read `SHA-256` re-verification (`EVIDENCE_DOCUMENT_INTEGRITY_MISMATCH`). | **CERTIFIED (Deep PDF Validation + Private Disk Store + Orphan Cleanup)** |
| **3. Approval Integrity, Session Identity & Concurrency** | Need to guarantee client bodies cannot spoof reviewer/submitter identity and protect `reviewEvidence` against concurrent double-approval race conditions. | Added `sanitizeClientBodyIdentity` in [`paperSuppliersRoutes.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/paperSuppliersRoutes.js) stripping `actorId`, `technologistUserId`, `submitted_by`, `approved_by_technologist`, and `tenantId` from `req.body` so identity comes strictly from `resolveActorContext(req)`. Wrapped `registerDocumentaryEvidence`, `attachPdfToEvidence`, `submitEvidenceForReview`, and `reviewEvidence` in `_withTransaction` using `SELECT ... FOR UPDATE` row locks and atomic Compare-And-Swap (`UPDATE ... WHERE evidence_id = ? AND tenant_id = ? AND review_status IN ('DRAFT', 'PENDING_TECH_REVIEW')`, checking `affectedRows`). Added explicit append-only immutability guards (`AUDIT_LOG_IMMUTABLE`, HTTP `403`). | **CERTIFIED (Session-Only Identity + `FOR UPDATE` + CAS + Append-Only Audit)** |
| **4. Real Ephemeral MySQL 8 Integration** | Need live MySQL 8 verification of Migration 174, `ON DELETE RESTRICT`, tenant isolation, indexes, transactions, concurrent `reviewEvidence` race conditions, idempotency, and rollback. | Created [`scripts/test_recovery09h_real_mysql_integration.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/scripts/test_recovery09h_real_mysql_integration.js) and [`tests/paper_materials_recovery_09h_mysql_integration.test.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/paper_materials_recovery_09h_mysql_integration.test.js) and wired them into [`.github/workflows/ci.yml`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/.github/workflows/ci.yml) against the ephemeral MySQL 8.0 service container (`ER_ROW_IS_REFERENCED_2` on variant/evidence delete, `Promise.all` concurrent `reviewEvidence` yielding `1` HTTP `200` + `1` HTTP `409`, rollback + re-apply). | **CERTIFIED (Live MySQL 8.0 in CI)** |
| **5. UI E2E & Coexistence Verification** | Verify full `Operator -> Document -> Submit -> Technologist -> Approval/Rejection -> Audit History` flow, `CATALOG` / `OFFERS` / `ACCREDITATION` coexistence, `ES/EN/DE`, API error handling, PDF upload, and empty states. | Updated [`TechnicalAccreditationPanel.tsx`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/ui/components/supplier/TechnicalAccreditationPanel.tsx) (adding authenticated PDF download link in Audit History) and expanded [`tests/PaperSupplierAccreditationUI.test.tsx`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/PaperSupplierAccreditationUI.test.tsx) (`3/3` comprehensive E2E & coexistence suites passing). | **CERTIFIED (`DE/EN/ES` + Full E2E Flow)** |
| **6. Production Deployment Runbook** | Need complete preflight, backup + `SHA-256` manifest, Migration 174 execution plan, post-migration validation, smoke tests, and rollback procedure without executing in production. | Created [`docs/architecture/RECOVERY_09H_DEPLOYMENT_RUNBOOK.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/RECOVERY_09H_DEPLOYMENT_RUNBOOK.md). Zero production migrations or caliper writes executed during `RECOVERY-09H`. | **CERTIFIED (Runbook Ready)** |

---

## 2. Detailed Technical Verification by Section

### 2.1 Referential Integrity (`ON DELETE RESTRICT`) & Paper Materials Lifecycle
- **DDL Inspection (`migrations/174_phase197c_paper_evidence_and_technical_accreditation.sql`):**
  1. `fk_pvce_variant`: `FOREIGN KEY (variant_id) REFERENCES paper_variants(id) ON DELETE RESTRICT`
  2. `fk_pvce_product`: `FOREIGN KEY (product_id) REFERENCES paper_products(id) ON DELETE RESTRICT`
  3. `fk_pvcal_variant`: `FOREIGN KEY (variant_id) REFERENCES paper_variants(id) ON DELETE RESTRICT`
  4. `fk_pvcal_evidence`: `FOREIGN KEY (evidence_id) REFERENCES paper_variant_caliper_evidence(evidence_id) ON DELETE RESTRICT`
  5. `fk_pvcle_variant`: `FOREIGN KEY (variant_id) REFERENCES paper_variants(id) ON DELETE RESTRICT`
  6. `fk_pvcle_product`: `FOREIGN KEY (product_id) REFERENCES paper_products(id) ON DELETE RESTRICT`
- **Lifecycle Compatibility (`src/api/services/paperOfferService.js`):**
  - `deleteTechnicalVariant(supplierId, variantId, actorId)`: Queries `hasAccreditationEvidence(variantId)` across `paper_variant_caliper_evidence`, `paper_variant_caliper_audit_log`, and `paper_variant_classification_evidence` (gracefully handling `ER_NO_SUCH_TABLE` before Migration 174 is applied). If any accreditation record exists, throws `VARIANT_HAS_TECHNICAL_EVIDENCE` (mapped to HTTP `409 Conflict` in `DELETE /api/v1/paper-suppliers/catalog/variants/:variantId`).
  - `retractImportBatch(supplierId, batchId, actorId)`: Preserves variants that have accreditation evidence/audit history (`preservedSharedCount++`) instead of attempting a physical `DELETE FROM paper_variants`.
  - `previewCatalogAction(supplierId, options)`: Flags `DELETE` actions on variants with accreditation history as blocked with warning `'Variant has immutable technical accreditation evidence or audit history and cannot be permanently deleted (ON DELETE RESTRICT).'`, while allowing `ARCHIVE`, `RESTORE`, and `WITHDRAW` on `supplier_paper_catalog_variants`.

### 2.2 Document Security, Deep PDF Validation & Private Storage
- **Deep Structural Validation (`validateAndHashPdfDocument`):**
  - Rejects non-PDF MIME types (`INVALID_DOCUMENT_MIME_TYPE`, HTTP `422`) and files `> 10 MB` (`DOCUMENT_SIZE_LIMIT_EXCEEDED`, HTTP `413`).
  - Requires `%PDF-1.x` or `%PDF-2.0` header at byte offset `0` (`INVALID_PDF_MAGIC_SIGNATURE`, HTTP `422`).
  - Requires `%%EOF` trailer marker within the tail of the stream (`INVALID_PDF_EOF_TRAILER`, HTTP `422`).
  - Requires indirect PDF objects (`\b\d+\s+\d+\s+obj\b` and `endobj`) and structural page/catalog dictionary (`/Type /Catalog` or `/Type /Page`) (`INVALID_PDF_OBJECT_STRUCTURE`, HTTP `422`).
  - Rejects active/malicious PDF content (`/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFiles`, `/RichMedia`, `/SubmitForm`, `/ImportData`, `<script>`) (`PDF_ACTIVE_CONTENT_FORBIDDEN`, HTTP `422`).
- **Private Content-Addressable Persistence & Orphan Cleanup:**
  - Stores verified PDFs at `<PAPER_EVIDENCE_STORAGE_DIR>/<safeTenantId>/<sha256>.pdf` with `0o600` file permissions and `0o700` directory permissions.
  - Enforces `path.resolve` containment check (`!resolvedFull.startsWith(resolvedBase + path.sep)`) to block path traversal (`PATH_TRAVERSAL_BLOCKED`, HTTP `403`).
  - Cleans up newly written files automatically via `cleanupOrphanEvidenceFile` if the DB transaction fails during `registerDocumentaryEvidence` or `attachPdfToEvidence`, and provides `sweepOrphanEvidenceFiles(tenantId)` for scheduled maintenance.
  - Serves documents exclusively through authenticated `GET /api/v1/paper-suppliers/accreditation/evidences/:evidenceId/document` scoped by `tenant_id` and `VIEWER`/`OPERATOR`/`ADMIN` role, re-computing `SHA-256` from disk before streaming (`EVIDENCE_DOCUMENT_INTEGRITY_MISMATCH` if tampered).

### 2.3 Approval Integrity, Concurrency & Non-Mutation Guarantees
- **Session-Bound Identity:** `sanitizeClientBodyIdentity(req.body)` strips client-provided identity fields before service invocation; `technologistUserId` and `actorId` come strictly from `resolveActorContext(req)`.
- **Segregation of Duties (`SoD`):** `ev.submitted_by === effectiveTechId` fails closed with HTTP `403` (`SOD_SELF_APPROVAL_FORBIDDEN`).
- **Transactional Row Locking & Atomic CAS:** `reviewEvidence` runs inside `_withTransaction`, acquires `SELECT ... FOR UPDATE` on the target row, and executes `UPDATE paper_variant_caliper_evidence SET ... WHERE evidence_id = ? AND tenant_id = ? AND review_status IN ('DRAFT', 'PENDING_TECH_REVIEW')`. If `affectedRows === 0`, the transaction aborts with HTTP `409` (`EVIDENCE_ALREADY_REVIEWED`), preventing duplicate approvals or duplicate audit log entries under concurrent requests.
- **Non-Mutation & Manufacturing Lock:** Approving documentary or physical micrometer evidence sets `applied_to_catalog_variant = FALSE`, returns `productiveCaliperModified: false`, leaves `paper_variants.caliper_um` untouched, and keeps `canReleaseToManufacturing = false`.

---

## 3. Verdict

**`RECOVERY_09H_READY_FOR_DEPLOYMENT_APPROVAL`**
