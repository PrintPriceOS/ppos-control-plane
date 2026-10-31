# Phase 193H — Pricing Hawk-Eye Overview

## 1. Purpose & Scope
The **Pricing Hawk-Eye** overview provides an immediate, executive-level diagnostic view of printhouse pricing health, domain completeness, representative calibrated anchors, and hydration integrity directly inside the `BASIC` tab of `PrinthouseDetailPage.tsx`.

### Operational & Governance Boundaries:
- **Read-Only Aggregation**: Reads exclusively from the canonical hydrated rates object (`ph.rates` / `printer_nodes.rates_json`).
- **No Calibration Claims**: Does not claim "calibrated" or "Active / Synced" unless real calibration metadata exists in the data contract. Pricing state reflects structural completeness only (`Configured`, `Partial`, `Incomplete`).
- **No Runtime Sync Fabrication**: Does not assert runtime multi-source synchronization in the browser. Displays authoritative source as `Canonical` (`printer_nodes.rates_json`).
- **Pricing Readiness vs. Operational Readiness**: Labeled strictly as **Pricing Readiness** (`READY`, `PARTIAL`, `INCOMPLETE`). It does not imply marketplace eligibility, dispatch grants, or Controlled Beta stage promotion.
- **Zero Inferred Timestamps**: Node heartbeats or DB `updated_at` timestamps are never misrepresented as calibration dates. Metadata is displayed as `Not exposed` until provided by explicit backend contracts.
- **Zero Mutations**: No database writes, no rate adjustments, no solver modifications, no revision lineage alterations.

---

## 2. Single Canonical Source of Truth
```text
MySQL: printer_nodes.rates_json (node-329a3bc4)
       ↓
GET /api/admin/printhouses (printhousesAdmin.js)
       ↓
Printhouse.rates (ph.rates)
       ↓
getPricingHawkEyeState(ph.rates)
       ↓
PricingHawkEyePanel.tsx
```

---

## 3. Coverage & Completeness Rules

### Weighted Coverage Calculation:
- **`CONFIGURED`**: Domain contributes **1.0** weight.
- **`PARTIAL`**: Domain contributes **0.5** weight.
- **`MISSING`**: Domain contributes **0.0** weight.

$$\text{Coverage \%} = \text{round}\left(\frac{\sum \text{Domain Weights}}{\text{Total Domains (6)}} \times 100\right)$$

### Domain Health Classification:

| Domain | Required Structural Groups | CONFIGURED Criteria | PARTIAL / MISSING |
| :--- | :--- | :--- | :--- |
| **Interior** | `interior_one_colour_fixed/var`, `interior_two_colour_fixed/var`, `interior_full_colour_fixed/var` | All 6 rate objects present with numeric rates | `PARTIAL` if 1–5 present; `MISSING` if 0 |
| **Cover & Endpapers** | `cover_fixed_by_colours`, `cover_var_per_1000_by_colours` | Both objects present with numeric rates | `PARTIAL` if 1 present; `MISSING` if 0 |
| **Lamination & UV** | `lam_fixed`, `lam_var_per_1000`, `uv_varnish` (`fixed` & `var`) | All 3 objects present with numeric rates | `PARTIAL` if 1–2 present; `MISSING` if 0 |
| **Binding** | Supported families: Perfect Bound (`pb`), Hardcover (`hc`), Wire-O (`wo`), Saddle Stitch (`ss`) | At least one family has paired `fixed` + `var` and no unpaired active families | `PARTIAL` if unpaired fixed/var exists; `MISSING` if no binding data |
| **Paper Costs** | `paper_price_interior_by_kilo`, `paper_price_cover_by_kilo` | Both paper groups present with numeric rates | `PARTIAL` if 1 present; `MISSING` if 0 |
| **Transport** | `transport_costs` or `technical_costs_for_transport` | Defined numeric transport costs or technical flag | `MISSING` if undefined/null |

---

## 4. Null vs. Zero Semantics
- **Explicit `0` or `0.00`**: Classified strictly as a **VALID configured rate**. Zeros never trigger missing or partial states.
- **`null` / `undefined` / missing key**: Classified as unconfigured / missing.
- **Critical Anchors**: 8 representative rates evaluated for `typeof val === 'number'` and `!isNaN(val)`.

---

## 5. KPI Row Definitions

1. **Pricing Coverage**: Weighted percentage (`0%` – `100%`).
2. **Configured Domains**: Exact count of fully configured domains (`0 / 6` to `6 / 6`).
3. **Missing Key Anchors**: Exact count of missing values among the 8 key representative rates (`0` to `8`).
4. **Pricing State**: `Configured` ("Rate card structurally complete"), `Partial` ("Some pricing domains incomplete"), or `Incomplete` ("Requires pricing setup").
5. **Active Revision**: `Not exposed` (truthful reporting since Admin API does not yet serialize revision IDs).
6. **Canonical Source**: `Canonical` (`printer_nodes.rates_json`).

---

## 6. Pricing Verification Panel

- **Pricing Readiness Banner**: `READY` ("Canonical pricing structure complete"), `PARTIAL` ("Some pricing domains incomplete"), or `INCOMPLETE` ("Pricing configuration required").
- **Key Fields**:
  - `Pricing source`: `Canonical rates_json`
  - `Admin hydration`: `Loaded` / `Unavailable`
  - `Rate-card structure`: `Complete` / `Partial` / `Missing`
  - `Active revision`: `Not exposed`
  - `Calibration metadata`: `Not exposed`
  - `Quote capability`: `Available` (when `READY`) / `Unavailable`
  - `Quote engine`: Badge `Canonical Engine`
- **Actions**: `Open pricing details →` (activates `Interior` tab); each individual module row links directly to its respective specialist tab (`Interior`, `Cover & Endpapers`, `Lamination & UV`, `Binding`, `Paper Costs`, `Transport`).

---

## 7. Neutral Type Architecture
- Neutral navigation types located at `src/ui/types/printhousePricing.ts` (`PricingDetailTab`).
- Helper `src/ui/lib/pricingHawkEyeHelper.ts` imports only types and `PrinthousesPage.ts`, eliminating circular dependencies.
- Zero `any` or `as any` typecasts across the entire Hawk-Eye component tree.

---

## 8. Test Evidence

### A. Hawk-Eye Suite (`tests/smoke_pricing_hawkeye.js`):
```text
═══ Pricing Hawk-Eye Remediation Suite ═══

  ✓ HAWK-01: Fully structured canonical rates yield configured domains, expected coverage, and truthful pricing state
  ✓ HAWK-02: Explicit numeric 0 is treated as valid and not counted as missing
  ✓ HAWK-03: Interior with missing 2-colour or variable groups must NOT become fully CONFIGURED
  ✓ HAWK-04: Missing expected rate group yields PARTIAL or MISSING
  ✓ HAWK-05: Production node-329a3bc4 extracts exact representative anchors
  ✓ HAWK-06: Evaluating Hawk-Eye state never mutates input rates object
  ✓ HAWK-07: Helper output contains no false calibration or browser sync claims
  ✓ HAWK-08: Empty rates gracefully yields Incomplete pricing state and 0% coverage
  ✓ HAWK-09: Binding family pairing rules require paired fixed + var
  ✓ HAWK-10: Weighted coverage calculation assigns 1.0 to CONFIGURED and 0.5 to PARTIAL

═══ Pricing Hawk-Eye Results: 10 passed, 0 failed ═══
```

### B. Existing Hydration & Contract Suites:
- `smoke_phase193h8c6113_rehydration_integrity.js`: **5/5 PASS**
- `smoke_phase193h8c61133_rehydration_contract_integrity.js`: **4/4 PASS**
- `smoke_phase193h8c6113662_supersession_ui_truth.js`: **4/4 PASS**
- `scripts/verify_pricing_hydration_3way.js`: **PASS**

### C. Production Bundle Build:
```text
✓ 3541 modules transformed.
✓ built in 10.21s
dist/assets/index-CCFBd-PX.js  3,002.19 kB │ gzip: 558.02 kB
```
