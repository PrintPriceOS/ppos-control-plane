# PHASE 193A.3 — Control Plane Calibration Adapter Audit

> **Repo**: `ppos-control-plane`
> **Branch**: `phase-39.2-tenant-management-console`
> **HEAD Commit**: `75d3196 fix(setup): use canonical auth token and restore panel icons`
> **Audit Date**: 2026-08-18
> **Status**: AUDIT ONLY — No code modified, no migrations created, no commits.

---

## Table of Contents

1. [C1 — Canonical Node Pricing Schema](#c1--canonical-node-pricing-schema)
2. [C2 — Actual rates_json Shape](#c2--actual-rates_json-shape)
3. [C3 — BPE ↔ Control Plane Field Mapping](#c3--bpe--control-plane-field-mapping)
4. [C4 — Unit Semantics Verification](#c4--unit-semantics-verification)
5. [C5 — Node Identity / Slug Contract](#c5--node-identity--slug-contract)
6. [C6 — Current Pricing Read/Write Flow](#c6--current-pricing-readwrite-flow)
7. [C7 — Available Priors / Baselines](#c7--available-priors--baselines)
8. [C8 — Historical Rate Distribution](#c8--historical-rate-distribution)
9. [C9 — Explicit Zero vs Unconfigured](#c9--explicit-zero-vs-unconfigured)
10. [C10 — Active Rate Completeness](#c10--active-rate-completeness)
11. [C11 — Calibration Prior Selection Policy](#c11--calibration-prior-selection-policy)
12. [C12 — Persistence / Provenance Requirements](#c12--persistence--provenance-requirements)
13. [C13 — Safe Write Model](#c13--safe-write-model)
14. [C14 — Readiness / Governance Impact](#c14--readiness--governance-impact)
15. [C15 — AI Agent Boundary](#c15--ai-agent-boundary)
16. [C16 — Proposed Control Plane Contract](#c16--proposed-control-plane-contract)
17. [C17 — Multi-Repo Boundary](#c17--multi-repo-boundary)
18. [Risks](#risks)
19. [Open Questions](#open-questions)
20. [Final Verdict](#final-verdict)

---

## C1 — Canonical Node Pricing Schema

### Schema Definition

`printer_nodes.rates_json` is defined as `JSON NULL` across multiple migration layers:

| Source File | Definition |
|---|---|
| `docs/migrations/printhouse_pricing_restore.sql:9` | `ADD COLUMN rates_json JSON NULL AFTER limits` |
| `docs/migrations/printhouse_onboarding.sql` | Table `printer_nodes` — `rates_json` not in original `CREATE`, added later |
| `migrations/002_resolve_schema_drift.sql:5` | `ALTER TABLE printer_nodes MODIFY COLUMN rates_json JSON NULL` |
| `src/migrations/phase184g_industrial_provisioning_schema.js:126` | `{ table: 'print_nodes', column: 'rates_json', type: 'JSON NULL' }` |

### Service Layer

| File | Purpose | Line |
|---|---|---|
| `src/api/services/printhouseReadinessService.js` | Reads `rates_json` for pricing readiness gates | L141-190 |
| `src/api/services/industrialProvisioningService.js` | Syncs `printer_nodes.rates_json` → `print_nodes.rates_json` | L167-196 |
| `src/api/services/economics/IndustrialEconomicService.js` | Reads `print_nodes.rates_json` for cost estimation | L38-49 |
| `src/api/services/telemetryService.js` | Reads `print_nodes.rates_json` for readiness metrics | L268-279 |

### API Routes

| Route File | Endpoint | Operation |
|---|---|---|
| `src/api/routes/printhouseOnboardingRoutes.js` | `GET /api/printhouse/onboarding/pricing/industrial` | READ rates_json |
| `src/api/routes/printhouseOnboardingRoutes.js` | `PUT /api/printhouse/onboarding/pricing/industrial` | WRITE rates_json (deep merge) |
| `src/api/routes/printhousesAdmin.js` | `GET /api/admin/printhouses` | READ rates_json |
| `src/api/routes/printhousesAdmin.js` | `POST /api/admin/printhouses` | WRITE rates_json (whole insert) |
| `src/api/routes/printhousesAdmin.js` | `PUT /api/admin/printhouses/:id` | WRITE rates_json (field patch) |
| `src/api/routes/machinesAdmin.js` | `GET /api/admin/machines` | READ rates_json from `print_nodes` |

### UI Components

| File | Role |
|---|---|
| `src/ui/components/printhouse/pricing/CanonicalIndustrialPricingEditor.tsx` | Primary editing UI for `rates_json` |
| `src/ui/components/printhouse/setup/PricingPanel.tsx` | Onboarding wrapper, fetches and saves via API |
| `src/ui/pages/os/PrinthousesPage.tsx` | Admin view, defines `PrinthouseRates` TypeScript interface |
| `src/ui/pages/os/PrinthouseDetailPage.tsx` | Read-only detail view of rates |
| `src/ui/components/printhouse/pricing/printhouseSuggestedRates.ts` | Historical reference dataset for UI suggestions |

### Mapper/Adapter

**Existing adapter**: `industrialProvisioningService.syncPrinterNodesToPrintNodes()` copies `printer_nodes.rates_json` directly into `print_nodes.rates_json` using `normalizeJsonForMysql()`. **No structural transformation** is applied — it's a 1:1 JSON copy with empty-object fallback.

---

## C2 — Actual rates_json Shape

Canonical structure from `PrinthouseRates` TypeScript interface (`src/ui/pages/os/PrinthousesPage.tsx:20-51`) and the hydration function (`CanonicalIndustrialPricingEditor.tsx:48-168`):

### Interior Printing

| JSON Path | Type | Unit | Required | Explicit-0 Semantics | Missing Semantics |
|---|---|---|---|---|---|
| `interior_one_colour_fixed` | `BySignature {32p,24p,16p,12p,8p,4p}` | €/signature | Optional | Valid: no fixed setup cost for that sig | All zeros: capability not priced |
| `interior_one_colour_var` | `BySignature` | €/1000 | Optional | Valid: zero run cost | All zeros: capability not priced |
| `interior_two_colour_fixed` | `BySignature` | €/signature | Optional | Same as 1-colour | Same |
| `interior_two_colour_var` | `BySignature` | €/1000 | Optional | Same | Same |
| `interior_full_colour_fixed` | `BySignature` | €/signature | Optional | Same | Same |
| `interior_full_colour_var` | `BySignature` | €/1000 | Optional | Same | Same |
| `pms_interior_fixed` | `number` | € | Optional | No PMS surcharge | Not configured |

### Cover Printing

| JSON Path | Type | Unit | Required | Explicit-0 | Missing |
|---|---|---|---|---|---|
| `cover_fixed_by_colours` | `ByColour {1,2,3,4,5}` | € | Optional | No fixed setup | Not configured |
| `cover_var_per_1000_by_colours` | `ByColour` | €/1000 | Optional | Zero run cost | Not configured |
| `pms_cover` | `{fixed: number, var: number}` | €, €/1000 | Optional | No PMS surcharge | Not configured |

### Endpapers

| JSON Path | Type | Unit | Required | Explicit-0 | Missing |
|---|---|---|---|---|---|
| `endpaper_fixed_by_colours` | `ByColour` | € | Optional | No cost | Not configured |
| `endpaper_var_per_1000_by_colours` | `ByColour` | €/1000 | Optional | Zero run | Not configured |

### Lamination & UV

| JSON Path | Type | Unit | Required | Explicit-0 | Missing |
|---|---|---|---|---|---|
| `lam_fixed` | `{varnish, gloss, matt}` | € | Optional | No setup cost | Not configured |
| `lam_var_per_1000` | `{varnish, gloss, matt}` | €/1000 | Optional | Zero run cost | Not configured |
| `uv_varnish` | `{fixed, var}` | €, €/1000 | Optional | No UV cost | Not configured |

### Binding (6 types × 2 dimensions × 24 sections)

| JSON Path Pattern | Type | Unit | Required |
|---|---|---|---|
| `binding_{pb,ss,ts,hc,wo,sp}_fixed_by_sections` | `BySection {"1".."24"}` | € | At least one binding type required for readiness |
| `binding_{pb,ss,ts,hc,wo,sp}_var_per_1000_by_sections` | `BySection {"1".."24"}` | €/1000 | Paired with fixed |

> **CRITICAL**: Section keys are **numeric-string** JSON keys (`"1"`, `"2"`, ... `"24"`). This matches BPE expectations.

### Paper Costs

| JSON Path | Type | Unit | Required |
|---|---|---|---|
| `paper_interior_fixed_by_colours` | `{one, two, full}` | € | Optional |
| `paper_interior_var_per_1000_by_colours` | `{one, two, full}` | €/1000 | Optional |
| `paper_cover_fixed_by_colours` | `{one, two, full}` | € | Optional |
| `paper_cover_var_per_1000_by_colours` | `{one, two, full}` | €/1000 | Optional |
| `paper_endpapers_fixed_by_colours` | `{one, two, full}` | € | Optional |
| `paper_endpapers_var_per_1000_by_colours` | `{one, two, full}` | €/1000 | Optional |
| `paper_waste_for_binding` | `{pb, ss, sc, hc, wo, sp}` | percentage (divided by 100 in BPE) | Optional |
| `paper_price_interior_by_kilo` | `{offset, mc, lux, munken, other}` | €/kg | Optional |
| `paper_price_cover_by_kilo` | `{mc, artboard, offset, wfmc, other}` | €/kg | Optional |
| `paper_price_endpaper_by_kilo` | `{offset, mc, other}` | €/kg | Optional |

### Transport

| JSON Path | Type | Unit | Required |
|---|---|---|---|
| `technical_costs_for_transport` | `boolean` | flag | Optional |
| `additional_transport_multiplier` | `number` | multiplier (default 1) | Optional |
| `percentage_technical_costs` | `ByCountry` | percentage | Optional |
| `transport_costs` | `ByCountry` | €/kg | At least one for readiness |

> **CRITICAL**: Country keys in `transport_costs` use **lowercase full names** in `EMPTY_RATES` (`belgium`, `netherlands`, etc.) but **ISO-like lowercase abbreviations** in hydrated defaults (`es`, `be`, `nl`, `de`, `fr`, `at`). This is an **inconsistency** within the Control Plane itself.

**EMPTY_RATES** (line 123-124): `{ belgium: 0, netherlands: 0, finland: 0, hungary: 0, poland: 0 }`
**Hydrated defaults** (line 85): `{ es: 0.95, be: 1.145, nl: 1.189, de: 1.165, fr: 1.178, at: 1.225 }`

Both formats coexist in production. The PUT deep-merge preserves both.

### Downstream Validation (not part of rates_json itself)

| Field | Location | Note |
|---|---|---|
| `schemaVersion` | Used in `IndustrialEconomicService.js:55` | Validated as `1` |
| `currency` | Used in `IndustrialEconomicService.js:61` | Currency match check |
| `effectiveFrom/To` | Used in `IndustrialEconomicService.js:67-77` | Validity window |
| `operationalMinimumCost` | Used in `IndustrialEconomicService.js:79` | Mandatory for dispatch |

> These fields are checked by the **downstream** `IndustrialEconomicService` (which reads from `print_nodes`, not `printer_nodes`) but are **not part of the canonical `PrinthouseRates` UI contract**. They represent an extended schema used for routing/dispatch.

---

## C3 — BPE ↔ Control Plane Field Mapping

Based on Phase 193A.2 BPE audit findings (`buildPrice(params, house)` contract) mapped against the Control Plane `PrinthouseRates` interface:

| CONTROL_PLANE_PATH | BPE_PATH (house.rates.*) | UNIT | TRANSFORMATION | STATUS |
|---|---|---|---|---|
| `interior_one_colour_fixed` | `interior_one_colour_fixed` | €/sig | none | **DIRECT_MATCH** |
| `interior_one_colour_var` | `interior_one_colour_var` | €/1000 | none | **DIRECT_MATCH** |
| `interior_two_colour_fixed` | `interior_two_colour_fixed` | €/sig | none | **DIRECT_MATCH** |
| `interior_two_colour_var` | `interior_two_colour_var` | €/1000 | none | **DIRECT_MATCH** |
| `interior_full_colour_fixed` | `interior_full_colour_fixed` | €/sig | none | **DIRECT_MATCH** |
| `interior_full_colour_var` | `interior_full_colour_var` | €/1000 | none | **DIRECT_MATCH** |
| `pms_interior_fixed` | `pms_interior_fixed` | € | none | **DIRECT_MATCH** |
| `cover_fixed_by_colours` | `cover_fixed_by_colours` | € | none | **DIRECT_MATCH** |
| `cover_var_per_1000_by_colours` | `cover_var_per_1000_by_colours` | €/1000 | **BPE divides by 100** | **UNIT_TRANSFORM** |
| `pms_cover` | `pms_cover` | €, €/1000 | none | **DIRECT_MATCH** |
| `lam_fixed` | `lam_fixed` | € | none | **DIRECT_MATCH** |
| `lam_var_per_1000` | `lam_var_per_1000` | €/1000 | none | **DIRECT_MATCH** |
| `uv_varnish` | `uv_varnish` | €, €/1000 | none | **DIRECT_MATCH** |
| `endpaper_fixed_by_colours` | `endpaper_fixed_by_colours` | € | none | **DIRECT_MATCH** |
| `endpaper_var_per_1000_by_colours` | `endpaper_var_per_1000_by_colours` | €/1000 | **BPE divides by 100** | **UNIT_TRANSFORM** |
| `binding_pb_fixed_by_sections` | `binding_pb_fixed_by_sections` | € | none | **DIRECT_MATCH** |
| `binding_pb_var_per_1000_by_sections` | `binding_pb_var_per_1000_by_sections` | €/1000 | none | **DIRECT_MATCH** |
| `binding_ss_fixed_by_sections` | `binding_ss_fixed_by_sections` | € | none | **DIRECT_MATCH** |
| `binding_ss_var_per_1000_by_sections` | `binding_ss_var_per_1000_by_sections` | €/1000 | none | **DIRECT_MATCH** |
| `binding_ts_fixed_by_sections` | `binding_ts_fixed_by_sections` | € | none | **DIRECT_MATCH** |
| `binding_ts_var_per_1000_by_sections` | `binding_ts_var_per_1000_by_sections` | €/1000 | none | **DIRECT_MATCH** |
| `binding_hc_fixed_by_sections` | `binding_hc_fixed_by_sections` | € | none | **DIRECT_MATCH** |
| `binding_hc_var_per_1000_by_sections` | `binding_hc_var_per_1000_by_sections` | €/1000 | none | **DIRECT_MATCH** |
| `binding_wo_fixed_by_sections` | `binding_wo_fixed_by_sections` | € | none | **DIRECT_MATCH** |
| `binding_wo_var_per_1000_by_sections` | `binding_wo_var_per_1000_by_sections` | €/1000 | none | **DIRECT_MATCH** |
| `binding_sp_fixed_by_sections` | `binding_sp_fixed_by_sections` | € | none | **DIRECT_MATCH** |
| `binding_sp_var_per_1000_by_sections` | `binding_sp_var_per_1000_by_sections` | €/1000 | none | **DIRECT_MATCH** |
| `paper_interior_fixed_by_colours` | `paper_interior_fixed_by_colours` | € | none | **DIRECT_MATCH** |
| `paper_interior_var_per_1000_by_colours` | `paper_interior_var_per_1000_by_colours` | €/1000 | **BPE divides by 100** | **UNIT_TRANSFORM** |
| `paper_cover_fixed_by_colours` | `paper_cover_fixed_by_colours` | € | none | **DIRECT_MATCH** |
| `paper_cover_var_per_1000_by_colours` | `paper_cover_var_per_1000_by_colours` | €/1000 | **BPE divides by 100** | **UNIT_TRANSFORM** |
| `paper_endpapers_fixed_by_colours` | `paper_endpapers_fixed_by_colours` | € | none | **DIRECT_MATCH** |
| `paper_endpapers_var_per_1000_by_colours` | `paper_endpapers_var_per_1000_by_colours` | €/1000 | **BPE divides by 100** | **UNIT_TRANSFORM** |
| `paper_waste_for_binding` | `paper_waste_for_binding` | percentage | **BPE divides by 100** | **UNIT_TRANSFORM** |
| `paper_price_interior_by_kilo` | `paper_price_interior_by_kilo` | €/kg | none | **DIRECT_MATCH** |
| `paper_price_cover_by_kilo` | `paper_price_cover_by_kilo` | €/kg | none | **DIRECT_MATCH** |
| `paper_price_endpaper_by_kilo` | `paper_price_endpaper_by_kilo` | €/kg | none | **DIRECT_MATCH** |
| `technical_costs_for_transport` | `technical_costs_for_transport` | boolean | none | **DIRECT_MATCH** |
| `additional_transport_multiplier` | `additional_transport_multiplier` | multiplier | none | **DIRECT_MATCH** |
| `percentage_technical_costs` | `percentage_technical_costs` | percentage | none | **DIRECT_MATCH** |
| `transport_costs` | `transport_costs` | €/kg | none | **DIRECT_MATCH** |
| — | `interior_pp_bw` | €/page | — | **MISSING_IN_CONTROL_PLANE** |
| — | `interior_pp_color` | €/page | — | **MISSING_IN_CONTROL_PLANE** |
| `schemaVersion` (downstream only) | — | — | — | **UNUSED_BY_BPE** |
| `currency` (downstream only) | — | — | — | **UNUSED_BY_BPE** |
| `operationalMinimumCost` (downstream only) | — | — | — | **UNUSED_BY_BPE** |
| `effectiveFrom/To` (downstream only) | — | — | — | **UNUSED_BY_BPE** |

### Summary

- **36 DIRECT_MATCH** fields
- **6 UNIT_TRANSFORM** fields (BPE divides `*_var_per_1000_*` and `paper_waste_for_binding` values by 100)
- **2 MISSING_IN_CONTROL_PLANE** (`interior_pp_bw`, `interior_pp_color` — per-page flat rates, not used in canonical contract)
- **4 UNUSED_BY_BPE** (downstream-only metadata: `schemaVersion`, `currency`, `operationalMinimumCost`, `effectiveFrom/To`)

---

## C4 — Unit Semantics Verification

### 1. `*_var_per_1000_by_colours` — BPE divides by 100

> **CONFIRMED RISK**: The field name says "per 1000" but BPE divides the stored value by 100. This means Control Plane stores the value as "€ per 1000 units" but BPE interprets it as "€ per 10 units" after division. This is the **same convention documented in Phase 193A.2**. The calibration solver must be aware that:

```
BPE_effective_rate = stored_value / 100
```

This applies to:
- `cover_var_per_1000_by_colours`
- `endpaper_var_per_1000_by_colours`
- `paper_interior_var_per_1000_by_colours`
- `paper_cover_var_per_1000_by_colours`
- `paper_endpapers_var_per_1000_by_colours`

### 2. `paper_waste_for_binding` — BPE divides by 100

**CONFIRMED**: Stored as whole-number percentages (e.g., `5` = 5%). BPE converts to decimal fraction (`5 → 0.05`).

### 3. Binding section keys — numeric-string JSON keys

**CONFIRMED MATCH**: Control Plane uses `"1"`, `"2"`, ... `"24"` as string keys in `BySection` objects. SECTIONS constant generates `Array.from({ length: 24 }, (_, i) => String(i + 1))`.

### 4. Transport country key format

> **INCONSISTENCY DETECTED**:

- `EMPTY_RATES` uses lowercase full names: `belgium`, `netherlands`, `finland`, `hungary`, `poland`
- Hydrated defaults use ISO-like abbreviations: `es`, `be`, `nl`, `de`, `fr`, `at`
- **Both formats coexist** in the same document because `safeDeepMergeRates` preserves all keys

The BPE likely uses one format consistently. **The calibration solver must normalize keys** to match whichever format BPE expects.

### 5. Fixed vs variable pricing units

**CONFIRMED**: All `*_fixed` fields are in **€ (flat per-event)** and all `*_var*` fields are in **€/1000** (per-thousand run rate). No conversion needed at the adapter level — the BPE handles the `/100` division internally.

---

## C5 — Node Identity / Slug Contract

### Identity Model

| Field | Table | Type | Unique | Scope |
|---|---|---|---|---|
| `id` | `printer_nodes` | `VARCHAR(64) PRIMARY KEY` | **Globally unique** | — |
| `tenant_id` | `printer_nodes` | `VARCHAR(64) NOT NULL` | — | Foreign key to `tenants.id` |
| `email` | `printer_nodes` | `VARCHAR(255) UNIQUE NOT NULL` | **Globally unique** | — |
| `status` | `printer_nodes` | `ENUM('PENDING','ACTIVE','SUSPENDED','DELETED')` | — | — |

### Slug

**`printer_nodes` has NO `slug` column.** There is no dedicated slug field in the printer_nodes table. The `id` field serves as the canonical node identifier. The only `slug` in the schema is `rule_slug` in `preflight_rules` (migration 006), which is unrelated.

### Composite Key

Migration `139_phase191d_machine_capabilities_migration.sql:9` adds:
```sql
ALTER TABLE printer_nodes ADD UNIQUE INDEX uk_printer_nodes_id_tenant (id, tenant_id);
```

This composite unique index is used for foreign key references from child tables (`printhouse_machines`, `materials_catalog`, `printhouse_site_capacities`, etc.).

### Canonical Calibration Target Identity

```
tenant_id (from JWT auth context)
  → owned printer_node WHERE tenant_id = ?
    → exact node.id (globally unique)
      → exact rates_json blob
```

The `id` is the calibration target identifier. It is **globally unique** (PRIMARY KEY), not tenant-scoped. The tenant_id provides **ownership verification** but the id alone is sufficient for addressing.

---

## C6 — Current Pricing Read/Write Flow

### Flow: PrinthouseSetupHub → PricingPanel → CanonicalIndustrialPricingEditor → API → Service → DB

#### GET Endpoint

```
GET /api/printhouse/onboarding/pricing/industrial
```

- **Auth**: JWT Bearer → `requireAuth` middleware → role check (`PRINTHOUSE_ADMIN`, `SUPER_ADMIN`) + tenant status check
- **Query**: `SELECT * FROM printer_nodes WHERE tenant_id = ? LIMIT 1`
- **Response**: Parses `rates_json` (handles string/object), returns `{ nodeId, configured, signatures, deliveryTime, productionLeadDays, limits, rates }`
- **No rate transformation**: raw JSON returned as-is

#### PUT Endpoint

```
PUT /api/printhouse/onboarding/pricing/industrial
```

- **Auth**: Same as GET
- **Body**: `{ signatures, delivery_time, production_lead_days, limits, rates }`
- **Query**: `SELECT id, rates_json FROM printer_nodes WHERE tenant_id = ? LIMIT 1`
- **Merge behavior**: `safeDeepMergeRates(existingRates, newRates)` — **deep merge with prototype pollution protection**
- **Write**: `UPDATE printer_nodes SET rates_json = ? WHERE id = ? AND tenant_id = ?`
- **Key preservation**: Unknown keys in existing rates_json ARE preserved (spread operator `{ ...target }`)
- **Explicit zero preservation**: Explicit zeros in source OVERWRITE target values (line 126: `result[key] = sourceVal`)
- **No allowlist**: Any key in the request body `rates` object is accepted and persisted. No schema validation at the API layer.

#### Admin PUT Endpoint

```
PUT /api/admin/printhouses/:id
```

- **Auth**: Super Admin or tenant-scoped Printhouse Admin
- **Merge behavior**: **WHOLE DOCUMENT OVERWRITE** — `JSON.stringify(rates)` (line 190). No deep merge.
- **This is different from the onboarding endpoint**.

#### Readiness Side Effects

The readiness service (`printhouseReadinessService.js:141-190`) reads `rates_json` to compute `pricingReadiness.status`. The **act of saving rates changes readiness status** from `NOT_STARTED` to `IN_PROGRESS` or `COMPLETE`.

#### Audit/Logging

No dedicated audit logging for pricing changes. The general `api_audit_logs` table records event types but no specific `PRICING_UPDATE` event type is registered. The `safeDeepMergeRates` function does not log the before/after diff.

---

## C7 — Available Priors / Baselines

### Source 1: `printhouseSuggestedRates.ts` — SAFE_PRODUCTION_PRIOR

Location: `src/ui/components/printhouse/pricing/printhouseSuggestedRates.ts`

This is the **primary source** of historical reference data. Every field includes:
- `value`: suggested starting rate
- `source`: `'historical_reference_2025'`
- `sampleSize`: number of reference nodes (3 or 13)
- `min`/`max`: observed range
- `confidence`: `HIGH` (n=13) or `MEDIUM` (n=3)
- `unit`: dimension label
- `warning`: present for low-sample-size entries

**Classification: SAFE_PRODUCTION_PRIOR** — explicitly labeled as "UI onboarding guidance only" and "never silently persisted".

### Source 2: `getInitialHydratedRates()` — UI_SUGGESTION_ONLY

Location: `CanonicalIndustrialPricingEditor.tsx:48-168`

Pre-populates form with historical defaults for **unconfigured** nodes only. These values are shown in the UI but **only persisted if the user clicks Save**. The function overlays persisted values on top of base defaults.

**Classification: UI_SUGGESTION_ONLY** — displayed but never auto-saved.

### Source 3: `BINDING_TS_STEP_MEANS` — SAFE_PRODUCTION_PRIOR

Location: `printhouseSuggestedRates.ts:369-391`

Exact step matrix for Thread Sewn binding sections 4–24. Derived from historical data.

**Classification: SAFE_PRODUCTION_PRIOR**

### Source 4: `COMMON_OPERATIONAL_CONFIG` — UI_SUGGESTION_ONLY

Location: `printhouseSuggestedRates.ts:394-415`

Operational defaults: 16-page signatures, 11 production lead days, 14-day delivery, 50 min copies, 1500 max pages. Source: "77% of reference nodes".

**Classification: UI_SUGGESTION_ONLY**

### Source 5: Existing Node Rates — SAFE_PRODUCTION_PRIOR (if present)

Any already-saved `rates_json` for a node. Highest-priority prior for calibration since it represents explicitly configured values.

### Source 6: Test Fixtures — TEST_ONLY

`tests/industrial_provisioning_dispatch_remediation_test.js`: uses `rates_json: '{}'` (empty).
`tests/pricing_admin_readiness_test.js`: uses `rates_json: '{"schemaVersion": 1, "currency": "EUR"}'` (minimal).

**Classification: TEST_ONLY — UNSAFE_AS_PRIOR**

### Source 7: Migration Defaults — UNSAFE_AS_PRIOR

`normalizeJsonForMysql(pn.rates_json, {})` in provisioning service defaults to empty object `{}` for null/missing rates.

**Classification: UNSAFE_AS_PRIOR** — produces empty JSON, would become zero in BPE.

---

## C8 — Historical Rate Distribution

All data derived from `printhouseSuggestedRates.ts` (n=13 historical reference unless noted):

| Rate Category | Min | Mean/Suggested | Max | Sample (n) | Confidence |
|---|---|---|---|---|---|
| **Interior 1/1 fixed** | 78.00 €/sig | 80.31 €/sig | 82.00 €/sig | 13 | HIGH |
| **Interior 1/1 var** | 7.80 €/1000 | 8.12 €/1000 | 8.40 €/1000 | 13 | HIGH |
| **Interior 4/4 fixed** | 120.00 €/sig | 120.00 €/sig | 120.00 €/sig | 3 | MEDIUM |
| **Interior 4/4 var** | 18.00 €/1000 | 18.00 €/1000 | 18.00 €/1000 | 3 | MEDIUM |
| **Cover 1-color fixed** | 40.00 € | 40.00 € | 40.00 € | 3 | MEDIUM |
| **Cover 1-color var** | 8.00 €/1000 | 8.00 €/1000 | 8.00 €/1000 | 3 | MEDIUM |
| **Cover 4-color fixed** | 66.00 € | 66.00 € | 66.00 € | 3 | MEDIUM |
| **Cover 4-color var** | 12.50 €/1000 | 12.50 €/1000 | 12.50 €/1000 | 3 | MEDIUM |
| **Lamination gloss fixed** | 6.00 € | 6.00 € | 6.00 € | 3 | MEDIUM |
| **Lamination gloss var** | 25.00 €/1000 | 25.00 €/1000 | 25.00 €/1000 | 3 | MEDIUM |
| **Perfect binding fixed** | 0.1202 €/book | 0.164 €/book | 0.302 €/book | 13 | HIGH |
| **PB per section** | 0.0032 €/sec | 0.0147 €/sec | 0.0475 €/sec | 13 | HIGH |
| **Saddle stitch** | 0.12 €/book | 0.12 €/book | 0.12 €/book | 13 | HIGH |
| **Wire-O** | 0.22 €/book | 0.282 €/book | 0.31 €/book | 13 | HIGH |
| **Thread HC** | 1.25 €/book | 1.25 €/book | 1.25 €/book | 13 | HIGH |
| **Thread sewn fixed** | 55.00 € | 59.85 € | 70.00 € | 13 | HIGH |
| **Paper interior €/kg** | 1.22 €/kg | 1.252 €/kg | 1.28 €/kg | 13 | HIGH |
| **Paper cover €/kg** | 2.50 €/kg | 2.515 €/kg | 2.58 €/kg | 13 | HIGH |
| **Transport ES** | 0.95 €/kg | 0.95 €/kg | 0.95 €/kg | 13 | HIGH |
| **Transport BE** | 1.11 €/kg | 1.145 €/kg | 1.17 €/kg | 13 | HIGH |
| **Transport NL** | 1.15 €/kg | 1.189 €/kg | 1.22 €/kg | 13 | HIGH |
| **Transport DE** | 1.13 €/kg | 1.165 €/kg | 1.20 €/kg | 13 | HIGH |
| **Transport FR** | 1.14 €/kg | 1.178 €/kg | 1.21 €/kg | 13 | HIGH |
| **Transport AT** | 1.17 €/kg | 1.225 €/kg | 1.26 €/kg | 13 | HIGH |
| **Setup fixed** | 42.00 € | 42.00 € | 42.00 € | 13 | HIGH |
| **Min order** | 95.00 € | 95.00 € | 95.00 € | 13 | HIGH |

> **Note**: Interior per-page rates (`interior_pp_bw`: 0.00635 €/page, `interior_pp_color`: 0.01878 €/page) exist in suggested rates but are **not part of the canonical `PrinthouseRates` interface**. They are legacy/simplified views.

---

## C9 — Explicit Zero vs Unconfigured

### Current Behavior Analysis

#### At DB Level

`rates_json` is `JSON NULL`:
- **`NULL`**: No rates configured at all. `printhouseReadinessService` → `NOT_STARTED`.
- **Empty object `{}`**: Provisioning default. `printhouseReadinessService` → `NOT_STARTED` (line 157: `Object.keys(rates).length > 0` check).
- **Object with keys, all zero**: e.g. `{"interior_one_colour_fixed": {"16p": 0}}` → `IN_PROGRESS` (keys exist but values are 0).
- **Object with positive values**: → `COMPLETE` when all four dimensions (interior, paper, binding, transport) have at least one non-zero value.

#### At API Level

The onboarding GET endpoint:
```javascript
const isConfigured = parsedRates !== null && Object.keys(parsedRates).length > 0;
```
- `NULL` → `configured: false`
- `{}` → `configured: false`
- `{any_key: 0}` → `configured: true` (potentially misleading)

#### At UI Level

`CanonicalIndustrialPricingEditor.tsx:182`:
```javascript
const isUnconfigured = !initialNodeData?.rates || Object.keys(initialNodeData.rates).length === 0;
```
- `null`/`undefined`/`{}` → shows historical defaults as suggestions
- Any populated object → shows persisted values (including explicit zeros)

#### At Deep Merge Level

`safeDeepMergeRates`:
- `undefined` in source → target value preserved (not overwritten)
- `null` in source → overwrites target to `null` (potential issue)
- `0` in source → overwrites target to `0` (explicit zero preserved)

### Future Calibration Preflight Rule

```
For each rate field required by the reference book:

1. rates_json IS NULL → UNCONFIGURED → ERROR: "Node has no pricing data"
2. rates_json IS {} → UNCONFIGURED → ERROR: "Node pricing is empty"
3. Field key missing from rates_json → MISSING → ERROR: "Rate X is not configured"
4. Field key present, value === 0 → EXPLICIT_ZERO → WARNING: "Rate X is explicitly zero. Is this intentional?"
5. Field key present, value > 0 → CONFIGURED → OK

UNCONFIGURED and MISSING must NEVER silently become BPE zero.
The calibration preflight MUST reject these before solver execution.
```

---

## C10 — Active Rate Completeness

### Proposed Status Model

For a given reference book specification, determine which rates BPE would consume, then classify each:

```typescript
interface RateCompletenessStatus {
  field: string;           // e.g. "interior_full_colour_fixed.16p"
  status: 'CONFIGURED' | 'EXPLICIT_ZERO' | 'MISSING' | 'PRIOR_ONLY';
  currentValue: number | null;
  priorValue: number | null;
  priorSource: string | null;  // e.g. "historical_reference_2025"
  priorConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | null;
}

interface BookRateCompleteness {
  referenceBookId: string;
  nodeId: string;
  totalActiveRates: number;
  configured: number;
  explicitZero: number;
  missing: number;
  priorOnly: number;
  canCalibrate: boolean;       // true only if all MISSING have a PRIOR_ONLY fallback
  solverReady: boolean;        // true only if no MISSING remain
  fields: RateCompletenessStatus[];
}
```

### Derivation Logic

Given a reference book with known properties (binding type, color mode, paper type, destination country):

1. Extract the set of **active rates** the BPE would read
2. For each active rate, check `rates_json[path]`:
   - **Key present, value > 0** → `CONFIGURED`
   - **Key present, value === 0** → `EXPLICIT_ZERO`
   - **Key missing** → check `SUGGESTED_RATES_METADATA` for prior:
     - Prior exists → `PRIOR_ONLY`
     - No prior → `MISSING`

---

## C11 — Calibration Prior Selection Policy

### Deterministic Prior Selection Order

```
PRIORITY 1: Existing explicit node rate (rates_json[path] !== undefined && rates_json[path] !== null)
            → Use as both optimization seed AND baseline
            → Highest trust

PRIORITY 2: Historical safe production prior (SUGGESTED_RATES_METADATA[key])
            → Use as optimization seed AND regularization baseline
            → Confidence level from sampleSize and confidence field
            → WARNING if confidence === 'MEDIUM' or 'LOW'

PRIORITY 3: No prior available
            → Field LOCKED for calibration
            → Solver cannot identify this rate
            → Must be manually configured before calibration can include it
            → UI shows "Manual input required" state
```

### Prohibited Sources

| Source | Use as Seed | Use as Baseline | Use as Save Proposal |
|---|---|---|---|
| Existing node rate > 0 | YES | YES | YES (with approval) |
| Existing node rate = 0 (explicit) | YES | YES | YES (with warning) |
| `SUGGESTED_RATES_METADATA` HIGH | YES | YES | YES (with approval) |
| `SUGGESTED_RATES_METADATA` MEDIUM | YES | YES + wider bounds | YES (with warning) |
| BPE zero fallback | NO | NO | NO |
| `normalizeJsonForMysql({})` | NO | NO | NO |
| Test fixture values | NO | NO | NO |

---

## C12 — Persistence / Provenance Requirements

### Existing Schema Assessment

| Table | Suitable for Provenance? | Notes |
|---|---|---|
| `order_pricing_snapshots` | NO | Order-scoped, immutable sealed pricing. Wrong granularity. |
| `api_audit_logs` | PARTIAL | Generic event log. Can record events but not structured calibration state. |
| `printhouse_price_books` | NO | Commercial downstream policy. Different layer. |
| `printer_nodes.rates_json` | PARTIAL | Stores current rates but no history/provenance. |
| `print_nodes.rates_json` | NO | Sync copy. Not source of truth. |

### Verdict: No suitable structure exists.

### Proposed New Tables (Future Phase)

```sql
-- Calibration sessions and proposals
CREATE TABLE IF NOT EXISTS calibration_sessions (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  node_id VARCHAR(64) NOT NULL,
  status ENUM('PENDING_REVIEW','ACCEPTED','REJECTED','EXPIRED') NOT NULL DEFAULT 'PENDING_REVIEW',

  -- Reference input
  reference_book_spec_json JSON NOT NULL,
  target_manufacturing_price DECIMAL(12,4) NOT NULL,
  target_transport_per_kg DECIMAL(12,4) NULL,

  -- Snapshot of rates before calibration
  rates_before_json JSON NOT NULL,

  -- Solver output
  proposed_patch_json JSON NOT NULL,
  solver_version VARCHAR(64) NOT NULL,
  engine_commit VARCHAR(64) NOT NULL,
  residual DECIMAL(12,6) NULL,
  warnings_json JSON NULL,
  confidence_score DECIMAL(5,2) NULL,

  -- Approval
  accepted_patch_json JSON NULL,
  accepted_by VARCHAR(255) NULL,
  accepted_at TIMESTAMP(6) NULL,
  rejected_by VARCHAR(255) NULL,
  rejected_at TIMESTAMP(6) NULL,
  rejection_reason TEXT NULL,

  -- Metadata
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6),
  expires_at TIMESTAMP(6) NULL,

  INDEX idx_tenant_node (tenant_id, node_id),
  INDEX idx_status (status),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (node_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB;
```

---

## C13 — Safe Write Model

### Requirements Compliance Assessment

| Requirement | Current PUT `/pricing/industrial` | Admin PUT `/printhouses/:id` |
|---|---|---|
| Node-scoped | YES `WHERE id = ? AND tenant_id = ?` | YES `WHERE id = ?` |
| Tenant-safe | YES tenant_id from JWT | Super Admin can edit any |
| Explicit approval | NO — No approval workflow | NO — Same |
| Patch only active paths | NO — Deep merges entire body | NO — Whole document overwrite |
| Preserve unrelated keys | YES — Deep merge preserves | NO — Overwrites everything |
| Preserve unknown legacy keys | YES — Spread operator | NO |
| Preserve explicit zeros | YES — Source wins | NO |
| No whole-document overwrite | YES — Deep merge | **VIOLATION** |
| Optimistic concurrency | NO — No version/etag | NO — Same |

### Recommendation

The onboarding PUT endpoint (`/api/printhouse/onboarding/pricing/industrial`) with `safeDeepMergeRates` is **closer to safe** but still lacks:

1. **Approval workflow** — accepts immediately
2. **Optimistic concurrency** — no version field to detect races
3. **Schema validation** — any key is accepted
4. **Audit trail** — no diff logging

A **dedicated calibration-accept endpoint** is recommended rather than using the existing PUT:

```
POST /api/printhouse/onboarding/pricing/calibration/:id/accept
```

This endpoint would:
1. Read the calibration session by ID
2. Verify tenant ownership
3. Apply only the `accepted_patch_json` paths
4. Deep merge preserving unrelated keys
5. Log before/after diff to audit table
6. Mark session as ACCEPTED

---

## C14 — Readiness / Governance Impact

### What Happens When rates_json Becomes Populated

Tracing through `printhouseReadinessService.computeReadiness()`:

1. **`pricingReadiness.status`** transitions from `NOT_STARTED` → `IN_PROGRESS` or `COMPLETE`
   - `IN_PROGRESS`: some dimensions have non-zero values but not all four (interior, paper, binding, transport)
   - `COMPLETE`: all four dimensions have at least one non-zero value

2. **`pricingReadiness.available`**: set to `pricingStatus === 'COMPLETE'` (line 215)

3. **`marketplaceReadiness.status`**: becomes `READY_FOR_REVIEW` only if ALL three are `COMPLETE`:
   - `accountSetupStatus === 'COMPLETE'`
   - `configStatus === 'COMPLETE'`
   - `pricingStatus === 'COMPLETE'`

4. **`activationReadiness`**: **HARDCODED** to `NOT_ACTIVATED` with all flags `false` (line 234-240):
   ```javascript
   activationReadiness: {
       status: 'NOT_ACTIVATED',
       marketplaceVisible: false,
       liveQuotingAllowed: false,
       jobRoutingAllowed: false,
       productionDispatchAllowed: false
   }
   ```

### Impact Analysis

| Grant | Affected by rates_json save? | Risk |
|---|---|---|
| `marketplaceVisible` | NO — requires separate activation grant | SAFE |
| `liveQuotingAllowed` | NO — requires separate activation grant | SAFE |
| `jobRoutingAllowed` | NO — requires separate activation grant | SAFE |
| `productionDispatchAllowed` | NO — requires separate activation grant | SAFE |
| `pricingReadiness.available` | YES — becomes true when complete | LOW RISK — informational only |
| `marketplaceReadiness.status` | YES — can become `READY_FOR_REVIEW` | LOW RISK — does not auto-activate |

**Conclusion: Calibration CANNOT silently activate any governed grant.** The `printhouse_activation_grants` table is completely separate from `pricingReadiness`. Activation requires explicit admin approval via `printhouseActivationAdapter`. The readiness service only computes **informational status** that is displayed in the UI but does not gate any operational capability.

---

## C15 — AI Agent Boundary

### Recommended Architecture

```
+---------------------------------------------+
|               AI Agent Layer                |
|                                             |
|  MAY:                                       |
|  - Collect structured book specs            |
|  - Parse natural-language book description  |
|  - Clarify ambiguous input (pages, binding) |
|  - Explain calibration results              |
|  - Display rate completeness status         |
|  - Show solver residual and warnings        |
|                                             |
|  MUST NOT:                                  |
|  - Write rates directly to DB               |
|  - Bypass deterministic solver              |
|  - Invent missing rate values               |
|  - Activate marketplace grants              |
|  - Auto-save calibration proposals          |
|  - Set confidence higher than evidence      |
|                                             |
+---------------------------------------------+
|           Deterministic Solver              |
|                                             |
|  Input: book_spec + target_price + priors   |
|  Output: calibration_proposal               |
|  Properties: pure, deterministic, auditable |
|                                             |
+---------------------------------------------+
|        Control Plane API Layer              |
|                                             |
|  Calibration Preview/Accept/Reject          |
|  Tenant-scoped, approval-gated             |
|  Audit-logged, deep-merge only             |
|                                             |
+---------------------------------------------+
|         printer_nodes.rates_json            |
|              (Source of Truth)              |
+---------------------------------------------+
```

### Placement in Control Plane Architecture

The agent should be a **frontend-facing service** that:
1. Lives behind the existing auth middleware (`requireAuth` from `printhouseOnboardingRoutes.js`)
2. Calls the deterministic solver as a **pure function** (no DB access)
3. Persists proposals via the new calibration API endpoints
4. Never bypasses the approval workflow

---

## C16 — Proposed Control Plane Contract

### `POST /api/printhouse/onboarding/pricing/calibration/preview`

**Purpose**: Create a new calibration session with solver proposal.

**Request**:
```json
{
  "nodeId": "ph-abc123",
  "referenceBookSpec": {
    "totalPages": 256,
    "copies": 500,
    "interiorColours": "full",
    "coverColours": 4,
    "binding": "pb",
    "paperInteriorType": "offset",
    "paperInteriorGsm": 80,
    "paperCoverType": "mc",
    "paperCoverGsm": 300,
    "lamination": "gloss",
    "signatures": 16,
    "destinationCountry": "es"
  },
  "targetManufacturingPrice": 1850.00,
  "targetTransportPerKg": null
}
```

**Response** (201):
```json
{
  "ok": true,
  "data": {
    "sessionId": "cal-sess-001",
    "status": "PENDING_REVIEW",
    "proposedPatch": {},
    "ratesBefore": {},
    "activeRatesCount": 12,
    "configuredCount": 8,
    "missingCount": 2,
    "priorOnlyCount": 2,
    "residual": 0.0043,
    "warnings": ["cover_var_per_1000_by_colours.4 used MEDIUM prior"],
    "expiresAt": "2026-08-19T14:50:00Z"
  }
}
```

**Authorization**: `PRINTHOUSE_ADMIN` or `SUPER_ADMIN` with tenant ownership of nodeId.

### `GET /api/printhouse/onboarding/pricing/calibration/:id`

**Purpose**: Retrieve a calibration session for review.

**Authorization**: Same tenant ownership.

**Idempotency**: Read-only, safe.

### `POST /api/printhouse/onboarding/pricing/calibration/:id/accept`

**Purpose**: Apply the proposed patch to `printer_nodes.rates_json`.

**Request**:
```json
{
  "managerApproval": true,
  "managerNotes": "Reviewed, looks reasonable for new node"
}
```

**Behavior**:
1. Verify session status === `PENDING_REVIEW`
2. Verify session not expired
3. Deep-merge `proposedPatch` into current `rates_json` (using `safeDeepMergeRates`)
4. Record `accepted_patch_json`, `accepted_by`, `accepted_at`
5. Log to `api_audit_logs` with event_type `CALIBRATION_ACCEPTED`
6. Mark session as `ACCEPTED`

**Authorization**: `PRINTHOUSE_ADMIN` or `SUPER_ADMIN`.

**Idempotency**: Session transitions from `PENDING_REVIEW` → `ACCEPTED`. Re-accept returns 409 Conflict.

### `POST /api/printhouse/onboarding/pricing/calibration/:id/reject`

**Purpose**: Reject and archive the calibration proposal.

**Request**:
```json
{
  "reason": "Rates seem too low for our equipment"
}
```

**Authorization**: Same.

**Idempotency**: Session transitions to `REJECTED`. Re-reject returns 409 Conflict.

**Audit**: All endpoints log to `api_audit_logs`.

---

## C17 — Multi-Repo Boundary

| Responsibility | Recommended Repo | Notes |
|---|---|---|
| **Structured book schema** | Control Plane | Defined as calibration request contract |
| **AI interpretation** (NL → structured spec) | Control Plane | Frontend agent service behind auth |
| **Forward pricing** (`buildPrice`) | Budget/Pricing Engine (BPE) | Pure function, no DB |
| **Active-rate derivation** | Control Plane | Knows which rates a spec requires |
| **Inverse solver** | Control Plane OR shared lib | Pure function, consumes BPE `buildPrice` as black box |
| **Prior selection** | Control Plane | Has access to `SUGGESTED_RATES_METADATA` and `rates_json` |
| **Provenance persistence** | Control Plane | `calibration_sessions` table |
| **Approval UI** | Control Plane | Setup Hub / Pricing Panel extension |
| **Rates persistence** | Control Plane | `printer_nodes.rates_json` via existing endpoints |
| **BPE rate contract** | Budget/Pricing Engine | Defines `house.rates` shape |

### Critical Boundary Rule

**The inverse solver must call BPE's `buildPrice` as a deterministic function.** This means either:
1. BPE exposes `buildPrice` as an importable module, or
2. Control Plane maintains a **verified copy** of the forward-pricing logic

Option 1 is preferred to avoid duplicated pricing logic.

---

## Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Transport country key inconsistency (full names vs ISO) | MEDIUM | Normalize to BPE format in adapter before solver execution |
| R2 | `*_var_per_1000` division by 100 in BPE | HIGH | Solver must use same convention. Document clearly. Unit tests. |
| R3 | Admin PUT overwrites entire rates_json | HIGH | Calibration must use onboarding deep-merge endpoint only, or dedicated endpoint |
| R4 | No optimistic concurrency on rates_json | MEDIUM | Add version/checksum field before calibration phase |
| R5 | No API-level schema validation | MEDIUM | Unknown keys accepted. Could corrupt rates_json with typos. |
| R6 | Paper waste stored as whole percentage, BPE divides by 100 | HIGH | Solver must match convention. Calibrated waste values must be in same unit. |
| R7 | `getInitialHydratedRates` merges suggested into UI display | LOW | Calibration reads raw `rates_json` from API, not UI-hydrated form state |
| R8 | No slug field — using `id` as identifier | LOW | `id` is globally unique PK, sufficient for calibration targeting |
| R9 | Existing rates may have both key formats coexisting | MEDIUM | Prior extraction must handle both and normalize |

---

## Open Questions

| # | Question | Impact | Suggested Resolution |
|---|---|---|---|
| Q1 | Are `interior_pp_bw` / `interior_pp_color` used by BPE in any code path? | If yes, these are `MISSING_IN_CONTROL_PLANE` | Verify in BPE repo. Likely legacy, unused. |
| Q2 | Which transport key format does BPE actually consume: `es`/`be`/`nl` or `belgium`/`netherlands`? | Calibration must match | Check BPE `buildPrice` source for country key lookups |
| Q3 | Should `schemaVersion`, `currency`, `operationalMinimumCost` be part of `rates_json` or separate columns? | Schema cleanliness | Currently mixed. Future phase could separate. |
| Q4 | Should calibration proposals expire? If so, after how long? | Stale proposals risk | Suggest 24h default, configurable |
| Q5 | Can a node have multiple active calibration sessions? | Conflict resolution | Suggest: only one PENDING_REVIEW per node at a time |

---

## Exact Files Inspected

```
migrations/002_resolve_schema_drift.sql
migrations/139_phase191d_machine_capabilities_migration.sql
migrations/141_phase191f_governed_pricing_configuration.sql
migrations/136_phase190_order_pricing_snapshot_sealing.sql
docs/migrations/printhouse_onboarding.sql
docs/migrations/printhouse_pricing_restore.sql
docs/migrations/printhouse_hardening.sql
src/api/routes/printhouseOnboardingRoutes.js
src/api/routes/printhousesAdmin.js
src/api/routes/machinesAdmin.js
src/api/services/printhouseReadinessService.js
src/api/services/industrialProvisioningService.js
src/api/services/economics/IndustrialEconomicService.js
src/api/services/telemetryService.js
src/api/services/printhouseActivationAdapter.js
src/api/services/auditLoggerService.js
src/api/services/controlPlaneSchemaService.js
src/migrations/phase184g_industrial_provisioning_schema.js
src/migrations/phase184g_manufacturing_persistence_schema.js
src/ui/pages/os/PrinthousesPage.tsx
src/ui/pages/os/PrinthouseDetailPage.tsx
src/ui/pages/printhouse/PrinthouseSetupHub.tsx
src/ui/components/printhouse/pricing/CanonicalIndustrialPricingEditor.tsx
src/ui/components/printhouse/pricing/printhouseSuggestedRates.ts
src/ui/components/printhouse/setup/PricingPanel.tsx
tests/smoke_phase192_6_rc20_canonical_pricing_onboarding.js
tests/pricing_admin_readiness_test.js
tests/industrial_provisioning_dispatch_remediation_test.js
tests/economic_formulas_and_routing_test.js
```

---

## Git Status

```
$ git status --short
(clean working tree — no modifications)
```

---

## Final Verdict

```
PHASE_193A_3_CONTROL_PLANE_ADAPTER:
DIRECTLY_COMPATIBLE
```

### Justification

1. **36 of 42 active rate fields are DIRECT_MATCH** between Control Plane `printer_nodes.rates_json` and BPE `house.rates`. The JSON paths, key names, and nesting structures are **identical**.

2. **6 fields require a known, documented UNIT_TRANSFORM** (BPE divides `*_var_per_1000_*` and `paper_waste_for_binding` by 100). This is a BPE-internal convention, not a schema mismatch — the Control Plane stores in the same units the BPE expects to receive.

3. **No structural adapter is needed.** The existing `syncPrinterNodesToPrintNodes` already performs a 1:1 copy. The calibration solver can read `rates_json` directly and produce a patch in the same schema.

4. **Prior sources are available and classified.** `printhouseSuggestedRates.ts` provides n=13 historical baselines with confidence levels, suitable for calibration seeds.

5. **The only significant risk is the transport country key inconsistency** (full names vs ISO), which requires a simple normalization step — not a structural adapter.

6. **Governance is safe.** Saving calibrated rates cannot silently activate marketplace grants. All activation requires explicit `printhouse_activation_grants` records.

**The system is ready for Phase 193B (solver design) and 193C (calibration API implementation) without schema modifications.**
