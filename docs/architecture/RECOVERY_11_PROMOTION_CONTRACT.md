# PAPER-MATERIALS-RECOVERY-11 — Governed Promotion API & Service Contract

**Project:** PrintPrice OS (`PrintPriceOS/ppos-control-plane`)  
**Mission:** `PAPER-MATERIALS-RECOVERY-11`  
**Service:** `src/api/services/paperEvidenceService.js`  
**Routes:** `src/api/routes/paperSuppliersRoutes.js` (`/api/v1/paper-suppliers/accreditation/...`)

---

## 1. Service Methods Added to `PaperEvidenceService`

| Method | Signature | Description |
| :--- | :--- | :--- |
| `previewEvidencePromotion` | `({ tenantId, supplierId, variantId, evidenceId, actorId, actorRole })` | Computes current vs. proposed caliper (`µm`, `mm`, `bulkFactor`), absolute/percentage delta, target provenance (`caliper_source`, `caliper_confidence_status`), CAS revision (`currentRevision -> nextRevision`), Spine Calculator before/after preview (200 pp Glued & Sewn), SoD exclusions, and blocking reasons. |
| `requestEvidencePromotion` | `({ tenantId, supplierId, variantId, evidenceId, actorId, actorRole, reason, idempotencyKey })` | Validates eligibility gates and records an immutable promotion request (`promotionStage: 'PROMOTION_REQUESTED'`) in `paper_variant_caliper_audit_log` without mutating `paper_variants.caliper_um`. |
| `authorizeEvidencePromotion` | `({ tenantId, supplierId, variantId, evidenceId, promotionRequestId, actorId, actorRole, reason, expectedCaliperRevision, acknowledgeContradiction, idempotencyKey })` | Executes transactional Compare-And-Swap (`SELECT ... FOR UPDATE` + `WHERE id = ? AND caliper_revision = ? AND caliper_um IS NULL`), updates `paper_variants` and `paper_variant_caliper_evidence.applied_to_catalog_variant = TRUE`, invalidates active `spine_calculation_snapshots`, and appends `CATALOG_CALIPER_PROMOTED` audit log with full reversible snapshot. |
| `revokeAndRevertPromotion` | `({ tenantId, supplierId, variantId, evidenceId, actorId, actorRole, reason, expectedCaliperRevision })` | Restores `paper_variants` to its pre-promotion snapshot (`caliper_um = NULL`, `caliper_source = 'NONE'`, `caliper_confidence_status = 'MISSING'`), increments `caliper_revision`, marks evidence `SUPERSEDED`, invalidates active Spine snapshots, and appends `EVIDENCE_SUPERSEDED` audit log. |
| `listVariantPromotions` | `({ tenantId, variantId, actorId, actorRole })` | Returns variant caliper state, `spineProvenance`, `promotedEvidence`, `approvedEvidences`, `promotionPreview`, and `promotionHistory`. |

---

## 2. REST API Endpoints

All endpoints require `PAPER_SUPPLIER_HUB_ENABLED=true`, valid JWT authentication (`requireAdmin`), active supplier scope (`requireSupplierScope`), and approved supplier status (`requireApprovedSupplier`).

### 2.1 `GET /api/v1/paper-suppliers/accreditation/variants/:variantId/promotions`
- **Scope**: `VIEWER`
- **Response (`200 OK`)**:
```json
{
  "ok": true,
  "data": {
    "variant": {
      "variantId": "var_dbd5357075534e3b",
      "productName": "Nevia Plus C1S",
      "gsm": 80,
      "caliperUm": null,
      "caliperSource": "NONE",
      "caliperConfidenceStatus": "MISSING",
      "caliperRevision": 1
    },
    "promotedEvidence": null,
    "approvedEvidences": [...],
    "promotionPreview": {...},
    "promotionHistory": [...],
    "canReleaseToManufacturing": false
  }
}
```

### 2.2 `GET /api/v1/paper-suppliers/accreditation/variants/:variantId/evidences/:evidenceId/promotion-preview`
- **Scope**: `VIEWER`
- **Response (`200 OK`)**: Returns `variant`, `evidence`, `comparison`, `governance` (including `segregationOfDuties` and `blockingReasons`), and `spineImpact` (`beforePromotion`, `afterPromotion`, `canReleaseToManufacturingAfterPromotion: false`).

### 2.3 `POST /api/v1/paper-suppliers/accreditation/variants/:variantId/evidences/:evidenceId/promotions/request`
- **Scope**: `OPERATOR`
- **Headers**: Optional `Idempotency-Key`
- **Request Body**:
```json
{
  "reason": "Requesting catalog promotion of approved Nevia Plus C1S 80g (71 µm) datasheet."
}
```
- **Response (`201 Created` / `200 OK` on idempotent replay)**:
```json
{
  "ok": true,
  "data": {
    "idempotentReplay": false,
    "promotionRequestId": "prm_req_a1b2c3d4e5f60718",
    "evidenceId": "evd_cal_...",
    "variantId": "var_dbd5357075534e3b",
    "status": "PROMOTION_REQUESTED",
    "expectedCaliperRevision": 1,
    "proposedCaliperUm": 71,
    "productiveCaliperModified": false,
    "canReleaseToManufacturing": false
  }
}
```

### 2.4 `POST /api/v1/paper-suppliers/accreditation/variants/:variantId/evidences/:evidenceId/promotions/authorize`
- **Scope**: `ADMIN`
- **Headers**: Optional `Idempotency-Key`
- **Request Body**:
```json
{
  "promotionRequestId": "prm_req_a1b2c3d4e5f60718",
  "expectedCaliperRevision": 1,
  "acknowledgeContradiction": false,
  "reason": "Authorized governed promotion of Nevia Plus C1S 80g (71 µm) to catalog."
}
```
- **Response (`201 Created` / `200 OK` on idempotent replay)**:
```json
{
  "ok": true,
  "data": {
    "idempotentReplay": false,
    "promotionId": "prm_exec_...",
    "auditId": "aud_cal_...",
    "variantId": "var_dbd5357075534e3b",
    "evidenceId": "evd_cal_...",
    "reviewStatus": "APPROVED_FOR_TECHNICAL_USE",
    "previousCaliperUm": null,
    "newCaliperUm": 71,
    "newCaliperMm": 0.071,
    "newBulkFactor": 0.888,
    "previousCaliperSource": "NONE",
    "newCaliperSource": "MANUFACTURER_DATASHEET",
    "previousConfidenceStatus": "MISSING",
    "newConfidenceStatus": "REFERENCE_IMPORTED",
    "previousRevision": 1,
    "newRevision": 2,
    "invalidatedSpineSnapshotsCount": 1,
    "productiveCaliperModified": true,
    "canReleaseToManufacturing": false
  }
}
```

### 2.5 `POST /api/v1/paper-suppliers/accreditation/variants/:variantId/evidences/:evidenceId/promotions/revert`
- **Scope**: `ADMIN`
- **Request Body**:
```json
{
  "expectedCaliperRevision": 2,
  "reason": "Superseded by updated mill batch specification — reverting to NULL."
}
```

---

## 3. Deterministic Error Codes

| HTTP Status | Error Code | Trigger Condition |
| :---: | :--- | :--- |
| `403` | `FORBIDDEN_PROMOTION_AUTHORIZER_ROLE_REQUIRED` | Caller role is not in `ALLOWED_PROMOTION_AUTHORIZER_ROLES` |
| `403` | `SOD_SUBMITTER_CANNOT_PROMOTE` | `actorId === evidence.submitted_by` |
| `403` | `SOD_REVIEWER_CANNOT_PROMOTE` | `actorId === evidence.approved_by_technologist` |
| `403` | `SOD_REQUESTER_CANNOT_AUTHORIZE_PROMOTION` | `actorId === promotionRequest.requestedBy` |
| `404` | `EVIDENCE_NOT_FOUND` | Evidence does not exist or belongs to a different `tenant_id` |
| `409` | `EVIDENCE_REVOKED_OR_SUPERSEDED` | Evidence is in `REJECTED` or `SUPERSEDED` state |
| `409` | `EVIDENCE_ALREADY_PROMOTED` | `applied_to_catalog_variant === TRUE` |
| `409` | `HISTORICAL_CONFLICT_VARIANT_PROTECTED` | `variantId` is one of the 9 protected historical conflicts |
| `409` | `EXISTING_CATALOG_CALIPER_PROTECTED` | `paper_variants.caliper_um IS NOT NULL` (protects the 1,272 existing calipers) |
| `409` | `CALIPER_REVISION_CAS_MISMATCH` | `expectedCaliperRevision !== variant.caliper_revision` |
| `409` | `CONCURRENT_PROMOTION_CONFLICT` | Atomic CAS `UPDATE` affected `0` rows due to concurrent transaction |
| `422` | `EVIDENCE_NOT_APPROVED_FOR_PROMOTION` | Evidence is still `DRAFT` or `PENDING_TECH_REVIEW` |
| `422` | `UNRESOLVED_SOURCE_CONTRADICTION` | `has_source_contradiction === TRUE` without `acknowledgeContradiction === true` |

