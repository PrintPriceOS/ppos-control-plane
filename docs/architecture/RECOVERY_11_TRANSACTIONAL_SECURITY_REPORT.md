# PAPER-MATERIALS-RECOVERY-11 — Transactional, Concurrency & Security Audit Report

**Project:** PrintPrice OS Control Plane  
**Repository:** `PrintPriceOS/ppos-control-plane`  
**Branch:** `feat/paper-materials-recovery-11`  
**Base Reference:** `08eec541b56ccc42204ec157db0d2e28ee6d39e1` (`RECOVERY_10V_PRODUCTION_CERTIFIED`)  
**Audit Scope:** Phase 3 (Transactional Implementation, CAS Locking, Tenant Isolation, 3-Way SoD) & Phase 6 (Real MySQL 8 Certification)

---

## 1. Executive Summary

This report documents the transactional architecture, concurrency locking (`SELECT ... FOR UPDATE` + Compare-And-Swap on `caliper_revision`), 3-way Segregation of Duties (SoD), tenant & supplier scope enforcement, identity sanitization, and protection of existing catalog calipers (`1,272`) and the `9` historical conflict variants (`HISTORICAL_CONFLICT_9_VARIANT_IDS`).

All transactional invariants are verified in both:
1. **Vitest Unit & Express Route Security Suite**: `tests/paper_materials_recovery_11_promotion.test.js` (`6/6 PASS`)
2. **Real MySQL 8 Ephemeral Certification Script**: `scripts/test_recovery11_real_mysql_promotion.js` (executed in GitHub Actions CI against `mysql:8.0` service container).

---

## 2. Transactional Atomicity & Row-Level Locking

`PaperEvidenceService.authorizeEvidencePromotion()` and `PaperEvidenceService.revokeAndRevertPromotion()` execute inside an explicit `BEGIN` / `COMMIT` / `ROLLBACK` transaction on a dedicated connection (`mysqlClient.pool.getConnection()`):

1. **Row-Level Exclusive Locks (`SELECT ... FOR UPDATE`)**:
   - Locks `paper_variants` row (`WHERE id = ? AND tenant_id = ? FOR UPDATE`).
   - Locks `paper_variant_caliper_evidence` row (`WHERE id = ? AND tenant_id = ? FOR UPDATE`).
   - Prevents phantom reads and concurrent lost updates between two administrators attempting to promote competing evidences for the same variant.

2. **Compare-And-Swap (`CAS`) Revision Guard**:
   - Every caller must supply `expectedCaliperRevision` matching the current `paper_variants.caliper_revision`.
   - Before executing the `UPDATE`, the service validates `Number(expectedCaliperRevision) === currentRevision`; mismatch aborts immediately with `409 REVISION_CONFLICT`.
   - The SQL `UPDATE` enforces the guard at the storage engine level:
     ```sql
     UPDATE paper_variants
     SET caliper_um = ?,
         caliper_mm = ?,
         bulk_factor = ?,
         caliper_source = ?,
         caliper_confidence_status = ?,
         caliper_verified_at = NOW(),
         caliper_verified_by = ?,
         caliper_Updated_At = NOW(),
         caliper_revision = caliper_revision + 1
     WHERE id = ? AND tenant_id = ? AND caliper_revision = ? AND caliper_um IS NULL
     ```
   - If `affectedRows !== 1`, the transaction executes `ROLLBACK` and throws `409 CONCURRENT_MODIFICATION_DETECTED`.

3. **Exclusive Active Promotion Invariant**:
   - Inside the transaction, any previously promoted evidence on the variant (`WHERE variant_id = ? AND applied_to_catalog_variant = 1 AND id != ?`) is demoted (`applied_to_catalog_variant = 0, review_status = 'SUPERSEDED'`), ensuring at most **1** active promoted evidence per variant at any time.

---

## 3. Protection of the 1,272 Existing Calipers & 9 Historical Conflicts

| Invariant | Guard Mechanism | HTTP / Error Code | Verified By |
| :--- | :--- | :--- | :--- |
| **9 Historical Conflict Variants** (`5` Amber Graphic @ `122 µm` + `4` Galerie Art Matt @ `225 µm`) | Checked against `HISTORICAL_CONFLICT_9_VARIANT_IDS` before and inside transaction | `409 HISTORICAL_CONFLICT_VARIANT_PROTECTED` | `tests/paper_materials_recovery_11_promotion.test.js` (Test 3) & `scripts/test_recovery11_real_mysql_promotion.js` (Step 1) |
| **1,272 Existing Catalog Calipers** (`caliper_um IS NOT NULL`) | Checked in code (`variant.caliper_um !== null`) AND in SQL `WHERE caliper_um IS NULL` | `409 EXISTING_CATALOG_CALIPER_PROTECTED` | `tests/paper_materials_recovery_11_promotion.test.js` (Test 3) & `scripts/test_recovery11_real_mysql_promotion.js` (Step 2) |
| **Unapproved Evidence** (`SUBMITTED`, `UNDER_TECHNICAL_REVIEW`, `REJECTED`, `CONFLICT_HOLD`) | Checked against `PROMOTABLE_EVIDENCE_STATUSES` (`APPROVED_FOR_TECHNICAL_USE`, `CERTIFIED_MEASURED`) | `409 EVIDENCE_NOT_APPROVED_FOR_PROMOTION` | `tests/paper_materials_recovery_11_promotion.test.js` (Test 3) & `scripts/test_recovery11_real_mysql_promotion.js` (Step 3) |

---

## 4. Three-Way Segregation of Duties (SoD) Matrix

Promotion authorization enforces strict 3-way Segregation of Duties using JWT-derived server-side `actorId` and `actorRole`:

| Check | Rule | Error Code | HTTP Status |
| :--- | :--- | :--- | :--- |
| **Role Gate (Request)** | `actorRole` in `['OPERATOR', 'SUPPLIER_ADMIN', 'CATALOG_GOVERNANCE_ADMIN', 'TENANT_ADMIN', 'ADMIN', 'SUPER_ADMIN']` | `FORBIDDEN_ROLE` | `403` |
| **Role Gate (Authorize / Revert)** | `actorRole` in `['CATALOG_GOVERNANCE_ADMIN', 'TENANT_ADMIN', 'ADMIN', 'SUPER_ADMIN']` | `FORBIDDEN_PROMOTION_ROLE` | `403` |
| **SoD Gate 1 (Submitter ≠ Authorizer)** | `actorId !== evidence.submitted_by` | `SOD_SUBMITTER_CANNOT_PROMOTE` | `403` |
| **SoD Gate 2 (Approver ≠ Authorizer)** | `actorId !== evidence.approved_by_technologist` | `SOD_APPROVER_CANNOT_PROMOTE` | `403` |
| **SoD Gate 3 (Requester ≠ Authorizer)** | `actorId !== promotionRequest.actor_id` (when `promotionRequestId` is linked) | `SOD_REQUESTER_CANNOT_AUTHORIZE_PROMOTION` | `403` |

---

## 5. Identity Sanitization & Tenant / Supplier Isolation

In `src/api/routes/paperSuppliersRoutes.js`, `sanitizeClientBodyIdentity(req.body)` strips all client-supplied identity fields before passing payloads to `PaperEvidenceService`:
- Stripped fields: `submittedBy`, `submitted_by`, `approvedBy`, `approved_by`, `actorId`, `actor_id`, `actorRole`, `actor_role`, `tenantId`, `tenant_id`, `requestedBy`, `requested_by`, `requestedByRole`, `requested_by_role`, `authorizedBy`, `authorized_by`, `authorizedByRole`, `authorized_by_role`, `promotedBy`, `promoted_by`.
- Verified in `tests/paper_materials_recovery_11_promotion.test.js` (Test 5): a spoofed request body attempting to override `authorizedBy` and `actorId` while the authenticated JWT belongs to `user-submitter-01` is rejected with `403 SOD_SUBMITTER_CANNOT_PROMOTE`.

---

## 6. Idempotency & Reversibility (`revokeAndRevertPromotion`)

1. **Idempotency**:
   - Both `requestEvidencePromotion` and `authorizeEvidencePromotion` accept an optional `idempotencyKey`.
   - If a matching `CATALOG_CALIPER_PROMOTED` audit entry with the same `idempotencyKey` already exists for `(tenant_id, variant_id, evidence_id)` and the evidence is currently promoted (`applied_to_catalog_variant = 1`), `authorizeEvidencePromotion` returns `{ status: 'PROMOTED', idempotentReplay: true }` without incrementing `caliper_revision` or creating duplicate audit rows.
2. **Governed Rollback (`revokeAndRevertPromotion`)**:
   - Reads the most recent `CATALOG_CALIPER_PROMOTED` audit snapshot (`metadata_json.previousSnapshot`) inside a `FOR UPDATE` transaction.
   - Restores `caliper_um = NULL`, `caliper_mm = NULL`, `bulk_factor = NULL`, `caliper_source = 'NONE'`, `caliper_confidence_status = 'MISSING'`, increments `caliper_revision` (`1 -> 2`), sets `applied_to_catalog_variant = 0` and `review_status = 'SUPERSEDED'` on the evidence, invalidates active `spine_calculation_snapshots`, and writes an immutable `EVIDENCE_SUPERSEDED` audit log entry with `promotionStage: 'PROMOTION_REVERTED'`.

