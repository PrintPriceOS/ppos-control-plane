# PAPER-MATERIALS-RECOVERY-11 — UI, Trilingual i18n (`DE`/`EN`/`ES`) & Responsive Playwright E2E Report

**Project:** PrintPrice OS Control Plane  
**Repository:** `PrintPriceOS/ppos-control-plane`  
**Branch:** `feat/paper-materials-recovery-11`  
**Base Reference:** `08eec541b56ccc42204ec157db0d2e28ee6d39e1` (`RECOVERY_10V_PRODUCTION_CERTIFIED`)  
**Scope:** Phase 4 & Phase 6 — Governed Promotion UI (`TechnicalAccreditationPanel.tsx`), Trilingual i18n (`en.ts`, `es.ts`, `de.ts`), Vitest RTL Suite, and Real Chromium Playwright Verification

---

## 1. Governed Promotion UI Architecture (`TechnicalAccreditationPanel.tsx`)

The **Technical Accreditation & Metrology** panel (`src/ui/components/supplier/TechnicalAccreditationPanel.tsx`) has been extended with a dedicated **Governed Promotion** workflow (`activeModal === 'PROMOTE'`):

1. **Row-Level Promotion Trigger**:
   - Button `[data-testid="btn-promote-<variantId>"]` (`Promote to Catalog` / `Promover a catálogo` / `In Katalog übernehmen`) opens the Governed Promotion modal for any variant with approved technical evidence (`APPROVED_FOR_TECHNICAL_USE` or `CERTIFIED_MEASURED`).
2. **Header & Industrial Lock Badges**:
   - Displays variant identity (`displayName`, `variantId`, `odsCode`, `gsm`, `widthMm × heightMm`), CAS revision transition (`CAS Rev: 1 -> 2`), and the explicit `canReleaseToManufacturing: false` safety badge.
3. **1. Caliper Comparison & Provenance Grid (`[data-testid="promotion-comparison-card"]`)**:
   - **Current Catalog Caliper** (`[data-testid="promo-current-caliper"]`): `NULL (Missing)` (`NONE · MISSING`)
   - **Proposed Approved Caliper** (`[data-testid="promo-proposed-caliper"]`): e.g. `71 µm (0.071 mm · Bulk 0.888)`
   - **Delta (`µm` / `%`)** (`[data-testid="promo-delta"]`): `+71 µm (NEW)` (`NEW_CATALOG_ACCREDITATION_FROM_NULL`)
   - **Target Source & Confidence**: `MANUFACTURER_DATASHEET` / `REFERENCE_IMPORTED` (for documentary evidence) or `MEASURED_MICROMETER` / `VERIFIED` (for ISO 534 physical micrometer evidence)
   - **Document Traceability**: Displays document title, datasheet revision, and SHA-256 prefix.
4. **2. Spine Calculator Before / After Impact (`[data-testid="promotion-spine-impact-card"]`)**:
   - **Before Promotion**: `422 MISSING_PAPER_CALIPER (caliper_um = NULL)`
   - **After Promotion (200 pp Glued & Sewn)**: Displays computed net block (`mm`) and spine width (`mm`) alongside the `MATH_BRANCH_VALIDATED — canReleaseToManufacturing: false` warning.
5. **3. Three-Way Segregation of Duties (`[data-testid="promotion-sod-card"]`)**:
   - Displays `Submitted by`, `Approved by (Tech)`, and `Promotion requested by`, plus any active SoD or catalog protection blocks (`blockingReasons`).
6. **4. Action Selector & Audit Reason**:
   - Supports `AUTHORIZE` (`POST .../promotions/authorize`), `REQUEST` (`POST .../promotions/request`), and `REVERT` (`POST .../promotions/revert`) with mandatory audit reason (`>= 5` characters) and contradiction acknowledgement checkbox when `hasSourceContradiction === true`.

---

## 2. Trilingual Localization Parity (`EN`, `ES`, `DE`)

20 new translation keys under `supplier.accreditation.*` were added with 100% parity across `src/ui/en.ts`, `src/ui/es.ts`, and `src/ui/de.ts`:
- `btnPromote`, `modalPromoteTitle`, `promoteComparisonTitle`, `promoteCurrentCaliper`, `promoteProposedCaliper`, `promoteDelta`, `promoteSourceAndConfidence`, `promoteSpineImpactTitle`, `promoteSpineBefore`, `promoteSpineAfter`, `promoteSodTitle`, `promoteSubmittedBy`, `promoteApprovedBy`, `promoteRequestedBy`, `promoteActionMode`, `promoteActionRequest`, `promoteActionAuthorize`, `promoteActionRevert`, `promoteSubmitRequest`, `promoteSubmitAuthorize`, `promoteSubmitRevert`.

---

## 3. Real Browser Playwright Verification Matrix (`ES` / `EN` / `DE` × 3 Viewports)

Executed against the production Vite bundle (`dist/`) in headless Chromium via Playwright (`9/9 PASS`):

| Locale | Viewport | Governed Promotion Modal Opened (`[data-testid="promotion-modal"]`) | `horizontalOverflowPx` | `consoleErrors` | `pageErrors` | Status |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`ES`** | `1366x768` | `true` | `0` | `0` | `0` | **PASS** |
| **`ES`** | `1280x720` | `true` | `0` | `0` | `0` | **PASS** |
| **`ES`** | `390x844` | `true` | `0` | `0` | `0` | **PASS** |
| **`EN`** | `1366x768` | `true` | `0` | `0` | `0` | **PASS** |
| **`EN`** | `1280x720` | `true` | `0` | `0` | `0` | **PASS** |
| **`EN`** | `390x844` | `true` | `0` | `0` | `0` | **PASS** |
| **`DE`** | `1366x768` | `true` | `0` | `0` | `0` | **PASS** |
| **`DE`** | `1280x720` | `true` | `0` | `0` | `0` | **PASS** |
| **`DE`** | `390x844` | `true` | `0` | `0` | `0` | **PASS** |

---

## 4. Vitest RTL Component Test Suite (`tests/PaperSupplierAccreditationUI.test.tsx`)

- **Test 1**: Renders Technical Accreditation & Metrology tab, KPIs (`1,272 / 252 / 145 / 102 / 337`), contradiction badge, and non-mutation governance banner across `EN`, `ES`, and `DE` (`PASS`).
- **Test 2**: Validates ISO 534 10-point physical micrometer modal live statistics (mean, SD, CV% <= 8% threshold) (`PASS`).
- **Test 3**: Validates PDF upload security limits, Technologist Review modal with SoD banner, and Immutable Audit Log modal (`PASS`).
- **Test 4 (New in `RECOVERY-11`)**: Renders Governed Promotion modal across `EN`, `ES`, and `DE`, verifies `promo-current-caliper`, `promo-proposed-caliper`, Spine Calculator before/after preview (`422 MISSING_PAPER_CALIPER` -> `8.5 mm`), 3-way SoD card, and submits `POST .../promotions/authorize` (`PASS`).
