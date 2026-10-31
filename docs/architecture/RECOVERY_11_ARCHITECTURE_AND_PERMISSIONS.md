# PAPER-MATERIALS-RECOVERY-11 — Architecture, Lifecycle States & Permission Matrix

**Project:** PrintPrice OS (`PrintPriceOS/ppos-control-plane`)  
**Mission:** `PAPER-MATERIALS-RECOVERY-11` — Promoción gobernada de evidencias técnicas al catálogo  
**Base Commit:** `08eec541b56ccc42204ec157db0d2e28ee6d39e1` (`RECOVERY_10V_PRODUCTION_CERTIFIED`)  
**Target Branch:** `feat/paper-materials-recovery-11`  
**Operational Mode:** Pre-deployment implementation & certification (`0` productive promotions executed)

---

## 1. Four-Stage Epistemic & Governance Separation

`PAPER-MATERIALS-RECOVERY-11` enforces an explicit architectural and transactional boundary across four distinct lifecycle stages so that no stage can implicitly bypass or conflate another:

| Stage | Domain Concept | Target Table / Column | Permitted Transition | Mutates `paper_variants.caliper_um`? | Unlocks `canReleaseToManufacturing`? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Stage 1: Evidence Submission** | Operator registers PDF datasheet or ISO 534 10-point micrometer record | `paper_variant_caliper_evidence.review_status` | `DRAFT` / `PENDING_TECH_REVIEW` | **NO (`false`)** | **NO (`false`)** |
| **Stage 2: Evidence Approval** | Qualified Technologist / Admin validates metrological or documentary accuracy (`submitted_by !== approved_by_technologist`) | `paper_variant_caliper_evidence.review_status` | `APPROVED_FOR_TECHNICAL_USE` or `CERTIFIED_MEASURED` (or `REJECTED`) | **NO (`false`)** | **NO (`false`)** |
| **Stage 3: Catalog Promotion Authorization (CAS)** | Distinct Governance Authorizer (`authorized_by !== submitted_by`, `!== approved_by_technologist`, `!== requested_by`) promotes approved evidence via transactional Compare-And-Swap | `paper_variants.caliper_um`, `caliper_mm`, `bulk_factor`, `caliper_source`, `caliper_confidence_status`, `caliper_revision` + `paper_variant_caliper_evidence.applied_to_catalog_variant = TRUE` | `CATALOG_CALIPER_PROMOTED` (or reverted via `EVIDENCE_SUPERSEDED`) | **YES (`true`, CAS-guarded when `caliper_um IS NULL`)** | **NO (`false`)** |
| **Stage 4: Industrial Manufacturing Release** | Independent bindery profile certification (`PRODUCTION_CERTIFIED`) + physical batch verification (`VERIFIED`) | `spine_binding_profiles.certification_tier` + `spine_calculation_snapshots` | `verifySnapshotForManufacturingRelease` | N/A | Only when profile is `PRODUCTION_CERTIFIED` AND caliper confidence is `VERIFIED` |

---

## 2. Schema & Enum Reuse Audit (Zero Unnecessary Enum / DDL Expansion)

In accordance with Phase 1 instructions (*"Identificar los estados existentes de evidencia, permisos y procedencia; no introducir nuevos enums salvo necesidad justificada"*), `PAPER-MATERIALS-RECOVERY-11` reuses 100% of the existing enums and columns established in Migrations `172`, `173`, and `174`:

1. **`paper_variant_caliper_evidence.review_status`**:
   - Existing `ENUM('DRAFT', 'PENDING_TECH_REVIEW', 'APPROVED_FOR_TECHNICAL_USE', 'CERTIFIED_MEASURED', 'REJECTED', 'SUPERSEDED')`.
   - Promotion requires `review_status IN ('APPROVED_FOR_TECHNICAL_USE', 'CERTIFIED_MEASURED')` and `applied_to_catalog_variant = FALSE`.
   - Revocation/reversion transitions `review_status` to `'SUPERSEDED'` and resets `applied_to_catalog_variant = FALSE`.
2. **`paper_variant_caliper_audit_log.action_type`**:
   - Existing `ENUM('EVIDENCE_CREATED', 'EVIDENCE_DOCUMENT_ATTACHED', 'EVIDENCE_SUBMITTED_FOR_REVIEW', 'EVIDENCE_APPROVED', 'EVIDENCE_REJECTED', 'CONTRADICTION_FLAGGED', 'CATALOG_CALIPER_PROMOTED', 'EVIDENCE_SUPERSEDED')`.
   - Promotion requests record structured metadata (`promotionStage: 'PROMOTION_REQUESTED'`) in `metadata_json`.
   - Promotion executions record `action_type = 'CATALOG_CALIPER_PROMOTED'` with `previous_caliper_um`, `new_caliper_um`, `previous_caliper_source`, `new_caliper_source`, `previous_confidence_status`, `new_confidence_status`, `previous_revision`, `new_revision`, and full reversible snapshot in `metadata_json`.
   - Promotion reversions record `action_type = 'EVIDENCE_SUPERSEDED'`.
3. **`paper_variants` Provenance Mapping**:
   - Documentary evidences (`APPROVED_FOR_TECHNICAL_USE` / `MANUFACTURER_DATASHEET_PDF` / `SUPPLIER_TECHNICAL_SHEET_PDF`) promote to `caliper_source = 'MANUFACTURER_DATASHEET'` (or `'SUPPLIER_IMPORT'`) and `caliper_confidence_status = 'REFERENCE_IMPORTED'`. They **never** receive `'VERIFIED'` confidence, ensuring documentary sheets cannot masquerade as physical micrometer measurements.
   - Physical ISO 534 10-point micrometer evidences (`CERTIFIED_MEASURED` / `PHYSICAL_MICROMETER_RECORD`) promote to `caliper_source = 'MEASURED_MICROMETER'` and `caliper_confidence_status = 'VERIFIED'`.

---

## 3. RBAC & 3-Way Segregation of Duties (SoD) Matrix

All actor identities (`actorId`, `actorRole`, `tenantId`, `supplierId`) are resolved exclusively on the server via `resolveActorContext(req)` and `req.verifiedSupplierContext`. Client-supplied identity fields (`actorId`, `submittedBy`, `approvedByTechnologist`, `requestedBy`, `authorizedBy`, `promotedBy`) are stripped by `sanitizeClientBodyIdentity()`.

| Operation | Endpoint | Minimum Scope | Allowed Roles | Segregation of Duties (SoD) Rule |
| :--- | :--- | :--- | :--- | :--- |
| **List Variant Promotions** | `GET /accreditation/variants/:variantId/promotions` | `VIEWER` | `SUPPLIER_VIEWER`, `SUPPLIER_OPERATOR`, `SUPPLIER_ADMIN`, `MATERIAL_TECHNOLOGIST`, `SUPER_ADMIN` | Tenant-isolated read |
| **Preview Evidence Promotion** | `GET /accreditation/variants/:variantId/evidences/:evidenceId/promotion-preview` | `VIEWER` | `SUPPLIER_VIEWER`, `SUPPLIER_OPERATOR`, `SUPPLIER_ADMIN`, `MATERIAL_TECHNOLOGIST`, `SUPER_ADMIN` | Computes `excludedAuthorizerActorIds` |
| **Request Promotion** | `POST /accreditation/variants/:variantId/evidences/:evidenceId/promotions/request` | `OPERATOR` | `SUPPLIER_OPERATOR`, `SUPPLIER_ADMIN`, `MATERIAL_TECHNOLOGIST`, `PRINTHOUSE_ADMIN`, `TENANT_ADMIN`, `OPS_ADMIN`, `ADMIN`, `SUPER_ADMIN` | Records `requested_by = actorId` |
| **Authorize Promotion (CAS)** | `POST /accreditation/variants/:variantId/evidences/:evidenceId/promotions/authorize` | `ADMIN` | `SUPPLIER_ADMIN`, `MATERIAL_TECHNOLOGIST`, `PRINTHOUSE_ADMIN`, `TENANT_ADMIN`, `OPS_ADMIN`, `ADMIN`, `SUPER_ADMIN` | `actorId !== submitted_by` (`403 SOD_SUBMITTER_CANNOT_PROMOTE`) **AND** `actorId !== approved_by_technologist` (`403 SOD_REVIEWER_CANNOT_PROMOTE`) **AND** `actorId !== requested_by` (`403 SOD_REQUESTER_CANNOT_AUTHORIZE_PROMOTION`) |
| **Revoke & Revert Promotion** | `POST /accreditation/variants/:variantId/evidences/:evidenceId/promotions/revert` | `ADMIN` | `SUPPLIER_ADMIN`, `MATERIAL_TECHNOLOGIST`, `PRINTHOUSE_ADMIN`, `TENANT_ADMIN`, `OPS_ADMIN`, `ADMIN`, `SUPER_ADMIN` | Restores pre-promotion snapshot + increments `caliper_revision` |

