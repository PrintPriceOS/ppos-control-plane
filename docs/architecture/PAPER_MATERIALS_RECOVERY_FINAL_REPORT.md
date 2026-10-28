# PAPER-MATERIALS-RECOVERY-03R — Final Executive Report, Git Scope Remediation & Selective 943-Row Readiness

**Mission:** `PAPER-MATERIALS-RECOVERY-03R — Reconciliación Git y Preparación de Actualización Productiva`  
**Primary Repository:** `PrintPriceOS/ppos-control-plane`  
**Consumer Repository:** `PrintPriceOS/PrintPricePro_BookPrice` ([PR #4](https://github.com/PrintPriceOS/PrintPricePro_BookPrice/pull/4))  
**Production Environment:** `212.227.79.67` (`Control` MySQL database)  
**Final Verdict:** **`PAPER_MATERIALS_RECOVERY_03R_READY_FOR_WRITE_APPROVAL`**

---

## 1. Executive Summary & Git Scope Remediation (Phase 1)

1. **Root Cause of PR #12 Oversized Scope (`1,170` commits / `6,654` files)**:
   - PR #12 was opened with `--base main`, whereas the industrial Spine & Paper Materials stack (`SPINE-03R`, `SPINE-05`, `SPINE-06R`, `PAPER-CALIPER-RECOVERY-02` at commit `fe5287175bf32c8dfa4819bc24eaec515a7a6532` in PR #11) is based on `feat/spine-03r-caliper-and-engine` (which itself targets `feat/budget-02d01-e2e-remediation`).
2. **Remediation Executed**:
   - Created a clean replacement branch `feat/paper-materials-recovery-03r` branched directly from `fe5287175bf32c8dfa4819bc24eaec515a7a6532` (`feat/spine-03r-caliper-and-engine`, PR #11 HEAD) and opened a replacement PR targeting `feat/spine-03r-caliper-and-engine` containing **exclusively** the `19` files (`1` commit) of `PAPER-MATERIALS-RECOVERY-03R`.
   - Closed PR #12 as superseded without merging it and without rebasing or mutating PR #11 (`fe5287175bf32c8dfa4819bc24eaec515a7a6532`).

---

## 2. Direct Production State Verification (Phase 2 — `PAPER-CALIPER-RECOVERY-02` Intact)

We queried MySQL `Control` on `212.227.79.67` directly (`2026-10-28T20:29:59Z`) and confirmed that `PAPER-CALIPER-RECOVERY-02` has **not** been repeated and all recovered calipers remain intact:

- **Total variants in `Control.paper_variants`**: **`1,524`** (`1,522` products in `Control.paper_products`).
- **Variants WITH caliper (`caliper_um > 0`)**: **`1,171` (`76.84%`)** (`1,162` `SUPPLIER_IMPORT` + `9` `LIVONIA_REFERENCE_IMPORT`).
- **Variants WITHOUT caliper (`caliper_um IS NULL`)**: **`353` (`23.16%`)** (`caliper_source = 'NONE'`, `caliper_confidence_status = 'MISSING'`).
- **Source caliper conflicts preserved**: **`9`** (`5` `Amber Graphic 100g` `122 µm` vs `119 µm`; `4` `Galerie Art Matt 250g` `225 µm` vs `257 µm`).
- **Active write/import processes**: **`0`** (`SHOW FULL PROCESSLIST` has `0` active write queries).
- **Pre-update backups & in-DB clone tables verified**:
  - `/opt/printprice-os/backups/paper-materials-recovery-03/Control_full_backup_20261028_210500.sql` (`89,333,746` B, `SHA-256: 3d4fea67c0f1db861f1b8c4c6cee30db87f633a9cb0d992cbdbe95a475627555`)
  - `/opt/printprice-os/backups/paper-materials-recovery-03/Control_paper_tables_20261028_210500.sql` (`8,870,107` B, `SHA-256: bd825d1d57d13f519e14f1be4ced0bee7fb24d5e0d710693219b39d587a95574`)
  - `/opt/printprice-os/backups/paper-materials-recovery-03/paper_technical_fields_snapshot_20261028_210500.json` (`2,821,450` B, `SHA-256: fc8b91ad1f722c354a3ab174c44b38d39e8f9420fc89b7e966fa2257b180aad8`)
  - `/opt/printprice-os/backups/paper-materials-recovery-03/rollback_paper_materials_recovery_03r_943.sql` (`734,820` B, `SHA-256: f3e798945a55d09ed06507f142eec69ebd82b9839d0241597f6a75859fbdf29a`)
  - `CHECKSUM TABLE Control.paper_products` = `2180808459` (identical to `paper_products_backup_rec03_20261028`)
  - `CHECKSUM TABLE Control.paper_variants` = `866434577` (identical to `paper_variants_backup_rec03_20261028`)
  - `CHECKSUM TABLE Control.supplier_paper_offers` = `3737849396`

---

## 3. Selective 943-Row Update Preparation & Strict Exclusions (Phase 3)

| Reconciliation Category | Variants | % of Catalog | Action in `PAPER-MATERIALS-RECOVERY-03R` |
| :--- | :---: | :---: | :--- |
| **`SAFE_UNIQUE_MATCH`** | **`943`** | **`61.88%`** | **ELIGIBLE FOR WRITE**: Unique 1:1 tuple match `(product_name, gsm, width_mm, height_mm)` with explicit, non-conflicting `PAPER TYPE` and `COAT` in ODS (`811` with caliper + `132` without caliper). Full before/after diff in [`PAPER_MATERIALS_RECOVERY_03R_ELIGIBLE_943_DIFF.csv`](./PAPER_MATERIALS_RECOVERY_03R_ELIGIBLE_943_DIFF.csv). |
| **`STRONG_MATCH_REVIEW`** | **`501`** | **`32.87%`** | **EXCLUDED FROM WRITE**: Not updated in DB and not auto-converted into verified attributes at runtime (`resolveVariantTechnicalAttributes` only strips synthetic `OTHER + UNCOATED` defaults to `UNKNOWN`). |
| **`ATTRIBUTE_CONFLICT`** | **`62`** | **`4.07%`** | **EXCLUDED FROM WRITE**: Conflicting source tokens (`Jautāt` [`31`], `dizaina` covering [`21`], `Matt` vs `nekrītots` [`2`], `Matt` vs `silk` [`2`], plus `6` singular conflicts). |
| **`AMBIGUOUS_MATCH`** | **`16`** | **`1.05%`** | **EXCLUDED FROM WRITE**: Duplicate tuples in ODS (`2` rows each). |
| **`ALREADY_VERIFIED`** | **`2`** | **`0.13%`** | **EXCLUDED FROM WRITE**: Accredited demo rows (`LONG_GRAIN` / `SHORT_GRAIN`). |
| **`UNMATCHED`** | **`0`** | **`0.00%`** | None. |
| **TOTAL** | **`1,524`** | **`100.00%`** | Complete catalog accounted for. |

### Summary of Attribute Changes Across the `943` Eligible Variants (`942` Distinct Products)
- **`paper_products.category` (`paperType`)**:
  - Before: `OTHER` (`581`), `COATED` (`282`), `OFFSET` (`26`), `DESIGN` (`23`), `CARTON` (`5`), `UNCOATED` (`0`)
  - After: `OFFSET` (`379`), `COATED` (`360`), `CARTON` (`108`), `DESIGN` (`96`)
- **`paper_variants.finish` (`and paper_products.finish_summary`)**:
  - Before: `UNCOATED` (`636`), `SILK` (`276`), `COATED` (`6`), `MATT` (`0`), `GLOSS` (`0`)
  - After: `UNCOATED` (`466`), `SILK` (`251`), `MATT` (`130`), `OTHER` (`77`), `SEMI_GLOSS` (`11`), `GLOSS` (`8`)
- **`coating_status` (`paper_products.metadata_json.coating_status` & `paper_variants.metadata_json.ods_materials_recovery.coating_status`)**:
  - After: `UNCOATED` (`466`), `COATED` (`450`), `ONE_SIDE_COATED` (`27`) — `100%` with `coating_confidence = 'EXPLICIT_SOURCE'`.
- **`paper_variants.grain_direction`**:
  - Before & After: `UNKNOWN` (`943` — zero grain inference).
- **`paper_variants.caliper_um` / `caliper_source` / `caliper_confidence_status`**:
  - Before & After: **`100%` untouched** (`811` with caliper preserved, `132` without caliper preserved).

---

## 4. Deliverables Index

1. [`docs/architecture/PAPER_MATERIALS_RECOVERY_SOURCE_AUDIT.md`](./PAPER_MATERIALS_RECOVERY_SOURCE_AUDIT.md) — Source audit (`Paper data base.ods.zip` vs CSV batches vs Livonia vs MySQL `Control`).
2. [`docs/architecture/PAPER_MATERIALS_RECOVERY_NORMALIZATION_RULES.md`](./PAPER_MATERIALS_RECOVERY_NORMALIZATION_RULES.md) — Multilingual normalization rules and invariants.
3. [`docs/architecture/PAPER_MATERIALS_RECOVERY_MATCH_MATRIX.csv`](./PAPER_MATERIALS_RECOVERY_MATCH_MATRIX.csv) — Full `1,524`-row reconciliation matrix.
4. [`docs/architecture/PAPER_MATERIALS_RECOVERY_03R_ELIGIBLE_943_DIFF.csv`](./PAPER_MATERIALS_RECOVERY_03R_ELIGIBLE_943_DIFF.csv) — **Row-by-row Before/After diff for the `943` eligible `SAFE_UNIQUE_MATCH` variants** including preserved caliper values.
5. [`docs/architecture/PAPER_MATERIALS_RECOVERY_UNKNOWN_UNCOATED_AUDIT.md`](./PAPER_MATERIALS_RECOVERY_UNKNOWN_UNCOATED_AUDIT.md) — Root-cause analysis and remediation of `UNKNOWN · UNCOATED`.
6. [`docs/architecture/PAPER_MATERIALS_RECOVERY_MIGRATION_PLAN.md`](./PAPER_MATERIALS_RECOVERY_MIGRATION_PLAN.md) — Direct Phase 2 production verification, backup manifest, schema compatibility matrix, and specific 943-row rollback plan.
7. [`docs/architecture/PAPER_MATERIALS_RECOVERY_SPINE_BPE_REGRESSION.md`](./PAPER_MATERIALS_RECOVERY_SPINE_BPE_REGRESSION.md) — Validation & regression test results (Phase 4).
8. [`docs/architecture/PAPER_MATERIALS_RECOVERY_FINAL_REPORT.md`](./PAPER_MATERIALS_RECOVERY_FINAL_REPORT.md) — This executive report.

---

## 5. Final Verdict

**`PAPER_MATERIALS_RECOVERY_03R_READY_FOR_WRITE_APPROVAL`**


