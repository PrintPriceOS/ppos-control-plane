# PHASE 6.13.2.5B-R — REAL JOB-D SESSION CREATION & AUDIT CORRECTION REPORT

```text
================================================================================
PHASE 6.13.2.5B-R — REAL CONTROLLED JOB-D SESSION CREATION & AUDIT CORRECTION
STAGE 1 CONTROLLED BETA: AUTHORIZED
UNRESTRICTED PRODUCTION: NOT_AUTHORIZED
OPERATIONAL MODE: GOVERNED SERVICE PERSISTENCE & AUDIT CORRECTION
================================================================================
```

---

## 1. Audit Clarification & Discrepancy Reconciliation

- **Mock Simulation Disclosure**:
  The session `cal-d48a192f` reported in the earlier Phase 6.13.2.5B document was executed and validated against an in-memory database mock harness and **was not persisted to the live production database**.
- **Production Truth Verification**:
  Read-only verification confirmed:
  - Session `cal-d48a192f` does NOT exist in the production database.
  - Zero calibration sessions exist in production matching `tenant = ph-707a5869`, `printer_node_id = node-329a3bc4`, `target_manufacturing_price = 1790.14`.
- **Governed Production Execution**:
  A single real governed production creation was authorized and executed using canonical `calibrationSessionService` APIs without mock stores or monkey-patching.

---

## 2. Real Production Execution & Identifiers

| Property | Production Persisted Value | Verification Status |
|---|---|---|
| **Number of Real `createSession()` Invocations** | Exactly **1** | Strict Idempotency Enforced ✅ |
| **New Production Session ID** | `cal-184cf438` | Newly created canonical identifier ✅ |
| **Tenant ID** | `ph-707a5869` | Isolated & verified ✅ |
| **Printer Node ID** | `node-329a3bc4` | Production node resolved ✅ |
| **Session Status** | `READY` | Promoted via `promoteToReady()` ✅ |
| **Target Manufacturing Price** | `1790.1400` | Exact manufacturing target ✅ |
| **Currency** | `EUR` | ISO Currency Valid ✅ |
| **Includes Paper** | `true` (`1`) | Explicit boolean ✅ |
| **Includes Binding** | `true` (`1`) | Explicit boolean ✅ |
| **Includes Finishing** | `false` (`0`) | Explicit boolean ✅ |
| **Includes Packaging** | `false` (`0`) | Explicit boolean ✅ |
| **Transport Price** | `null` | Transport decoupled ✅ |

---

## 3. Exact Persisted Job D BookSpec

```json
{
  "copies": 750,
  "book_width_mm": 170,
  "book_height_mm": 240,
  "interior_pages": 192,
  "interior_print": "4/4",
  "paper_type_interior": "offset",
  "paper_weight_interior": 115,
  "paper_type_cover": "mc",
  "paper_weight_cover": 250,
  "cover_print": "4/0",
  "binding_method": "perfect bound",
  "delivery_country": "ES"
}
```

- **Lamination**: None
- **UV Varnish**: `false`
- **Dynamic Signature**: `16p`
- **Sections Count**: `12`

---

## 4. Audit-Level Commercial Provenance

> **Schema Boundary Note**: The `printhouse_pricing_calibration_sessions` database schema does NOT have dedicated columns for marketplace offer metadata. Commercial provenance is maintained at the audit level only and is not injected into unrelated JSON fields.

```text
SOURCE_TYPE:                BPE_MARKETPLACE_NATIVE
SOURCE_REFERENCE:           ofs_1787496310347_940ad26b
SELECTED_OFFER_ID:          offer_f4ee62cb600a
PRINTER_ID:                 adv-2025
PRINTER_NAME:               Adv 2025
TARGET_MANUFACTURING_PRICE: 1790.14 EUR
SOURCE_DATE:                2026-08-23
SPECS_HASH:                 518ff3b9ca5d6037faaeaecc346cc095f7c3ab5d83aec93ce0abf3241d6783af
OFFER_EXPIRATION_OBSERVED:  2026-08-23T15:45:10.347Z (Qualified while valid)
```

- **Security & Privacy Guarantee**: No `security_token`, `nonce`, `cookies`, or authorization headers were persisted or logged.

---

## 5. Baseline Rates Checksum & Revision Invariant

- **Snapshotted Rates Checksum**: `727caec4cb4f3237dbc0db210303ebb2f21f40b8d63dd0e3d8f6f852633b0c0d`
- **Active Pricing Revision**: `prev-3c025b51` (Revision 3)
- **Parity Check**: **CONFIRMED (100% bit-for-bit match with Revision 3)**

---

## 6. Technical Path Breakdown for Upcoming Calibration

`solver.extractActiveRatePaths()` derives **8 active rate paths** for Job D:

```text
ACTIVE RATE PATHS (Total: 8):
  1. binding_pb_fixed_by_sections.12
  2. binding_pb_var_per_1000_by_sections.12
  3. cover_fixed_by_colours.4
  4. cover_var_per_1000_by_colours.4
  5. interior_full_colour_fixed.16p
  6. interior_full_colour_var.16p
  7. paper_price_cover_by_kilo.mc
  8. paper_price_interior_by_kilo.offset
```

### Path Classification:
- **Historically Established & Locked Paths (6)**:
  - `cover_fixed_by_colours.4` (from Job A)
  - `cover_var_per_1000_by_colours.4` (from Job A)
  - `interior_full_colour_fixed.16p` (from Job A)
  - `interior_full_colour_var.16p` (from Job A)
  - `paper_price_cover_by_kilo.mc` (from Job B)
  - `paper_price_interior_by_kilo.offset` (from Job A)
- **Novel Calibratable Paths (2)**:
  - `binding_pb_fixed_by_sections.12` (Anchored to `0.164`)
  - `binding_pb_var_per_1000_by_sections.12` (Anchored to `176.4`)
- **Unqualified Zero-Anchor Blockers**: `0`

---

## 7. Hard Safety Invariants Verification

- **Number of Calibration Runs for Session `cal-184cf438`**: Exactly **0** (Queried via `calibration_session_id = 'cal-184cf438'`).
- **Confirmation No Pricing Revision Created**: **Confirmed (0 new revisions)**.
- **Confirmation `printer_nodes.rates_json` Unchanged**: **Confirmed (`prev-3c025b51` remains active)**.
- **Confirmation Revision 3 Remained Unchanged**: **Confirmed**.
- **Confirmation No Calculate Call Occurred**: **Confirmed (Solver NOT invoked)**.
- **Confirmation No Acceptance Occurred**: **Confirmed**.
- **Confirmation No Manual SQL Mutation Used**: **Confirmed (`calibrationSessionService` used exclusively)**.
- **Certified Live Reference Prices**:
  - Reference Job A: `€3,449.97`
  - Reference Job B: `€850.15`
  - Reference Job C′: `€1,803.40`

---

## 8. Final Status & Recommendation

```text
================================================================================
REAL PRODUCTION SESSION cal-184cf438 STATUS: READY
TECHNICAL & COMMERCIAL EVIDENCE: 100% QUALIFIED
ZERO MUTATIONS TO LIVE PRODUCTION RATES
RECOMMENDATION: READY_FOR_PHASE_6.13.2.5C_CONTROLLED_CALCULATION
================================================================================
```
