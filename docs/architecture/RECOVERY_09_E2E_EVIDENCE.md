# RECOVERY-09 — Phase 6: E2E & Regression Validation Evidence

**Mission:** `PAPER-MATERIALS-RECOVERY-09` & `PAPER-MATERIALS-RECOVERY-09H`  
**Status:** `ALL_SUITES_PASSED (53/53 automated tests green + Live Ephemeral MySQL 8 CI)`  
**Productive Caliper Writes Executed:** `0` (`1,272` with caliper, `252` without caliper, `9` historical conflicts intact)

---

## 1. Automated Verification Summary (`Vitest` + `Phase 183 Migration Integrity` + `Ephemeral MySQL 8`)

| Test Suite / Verification Script | Tests | Result | Scope Covered |
|---|---:|---|---|
| `node scripts/smoke_phase183_migration_integrity.js` | 177 migrations | **PASSED** | Verifies MySQL 8 DDL integrity, additive migration `174` (`ON DELETE RESTRICT` across all 6 FKs) + rollback `174`, and zero schema drift against `migrations/migration-integrity-baseline.json`. |
| [`tests/paper_materials_recovery_09h_mysql_integration.test.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/paper_materials_recovery_09h_mysql_integration.test.js) | 5 | **5 / 5 PASS** | Audits `ON DELETE RESTRICT` across all 6 FKs + lifecycle protection in `paperOfferService.js` (`VARIANT_HAS_TECHNICAL_EVIDENCE`), deep PDF validation + private disk store + orphan cleanup + tamper detection, session-only identity (`sanitizeClientBodyIdentity`) + concurrent `Promise.all` race-condition protection (`SELECT ... FOR UPDATE` + CAS) + append-only audit log (`AUDIT_LOG_IMMUTABLE`), and live MySQL 8 integration (`scripts/test_recovery09h_real_mysql_integration.js`). |
| [`tests/paper_materials_recovery_09.test.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/paper_materials_recovery_09.test.js) | 8 | **8 / 8 PASS** | Reconciles `337` vs `338` pending classifications (`G1..G6 = 337`), validates migration `174` & rollback `174`, filters `252` missing-caliper materials (`145` physical, `102` datasheet, `5` conflict), enforces deep PDF structure + `10 MB` limit + `SHA-256`, verifies idempotency replay, `>5%` source contradiction flagging, `ISO 534` 10-reading metrology validation, Segregation of Duties (`SOD_SELF_APPROVAL_FORBIDDEN`), RBAC (`VIEWER` vs `OPERATOR` vs `ADMIN`), tenant isolation (`tenant-a` vs `tenant-b`), 5-tier Spine provenance, and **non-mutation of `paper_variants.caliper_um`**. |
| [`tests/PaperSupplierAccreditationUI.test.tsx`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/PaperSupplierAccreditationUI.test.tsx) | 3 | **3 / 3 PASS** | Renders `SupplierCatalogOffersPage` + `TechnicalAccreditationPanel` across `EN`, `ES`, and `DE`, verifies KPI strip (`1272`, `252`, `145`, `102`, `337`), `canReleaseToManufacturing: false` banner, clean coexistence between `CATALOG`, `OFFERS`, and `ACCREDITATION` tabs, and complete E2E flow (`Operator -> PDF upload -> Submit -> API error handling -> Technologist Review -> Audit History + PDF download link -> Empty state`). |
| [`tests/paper_materials_recovery_08.test.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/paper_materials_recovery_08.test.js) | 6 | **6 / 6 PASS** | Verifies `RECOVERY-08` inventory (`252` rows), supplier request matrix (`REQ08-001`..`REQ08-252`), and `ISO 534` statistical acceptance rules. |
| [`tests/spine02_03_engine_and_api.test.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/spine02_03_engine_and_api.test.js) | 27 | **27 / 27 PASS** | Full Spine Calculator engine, multi-tenant snapshot persistence, quote revision invalidation, and BPE economic zero-drift (`0.00 €` variance). |
| [`tests/SupplierBatchHistoryAndLocalization.test.tsx`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/SupplierBatchHistoryAndLocalization.test.tsx) | 4 | **4 / 4 PASS** | Regression check confirming existing `CATALOG` and `OFFERS` tabs in `SupplierCatalogOffersPage` remain 100% intact. |

---

## 2. Detailed Validation Matrix

1. **Authorization & Multi-Tenant Isolation:**
   - `SUPPLIER_VIEWER` attempting `POST /api/v1/paper-suppliers/accreditation/evidences/documentary` is rejected with HTTP `403` (`FORBIDDEN_SUPPLIER_SCOPE`).
   - Evidence registered by `tenant-a` on `var_dbd5357075534e3b` is completely invisible to `tenant-b` (`caliperEvidences: []`).
2. **Source Contradiction Detection (`> 5%`):**
   - Registering a `71 µm` official manufacturer datasheet followed by an `82 µm` merchant declaration (`15.49%` divergence) automatically sets `hasSourceContradiction: true` and logs `CONTRADICTION_FLAGGED`.
3. **ISO 534 Physical Micrometer Acceptance & Rejection:**
   - Submitting fewer than `10` platen readings (`5` readings) fails closed with HTTP `422` (`ISO_534_MIN_10_READINGS_REQUIRED`).
   - Submitting `10` valid readings (`[164, 165, 166, 165, 164, 165, 166, 165, 164, 166]`) under `23.2 °C` and `50.4% RH` with valid calibration certificate succeeds (`mean = 165 µm`, `CV = 0.48%`).
4. **Segregation of Duties (SoD) & Non-Mutation of `paper_variants.caliper_um`:**
   - Self-approval by `operator-alice` is blocked (`SOD_SELF_APPROVAL_FORBIDDEN`, HTTP `403`).
   - Approval by independent technologist `tech-bob` transitions the evidence to `APPROVED_FOR_TECHNICAL_USE` (or `CERTIFIED_MEASURED` for physical measurements) while `productiveCaliperModified` remains `false` and `paper_variants.caliper_um` remains `NULL` (`0` `UPDATE paper_variants` queries executed).
5. **Preservation of `1,272` Existing Calipers & `9` Historical Conflicts:**
   - No migration or write was executed against `MySQL Control` during `RECOVERY-09`. All `1,272` recovered calipers (`83.46%` of the `1,524` catalog) and all `9` historical conflicts (`var_2b0314c68f5a97c7`, `var_7b7e3a2a2a4a0313`, `var_4178aecbfa53dcf8`, `var_c699e6a51cd6b41f`, `var_5f5cae75e6f45671`, `var_ae7dbf443ceab19a`, `var_9dabfd7ac5eff6ca`, `var_06e1d1681e4f0989`, `var_e2f2e68304e9d4a1`) remain 100% untouched.

