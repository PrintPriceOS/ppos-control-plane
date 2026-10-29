# PAPER-MATERIALS-RECOVERY-11 — Spine Calculator & BPE Zero-Drift Regression Report

**Project:** PrintPrice OS Control Plane  
**Repository:** `PrintPriceOS/ppos-control-plane`  
**Branch:** `feat/paper-materials-recovery-11`  
**Base Reference:** `08eec541b56ccc42204ec157db0d2e28ee6d39e1` (`RECOVERY_10V_PRODUCTION_CERTIFIED`)  
**Scope:** Phase 5 — Spine Calculator Resolution, Snapshot Invalidation, Industrial Release Lock (`canReleaseToManufacturing = false`), and BPE Commercial Offer Isolation

---

## 1. Executive Summary

Promoting an approved technical evidence (`APPROVED_FOR_TECHNICAL_USE` or `CERTIFIED_MEASURED`) to `paper_variants.caliper_um` transitions a previously blocked variant (`caliper_um IS NULL` -> `SPINE_ELIGIBILITY_BLOCKED` / `VARIANT_CALIPER_MISSING`) into an eligible variant for the Spine Calculator, while strictly preserving:
1. **Industrial Release Lock**: `canReleaseToManufacturing = false` remains enforced across all Spine calculations using built-in Livonia binding profiles (`MATH_BRANCH_VALIDATED`).
2. **Provenance Honesty**:
   - Promoting a documentary evidence (`APPROVED_FOR_TECHNICAL_USE`) sets `caliper_source = 'MANUFACTURER_DATASHEET'` and `caliper_confidence_status = 'REFERENCE_IMPORTED'`, triggering the `CALIPER_PROVENANCE_REFERENCE_IMPORTED` warning in `SpineCalculationService`.
   - Promoting a physical ISO 534 micrometer evidence (`CERTIFIED_MEASURED`) sets `caliper_source = 'MEASURED_MICROMETER'` and `caliper_confidence_status = 'VERIFIED'`.
3. **Automatic Snapshot Invalidation**: Both `authorizeEvidencePromotion` and `revokeAndRevertPromotion` automatically invalidate active `spine_calculation_snapshots` rows (`WHERE interior_paper_variant_id = ? AND status = 'ACTIVE'`), forcing fresh recalculation with the updated `caliper_revision`.
4. **Zero BPE Commercial Drift**: Promoting or reverting a catalog caliper does not touch `supplier_paper_offers` or BPE pricing formulas.

---

## 2. Spine Calculator Before / After Promotion Behavior

Verified in `tests/paper_materials_recovery_11_promotion.test.js` (Test 2 & Test 6) and `scripts/test_recovery11_real_mysql_promotion.js` (Steps 4–8):

| Lifecycle Stage | `paper_variants.caliper_um` | `caliper_source` / `caliper_confidence_status` | `caliper_revision` | Spine Calculator (`200 pp`, `LIVONIA_SOFTCOVER_PUR_STANDARD`) | `canReleaseToManufacturing` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Pre-Promotion** (252 missing variants) | `NULL` | `NONE` / `MISSING` | `0` | Rejected with `SPINE_ELIGIBILITY_BLOCKED` (`VARIANT_CALIPER_MISSING`) | `false` |
| **2. Approved Evidence Only** (Not Promoted) | `NULL` | `NONE` / `MISSING` | `0` | Still rejected with `SPINE_ELIGIBILITY_BLOCKED` (approval alone never alters catalog caliper) | `false` |
| **3. Promoted (Documentary `150.00 µm`)** | `150.00` (`0.1500 mm`, bulk `1.3043`) | `MANUFACTURER_DATASHEET` / `REFERENCE_IMPORTED` | `1` | **Eligible**: `100 leaves × 0.1500 mm = 15.00 mm` paper block; Glued PUR `15.70 mm`, Sewn `16.45 mm` | `false` (Locked) |
| **4. Reverted (`revokeAndRevertPromotion`)** | `NULL` | `NONE` / `MISSING` | `2` | Returns to `SPINE_ELIGIBILITY_BLOCKED` (`VARIANT_CALIPER_MISSING`); prior snapshots `INVALIDATED` | `false` |

---

## 3. Snapshot Invalidation & Revision Traceability

When `authorizeEvidencePromotion` or `revokeAndRevertPromotion` commits:
```sql
UPDATE spine_calculation_snapshots
SET status = 'INVALIDATED',
    invalidated_at = NOW(),
    invalidation_reason = ?
WHERE tenant_id = ? AND interior_paper_variant_id = ? AND status = 'ACTIVE'
```
- When promoted (`revision 0 -> 1`), any pre-existing active snapshot for that variant is marked `INVALIDATED` with `invalidation_reason = 'CATALOG_CALIPER_PROMOTED_REV_1'`.
- When reverted (`revision 1 -> 2`), any snapshot created while the promotion was active is marked `INVALIDATED` with `invalidation_reason = 'CATALOG_CALIPER_PROMOTION_REVERTED_REV_2'`.
- Tested end-to-end against real MySQL 8 in `scripts/test_recovery11_real_mysql_promotion.js` (Steps 7 & 8).

---

## 4. Regression Suite Execution Summary

| Test Suite | Scope | Tests | Result |
| :--- | :--- | :---: | :---: |
| `tests/paper_materials_recovery_11_promotion.test.js` | Promotion preview, 3-way SoD, CAS conflict, 9 conflicts guard, 1,272 existing guard, Spine impact, revert | `6` | **PASS** |
| `tests/spine02_03_engine_and_api.test.js` | Spine Calculation Engine, Glued/Sewn/Hardcover branches, `canReleaseToManufacturing = false` | `30` | **PASS** |
| `tests/paper_materials_recovery_09.test.js` | Evidence submission, review states, PDF validation, audit chain | `11` | **PASS** |
| `tests/paper_materials_recovery_09h_mysql_integration.test.js` | Migration 174 FK integrity (`RESTRICT` on variants/evidence), PDF path traversal defense | `3` | **PASS** |
| `tests/PaperSupplierAccreditationUI.test.tsx` | Trilingual UI (`EN`/`ES`/`DE`) for Technical Accreditation & Governed Promotion modal | `4` | **PASS** |
| **Total Vitest Verification** | **5 Test Suites** | **54** | **100% PASS** |

