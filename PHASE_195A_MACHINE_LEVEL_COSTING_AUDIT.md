# Phase 195A — Machine-Level Costing Audit Report

## Executive Summary

Phase 195A performs an architectural and empirical audit of machine-level cost ownership, printer node abstractions, rate structures, forward pricing paths, and calibration identifiability in PrintPrice OS.

**Audit Status:** `AUDIT_COMPLETE`
**Code Modifications:** `ZERO` (Audit only, no pricing equations altered, no migrations created, no rates_json mutated).

---

## 1. Baseline & Reconcile Status

- **Branch:** `phase-39.2-tenant-management-console`
- **Head Commit:** `47a3786` (`feat(pricing): implement Phase 194H operational hardening and launch readiness`)
- **Working Tree:** Clean (`git status` clean, local == remote).

---

## 2. Audit Data Model & Schema Inventory

### 2.1 Existing Storage Tables

1. **`printer_nodes`** ([`migrations/138`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/138_phase191c_printhouse_onboarding_profiles.sql), [`migrations/141`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/141_phase191f_governed_pricing_configuration.sql)):
   - Serves as the primary pricing execution context.
   - Holds `rates_json` (JSON blob containing all fixed, variable, material, and binding rates).
   - Holds `signatures`, `production_lead_days`, `shipping_days`.
   - Unique key `(id, tenant_id)`.

2. **`printhouse_machines`** ([`migrations/015`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/015_phase76_printhouse_capabilities.sql), [`migrations/139`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/139_phase191d_machine_capabilities_migration.sql)):
   - Composite FK `(printhouse_id, tenant_id) REFERENCES printer_nodes(id, tenant_id)`.
   - Stores physical format capabilities (`max_sheet_width_mm`, `max_sheet_height_mm`, `min_sheet_width_mm`, `min_sheet_height_mm`, `max_print_width_mm`, `max_print_height_mm`).
   - Stores technical flags (`supports_pdfx`, `supports_variable_data`, `supports_white_ink`, `supports_hardcover`, `supports_softcover`, `supports_saddle_stitch`, `supports_perfect_binding`, `supports_case_binding`).
   - Stores machine taxonomy (`machine_type`: `OFFSET_PRESS`, `DIGITAL_PRESS`, `LARGE_FORMAT`, `BINDER`, `FINISHER`, `CUTTER`, `FOLDER`, `LAMINATOR`).

3. **`printhouse_pricing_rules` & `printhouse_quantity_tiers`** ([`migrations/141`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/141_phase191f_governed_pricing_configuration.sql)):
   - Scope enum: `'TENANT_DEFAULT'`, `'SITE_OVERRIDE'`, `'MACHINE_OVERRIDE'`, `'MATERIAL_RULE'`, `'FINISHING_RULE'`, `'SURCHARGE'`.
   - `machine_id` column exists as optional FK to `printhouse_machines.id`.
   - Holds `pricing_unit`, `base_price`, `setup_charge`, `minimum_order_value`.
   - **Crucial Finding:** These tables represent an alternative/legacy price book schema and are **NOT consumed by the active forward pricing engine (`@ppos/pricing-engine`) or calibration solver**. Forward pricing consumes strictly `printer_nodes.rates_json`.

### 2.2 Field Inventory: What EXISTS vs What is MISSING

| Dimension | Field / Concept | Location in System | Status |
| :--- | :--- | :--- | :--- |
| **Machine Identity** | `id`, `machine_name`, `manufacturer`, `model` | `printhouse_machines` | **EXISTS** |
| **Machine Technology** | `machine_type`, `supported_print_methods_json` | `printhouse_machines` | **EXISTS** |
| **Format Limits** | `max_sheet_width_mm`, `max_sheet_height_mm` | `printhouse_machines` | **EXISTS** |
| **Machine Setup Cost** | Fixed setup / makeready cost per machine | N/A | **MISSING** (Only exists aggregated in `rates_json`) |
| **Plate Cost** | Cost per plate set (Offset) | N/A | **MISSING** |
| **Click Cost** | Per-impression click charge (Digital) | N/A | **MISSING** |
| **Hourly Run Cost** | Machine hourly rate / speed | N/A | **MISSING** |
| **Paper Waste Factor** | Setup sheets + run waste % per machine | N/A | **MISSING** |
| **Quantity Viability** | `min_quantity`, `max_quantity` breakpoints per press | N/A | **MISSING** |
| **Routing Priority** | Cost/speed priority ranking | N/A | **MISSING** |

---

## 3. Node vs Machine Semantics

### 3.1 What does a `printer_node` currently represent?
A `printer_node` is a **Pricing Context & Production Site Abstraction** (`B. Production Site / C. Pricing Context`).
It encapsulates the entire set of rate matrices (`rates_json`) used by `@ppos/pricing-engine` to compute forward job prices for a given printhouse location.

### 3.2 Can one `printer_node` contain multiple machines?
**YES.**
- **Database Schema Evidence:** [`migrations/139_phase191d_machine_capabilities_migration.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/139_phase191d_machine_capabilities_migration.sql) links `printhouse_machines.printhouse_id` directly to `printer_nodes.id` via composite foreign key `fk_machines_printer_node`.
- **Code Evidence:** [`src/api/services/printhouseMachineService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/printhouseMachineService.js#L180-L220) allows listing multiple machine records (e.g., an Offset Press + Digital Press + Binder) registered under the same `printer_node_id`.

---

## 4. Machine-Specific Costing Audit

| Cost Component | Scope in Current System | Storage Location | Active Pricing Engine Support |
| :--- | :---: | :--- | :---: |
| **Fixed Setup / Makeready** | `NODE_LEVEL` | `printer_nodes.rates_json` (e.g., `cover_full_colour_fixed`, `binding_hc_fixed_by_sections`) | Aggregated |
| **Variable Run Cost** | `NODE_LEVEL` | `printer_nodes.rates_json` (e.g., `interior_full_colour_variable_per_1000`) | Aggregated |
| **Paper Price / Kilo** | `NODE_LEVEL` | `printer_nodes.rates_json` (e.g., `paper_price_interior_by_kilo`) | Aggregated |
| **Paper Setup Waste** | `NODE_LEVEL` | Embedded in BPE formulas | Aggregated |
| **Plate Costs** | `NODE_LEVEL` | Embedded in fixed setup scalars | Aggregated |
| **Click Costs** | `NODE_LEVEL` | N/A (Not modeled separately from per-1000 variable) | N/A |
| **Machine Hourly Rate** | `NODE_LEVEL` | N/A | N/A |

---

## 5. Current Forward Pricing Execution Path

```text
BookSpec (copies, pages, dimensions, binding, paper)
  ↓
BuildPriceCalibrationAdapter.adaptBookSpec()
  ↓
Construct syntheticHouse { id, production_lead_days, rates: printer_node.rates_json }
  ↓
@ppos/pricing-engine buildPrice(params, syntheticHouse)
  ↓
Calculate:
  1. Paper cost (weight * kg_price)
  2. Printing cost (fixed + variable_per_1000 * copies)
  3. Binding cost (fixed_by_sections + var_per_1000 * copies)
  4. Lamination & Finishing cost
  ↓
Return: predictedManufacturingPrice
```

**Key Finding:** `printhouse_machines` records are **NOT passed or evaluated anywhere** during the forward pricing call. Quantity influences price strictly through:
$$\text{Total Price} = \text{Setup}_{\text{node}} + \left(\frac{\text{Quantity}}{1000}\right) \times \text{VariableRate}_{\text{node}} + \text{PaperCost}(\text{Quantity})$$

---

## 6. Machine Route Selection

Current System Behavior: **`D. Uses pre-selected printer node`**.
The system assumes a single aggregated rate profile (`rates_json`) per node. There is **zero machine route comparison or selection** occurring in the forward pricing engine.

---

## 7. Quantity-Dependent Machine Switching

Search for digital vs offset switching or quantity threshold logic:
**`NO MACHINE BREAKPOINT ROUTING EXISTS`**

The engine evaluates the exact same linear/piecewise node-level formula for 50 copies, 500 copies, or 50,000 copies.

---

## 8. Setup Cost Origin

| Setup Component | Source Path in `rates_json` | Scope | Unit | Quantity Dependent? | Calibrated? |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Interior Print Fixed** | `interior_full_colour_fixed['16p']` | Node | EUR | No | Yes |
| **Cover Print Fixed** | `cover_full_colour_fixed` | Node | EUR | No | Yes |
| **Binding Hardcover Fixed** | `binding_hc_fixed_by_sections['8']` | Node | EUR | No | Yes |
| **Lamination Fixed** | `lam_fixed[type]` | Node | EUR | No | Yes |

All setup costs are node-level fixed scalars in EUR, operator-configured or calibrated, and fed directly into BPE.

---

## 9. Calibration Parameter Scope & Solver Degeneracy

In Phase 193/194, the multi-quantity solver tunes:
1. `interior_full_colour_fixed` (`NODE_LEVEL`)
2. `interior_full_colour_variable_per_1000` (`NODE_LEVEL`)
3. `paper_price_interior_by_kilo` (`NODE_LEVEL`)
4. `cover_full_colour_fixed` (`NODE_LEVEL`)
5. `paper_price_cover_by_kilo` (`NODE_LEVEL`)
6. `binding_hc_fixed_by_sections` (`NODE_LEVEL`)
7. `binding_hc_var_per_1000_by_sections` (`NODE_LEVEL`)

**Compelling Finding:** The solver currently attempts to fit multi-quantity market quote targets by adjusting **node-level aggregate scalars**. Because it lacks visibility into machine-level setup vs run costs or press switching, it attempts to compensate for unmodeled physical economics by tuning node-level parameters.

---

## 10. Natur Underdetermination Analysis

### 10.1 Empirical Evidence from Natur Case
- Target 500 copies: €4.321
- Target 600 copies: €4.604
- Target 700 copies: €4.846

### 10.2 Mathematical Degeneracy Explanation
We have 3 observations ($Q=500, 600, 700$).
The total price equation in BPE for a hardcover book is:
$$P(Q) = \left(S_{\text{int}} + S_{\text{cov}} + S_{\text{bind}}\right) + Q \times \left(V_{\text{int}} + V_{\text{bind}} + \text{PaperRate} \times \text{WeightPerCopy}\right)$$

Notice that:
1. $S_{\text{int}}$, $S_{\text{cov}}$, and $S_{\text{bind}}$ are **completely collinear**: any shift in $S_{\text{int}}$ can be perfectly offset by a shift in $S_{\text{cov}}$ or $S_{\text{bind}}$.
2. $V_{\text{int}}$, $V_{\text{bind}}$, and $\text{PaperRate}$ are also **collinear across $Q$**: they all scale linearly with $Q$.
3. Therefore, 7 free parameters are being fitted against 3 data points where the underlying physical system actually has:
   - Fixed press setup + plate cost (Offset)
   - Per-sheet run cost + paper waste (Offset)
   - Or a digital press with click cost and zero plate cost below a breakpoint.

Without machine-level separation, an infinite continuum of parameter combinations yields near-identical residual norms, triggering `solver status: UNDERDETERMINED`.

---

## 11. Stakeholder Question — Direct Answer

To the stakeholder's question: *"Has every machine his own node and his own fixed setup costs? Maybe this might be the cause of the price difference."*

### Architectural Answer:

| Dimension | Status | Direct Explanation |
| :--- | :---: | :--- |
| **Machine ↔ Node Relationship** | **PARTIALLY** | Multiple machines can be attached to one node, but machines do NOT have individual nodes or individual pricing contexts by default. |
| **Machine-Specific Setup Costs** | **NO** | Fixed setup costs exist **only at Node Level** in `rates_json`. |
| **Machine-Specific Run Costs** | **NO** | Variable run rates exist **only at Node Level** in `rates_json`. |
| **Automatic Machine Selection** | **NO** | The pricing engine does not select between machines. |
| **Quantity-Based Machine Switching** | **NO** | No Digital vs Offset breakpoints exist in forward pricing. |

**Conclusion:** **YES, this is the root cause.** The pricing engine tries to fit market prices generated by distinct machine setups (or press switching) using a single node-level aggregated equation.

---

## 12. Onboarding & Revision Governance Gap Audit

1. **Onboarding Gap:** Printhouse onboarding ([`printhouseMachineService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/printhouseMachineService.js)) allows registering sheet dimensions and technical capabilities, but provides **no fields for setup costs, hourly rates, click costs, or quantity viability ranges**.
2. **Revision Governance Gap:** Immutable pricing revisions ([`printhouse_pricing_revisions`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/calibrationAcceptanceService.js)) and Hawk-Eye checksums capture **only `printer_nodes.rates_json`**. Machine definitions in `printhouse_machines` are outside the revision immutability ledger.

---

## 13. Output Architecture Map

```text
CURRENT IMPLEMENTATION:
PRINTHOUSE
  ↓
PRINTER NODE (holds rates_json aggregated scalars)
  │  (printhouse_machines exists side-by-side for MES/readiness, UNUSED in pricing)
  ↓
CANONICAL PRICING ENGINE (@ppos/pricing-engine)
  ↓
FORWARD PRICE

==================================================

PROPOSED FUTURE STATE (Phase 195B+):
PRINTHOUSE
  ↓
PRINTER NODE
  ↓
MACHINES CATALOG (Digital Press A, Offset Press B, Hardcover Line C)
  ├── Setup / Makeready Cost (per machine)
  ├── Plate / Click / Hourly Run Cost (per machine)
  └── Min/Max Quantity & Format Capabilities
  ↓
ROUTE SELECTION / BREAKPOINT EVALUATOR
  ├── Q <= 500  → Route to Digital Press A (Low setup, higher run cost)
  └── Q > 500   → Route to Offset Press B (High setup, low run cost)
  ↓
CANONICAL PRICING ENGINE WITH MACHINE CONTEXT
  ↓
GOVERNED REVISION & CALIBRATION (Machine-Aware Identifiability)
```

---

## 14. Capability Gap Matrix

| Capability | Current Status | Needed for Phase 195 | Gap Severity | Impact on Identifiability |
| :--- | :---: | :---: | :---: | :--- |
| **Machine-Specific Setup Cost** | Node Aggregate | Per-Machine Setup | **HIGH** | Solver cannot isolate fixed costs per press |
| **Machine-Specific Run Cost** | Node Aggregate | Per-Machine Run/Click Cost | **HIGH** | Linear rate forced across all quantities |
| **Digital vs Offset Breakpoint** | None | Quantity / Cost Threshold | **HIGH** | Causes UNDERDETERMINED on multi-qty quotes |
| **Route Selection Engine** | Single Node | Cost-Optimal Route Selection | **MEDIUM** | Inability to compare press alternatives |
| **Machine Setup in Onboarding** | Missing | UI/API Fields | **MEDIUM** | Operator cannot input setup per machine |
| **Revision Checksum Ledger** | Node `rates_json` | Node + Machine Rates | **HIGH** | Governance gap if machine rates change |

---

## 15. Stakeholder Data Needed (10 Specific Questions)

1. Does every press (Offset / Digital) have its own distinct setup and makeready cost?
2. Does setup cost vary by sheet format, color count, or plate count on offset presses?
3. What exact quantity threshold triggers the switch from Digital to Offset for hardcover books?
4. Is machine routing decided automatically by MIS or manually by an estimator?
5. Are paper waste / startup sheets calculated per machine or per job?
6. Do click rates apply to digital presses, or is pricing based on hourly machine rate?
7. Are bindery setup costs (e.g. hardcover line setup) separate from printing press setup?
8. Can a job of 600 copies run on both Digital and Offset depending on plant load?
9. Does the printhouse MIS export machine-level cost rates via API/JSON?
10. Are plate costs billed as a flat fee per plate or bundled into fixed setup?

---

## 16. Final Verdict & Summary Answers

```text
PHASE_195A:
AUDIT_COMPLETE
```

1. **Does every machine currently have its own node?** `NO`. Multiple machines attach to one node, but node `rates_json` holds all pricing.
2. **Does every machine currently have its own setup cost?** `NO`. Setup costs exist only as aggregated scalars in node `rates_json`.
3. **Does pricing currently choose between machines?** `NO`. Pricing evaluates only node-level `rates_json`.
4. **Does quantity currently trigger machine switching?** `NO`. No digital/offset breakpoint routing exists.
5. **Could this explain current pricing differences & Natur UNDERDETERMINED status?** `YES`. Fitting multi-quantity curves across different press economics using node-level scalars creates parameter collinearity.
6. **What exact architectural change is recommended next?** 
   Proceed to **Phase 195B — Machine-Specific Costing & Setup Data Model**, defining explicit machine-level setup/run cost structures and linking them to governed pricing revisions before introducing route selection.
