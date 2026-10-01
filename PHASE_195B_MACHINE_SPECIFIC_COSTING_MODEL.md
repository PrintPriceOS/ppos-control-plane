# Phase 195B — Machine-Specific Costing & Setup Data Model Report

## Executive Summary

Phase 195B establishes a governed, versioned machine-level economic model for individual production machines in PrintPrice OS.

Each physical machine (`printhouse_machines`) can now own versioned economic pricing profiles (`printhouse_machine_pricing_profiles`) containing machine-specific setup, makeready, plate, click, hourly, and run costs without modifying current forward pricing execution or altering legacy node-level `rates_json`.

**Phase Status:** `PASS / VALIDATED`
**Forward Pricing Isolation:** `CONFIRMED` (`forwardPricingConsumed: false`, legacy `@ppos/pricing-engine` invocation unchanged).

---

## 1. Baseline & Git Status

- **Branch:** `phase-39.2-tenant-management-console`
- **Baseline Commit:** `5d889fa` (`docs(pricing): audit Phase 195A machine-level costing architecture`)
- **Working Tree:** Clean

---

## 2. Machine Economics Data Model

### 2.1 Database Schema (Migration 154)

Created `printhouse_machine_pricing_profiles` table:
- `id` (VARCHAR 64, PK)
- `tenant_id` (VARCHAR 64, NOT NULL)
- `printhouse_id` (VARCHAR 64, FK to `printer_nodes.id` composite)
- `machine_id` (VARCHAR 64, FK to `printhouse_machines.id` composite)
- `version` (INT, NOT NULL DEFAULT 1)
- `technology` (VARCHAR 64, NOT NULL)
- `currency` (VARCHAR 10, NOT NULL DEFAULT 'EUR')
- `status` (`DRAFT` | `VALIDATED` | `SUPERSEDED`)
- `costs_json` (JSON, NOT NULL)
- `viability_json` (JSON, NULL)
- `checksum` (VARCHAR 64, SHA-256)
- `created_by_json` (JSON)
- `created_at` / `superseded_at` (TIMESTAMP(6))

### 2.2 Canonical Technology Types
- `DIGITAL_SHEETFED`
- `DIGITAL_WEB`
- `OFFSET_SHEETFED`
- `OFFSET_WEB`
- `INKJET_SHEETFED`
- `INKJET_WEB`
- `BINDING_EQUIPMENT`
- `FINISHING_EQUIPMENT`
- `OTHER`

### 2.3 Cost Driver & Unit Semantics
Supported cost bases:
- `PER_JOB` (fixed setup / makeready)
- `PER_PLATE` (offset plate cost)
- `PER_SHEET` (run cost per sheet)
- `PER_IMPRESSION`
- `PER_CLICK` (digital click rate)
- `PER_HOUR` (press hourly rate)
- `PER_1000_SHEETS` (run cost per thousand)
- `PER_COPY`

---

## 3. Versioning, Immutability & Checksum Governance

1. **Version Escalation:** Updating a machine's economic configuration marks the previous active profile as `SUPERSEDED` (`superseded_at = NOW()`) and creates `version = max_version + 1`.
2. **Deterministic Checksum:** Computes canonical SHA-256 over normalized technology, currency, costs, and viability JSON structure.
3. **Historical Immutability:** Historical profiles remain immutable once superseded.

---

## 4. Null vs Zero Semantics & Readiness Evaluation

- **Zero (`0`):** Explicitly indicates a cost component known to be zero (e.g. digital press with €0 plate cost).
- **Null (`null`):** Indicates an unconfigured or non-applicable field.
- **Technology-Specific Readiness:**
  - `OFFSET_SHEETFED`: Requires fixed setup/makeready, plate cost, and run cost.
  - `DIGITAL_SHEETFED`: Requires fixed setup and click or run cost.
  - `BINDING` / `FINISHING`: Requires fixed setup/per-job cost and run cost.

---

## 5. Backward Compatibility & Forward Pricing Isolation

- Legacy node-level pricing (`printer_nodes.rates_json`) remains 100% active and unmutated.
- Machine pricing profiles are registered and governed via API/UI, but carry `forwardPricingConsumed: false`.
- `@ppos/pricing-engine` continues to consume `syntheticHouse.rates` from node `rates_json`.
- Zero automatic route selection or machine switching is executed in Phase 195B.

---

## 6. Onboarding API & UI Integration

- **MACHINE_PRICING_API:** `IMPLEMENTED` (`API_READY`)
  - `GET /api/printhouse/onboarding/machines/:machineId/pricing`
  - `POST /api/printhouse/onboarding/machines/:machineId/pricing`
  - Integrated into `printhouseOnboardingRoutes.js` with strict tenant boundary verification.
- **MACHINE_PRICING_UI:** `NOT_IMPLEMENTED` (`UI_PENDING`)
  - Dedicated UI components (e.g. extending `MachineFleetPanel.tsx`) are pending frontend implementation in subsequent sub-phase.

---

## 7. Test Results

- **Phase 195B Smoke Tests (`tests/smoke_phase195b_machine_costing_model.js`):** PASS (20/20)
- **Phase 194 Regression Suites (194A - 194H):** PASS (100%)
- **Production Build (`npm run build`):** PASS

---

## 8. Hawk-Eye & Read-Model Status

- **HAWKEYE_MACHINE_PRICING_VISIBILITY:** `NOT_IMPLEMENTED` (Service DTOs export `forwardPricingConsumed: false`, but Hawk-Eye dashboard aggregator endpoint `/api/admin/hawk-eye` UI read-model integration is pending).

---

## 9. Handoff to Phase 195C (Production Route Selection)

Phase 195B completes machine cost ownership and governance API.
Proceed to **Phase 195C — Production Route Selection**, which will define how forward pricing compares eligible machine routes in diagnostic SHADOW mode without modifying active node rates or hardcoding quantity thresholds.

