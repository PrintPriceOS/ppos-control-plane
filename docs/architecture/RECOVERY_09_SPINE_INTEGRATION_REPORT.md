# RECOVERY-09 — Phase 5: Governed Integration with Spine Calculator

**Mission:** `PAPER-MATERIALS-RECOVERY-09`  
**Modules Modified:**
- [`src/api/services/spine/paperCaliperReconciliationService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/paperCaliperReconciliationService.js)
- [`src/api/services/spine/spineCalculationService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/spineCalculationService.js)

---

## 1. Five-Tier Epistemic Provenance Model (`classifyCaliperEvidenceTier`)

We enhanced `paperCaliperReconciliationService.js` (`classifyCaliperEvidenceTier` and `resolveVariantCaliperProvenance`) and `spineCalculationService.js` (`resolveCatalogVariantProvenance`) so that Spine Calculator explicitly distinguishes all 5 epistemic tiers without conflating documentary evidence with manufacturing certification:

| Tier # | Provenance / Evidence Tier Code | Condition | Authoritative `paper_variants.caliper_um` | `canPromoteProfileToProductionCertified` | `canReleaseToManufacturing` |
|---|---|---|---|---|---|
| **1** | `MANUFACTURER_NOMINAL_DATASHEET` | `caliper_source = 'MANUFACTURER_DATASHEET'` on `paper_variants` | Present (`> 0 µm`) | **`false`** | **`false`** |
| **2** | `SUPPLIER_IMPORTED_REFERENCE` | `caliper_source IN ('LIVONIA_REFERENCE_IMPORT', 'SUPPLIER_IMPORT')` on `paper_variants` | Present (`> 0 µm`) | **`false`** | **`false`** |
| **3** | `PHYSICAL_BATCH_MICROMETER` | `caliper_source = 'MEASURED_MICROMETER'` and `caliper_confidence_status = 'VERIFIED'` on `paper_variants` | Present (`> 0 µm`) | **`false`** | **`false`** |
| **4** | `APPROVED_TECHNICAL_EVIDENCE_PENDING_PROMOTION` | `paper_variants.caliper_um IS NULL`, but `paper_variant_caliper_evidence` has an approved record (`APPROVED_FOR_TECHNICAL_USE` or `CERTIFIED_MEASURED`) with `applied_to_catalog_variant = FALSE` | **`NULL` (Untouched)** | **`false`** | **`false`** |
| **5** | `UNACCREDITED_MISSING` | `paper_variants.caliper_um IS NULL` and no approved technical evidence exists | **`NULL`** | **`false`** | **`false`** |

---

## 2. Strict Non-Override & Manufacturing Lock Invariants

1. **Authoritative Catalog Caliper Exclusivity:**
   - In [`spineCalculationService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/spineCalculationService.js#L168-L195), `resolveCatalogVariantProvenance(variantId, conn)` queries `paper_variants` for `caliper_um` and optionally queries `paper_variant_caliper_evidence` for the latest approved evidence (`APPROVED_FOR_TECHNICAL_USE` or `CERTIFIED_MEASURED`).
   - If `paper_variants.caliper_um` is `NULL`, `resolveVariantCaliperProvenance(row, approvedEvidence)` returns `caliperUm: null` and attaches `approvedEvidenceSummary` metadata (`proposedCaliperUm`, `evidenceId`, `reviewStatus`, `approvedByTechnologist`).
   - Spine Calculator **never** silently substitutes an unpromoted `paper_variant_caliper_evidence` value into productive spine calculations until a separately authorized catalog promotion mission updates `paper_variants.caliper_um`.
2. **Preservation of Binding Profile Locks:**
   - `livonia-alegro-softcover@2.0.0` remains `MATH_VALIDATED_ACTIVE` (`MATH_BRANCH_VALIDATED`).
   - `livonia-colibri-hardcover@2.0.0` remains `REQUIRES_TECH_APPROVAL` (`MATH_BRANCH_VALIDATED`).
   - `livonia-colibri-flexi@2.0.0` remains `EXPERIMENTAL_DISABLED` (`EXCEL_EXAMPLE_PARITY`).
   - No documentary or micrometer approval in `paper_variant_caliper_evidence` can promote a binding profile to `PRODUCTION_CERTIFIED` or flip `canReleaseToManufacturing` to `true`.

