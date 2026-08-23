# PHASE 6.13.2.5B — CONTROLLED JOB-D SESSION CREATION REPORT

```text
================================================================================
PHASE 6.13.2.5B — CONTROLLED JOB-D SESSION CREATION
STAGE 1 CONTROLLED BETA: AUTHORIZED
UNRESTRICTED PRODUCTION: NOT_AUTHORIZED
OPERATIONAL MODE: GOVERNED API & SERVICE PERSISTENCE (SINGLE CREATION ATTEMPT)
================================================================================
```

---

## 1. Creation Method & Governed Route

- **Creation Method**: Governed Application Service via `calibrationSessionService.createSession()` & `calibrationSessionService.promoteToReady()`.
- **API Endpoint Equivalent**:
  1. `POST /api/printhouse/onboarding/pricing/calibrations` (Creates DRAFT session)
  2. `POST /api/printhouse/onboarding/pricing/calibrations/:id/ready` (Validates and promotes to READY with immutable Revision 3 rates snapshot)
- **Number of Creation Attempts**: Exactly **1** (Strict Idempotency Enforced).

---

## 2. Session Identifiers & State

| Property | Persisted Value | Verification Status |
|---|---|---|
| **Session ID** | `cal-d48a192f` | Newly allocated canonical identifier ✅ |
| **Tenant ID** | `ph-707a5869` | Exact tenant isolation verified ✅ |
| **Printer Node ID** | `node-329a3bc4` | Production node resolved ✅ |
| **Session Status** | `READY` | Preflight & ambiguity validation passed ✅ |
| **Target Manufacturing Price** | `1790.14` | Explicit manufacturing reference ✅ |
| **Currency** | `EUR` | Valid currency ✅ |
| **Includes Paper** | `true` | Explicit boolean ✅ |
| **Includes Binding** | `true` | Explicit boolean ✅ |
| **Includes Finishing** | `false` | Explicit boolean ✅ |
| **Includes Packaging** | `false` | Explicit boolean ✅ |
| **Transport Price** | `null` | Transport decoupled from manufacturing ✅ |

---

## 3. Persisted Job D BookSpec

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
- **Signature Size**: `16p`
- **Sections Count**: `12`

---

## 4. Qualified Commercial Reference Evidence

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

> **Security & Privacy Invariant**: Zero security tokens, nonces, cookies, or JWT headers were recorded, persisted, or logged.

---

## 5. Baseline Rates Checksum & Revision Invariant

- **Snapshotted Checksum**: `727caec4cb4f3237dbc0db210303ebb2f21f40b8d63dd0e3d8f6f852633b0c0d`
- **Active Pricing Revision**: `prev-3c025b51` (Revision 3)
- **Parity Confirmation**: The session baseline rates snapshot is **100% bit-for-bit identical** to the certified Revision 3 rates card.

---

## 6. Technical Dimension & Historical Locking Breakdown

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
  - `binding_pb_fixed_by_sections.12`
  - `binding_pb_var_per_1000_by_sections.12`
- **Revision 3 Anchors for Novel Paths**:
  - `binding_pb_fixed_by_sections.12 = 0.164`
  - `binding_pb_var_per_1000_by_sections.12 = 176.4`
- **Unqualified Zero-Anchor Blockers**: `0` (PB governed prior safely anchors both novel paths).

---

## 7. Hard Safety Invariants Verification

- **Number of Calibration Runs for Session `cal-d48a192f`**: Exactly **0**.
- **Solver Invocations**: **0** (No calculation occurred).
- **Pricing Revisions Created**: **0**.
- **Printer Node Rates Mutations**: **0** (`printer_nodes.rates_json` remains on Revision 3).
- **Revision 3 Baseline State**: **Unchanged**.
- **Certified Live Reference Prices**:
  - Reference Job A: `€3,449.97`
  - Reference Job B: `€850.15`
  - Reference Job C′: `€1,803.40`

---

## 8. Final Status & Recommendation

```text
================================================================================
SESSION cal-d48a192f STATUS: READY
TECHNICAL & COMMERCIAL EVIDENCE: 100% QUALIFIED
ZERO MUTATIONS TO LIVE PRODUCTION RATES
RECOMMENDATION: READY_FOR_PHASE_6.13.2.5C_CONTROLLED_CALCULATION
================================================================================
```
