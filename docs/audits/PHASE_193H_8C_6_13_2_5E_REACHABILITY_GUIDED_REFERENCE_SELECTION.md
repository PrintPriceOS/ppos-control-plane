# PHASE 193H.8C.6.13.2.5E — REACHABILITY-GUIDED REFERENCE SELECTION AUDIT REPORT

```text
================================================================================
PHASE 193H.8C.6.13.2.5E: REACHABILITY-GUIDED REFERENCE SELECTION
STATUS: QUALIFIED_REFERENCE_SELECTED
STAGE 1 CONTROLLED BETA: AUTHORIZED
UNRESTRICTED PRODUCTION: NOT_AUTHORIZED
OPERATIONAL MODE: STRICTLY READ-ONLY (ZERO DB MUTATIONS)
================================================================================
```

---

## 1. Executive Summary & Selection Objective

Phase 6.13.2.5E executes a **strictly read-only, reachability-guided commercial reference search** to select an optimal, mathematically reachable, and structurally sound commercial reference for the next calibration phase (replacement Job D / Job E).

Using the pre-calibration reachability gate developed in Phase 6.13.2.5D, multiple commercial marketplace offers across candidate Perfect Bound section configurations were systematically evaluated against the active Revision 3 baseline (`prev-3c025b51` / `727caec4...`).

---

## 2. Production Baseline Integrity

- **Production Tenant**: `ph-707a5869`
- **Production Node**: `node-329a3bc4`
- **Active Pricing Revision**: `prev-3c025b51` (Revision 3)
- **Active Checksum**: `727caec4cb4f3237dbc0db210303ebb2f21f40b8d63dd0e3d8f6f852633b0c0d`
- **Integrity Status**: **VERIFIED BIT-FOR-BIT IDENTICAL**

---

## 3. Candidate Discovery & Exploration Strategy

To isolate novel degrees of freedom without re-introducing multidimensional entanglement or unqualified zero-anchor blockers:
1. **Paper & Print Paths**: Kept firmly on historically certified and locked dimensions (`offset 115gsm` interior @ €2.5577/kg, `mc 250gsm` cover @ €1.6237/kg, `4/4` interior @ €164.0616/€16.5880, `4/0` cover @ €134.8284/€25.5357).
2. **Novel Dimensions**: Systematically explored alternate section counts in the governed Perfect Bound family (`binding_pb_*_by_sections.N`).
3. **Reachable Position Preference**: Filtered for candidates whose target lies safely inside the governed $[P_{\min}, P_{\max}]$ interval, ideally within the **30% – 70%** target position band.

---

## 4. Candidate Marketplace Comparison Table

| Candidate Ref | Spec Summary | Printer / Offer ID | Target (€) | Current (€) | P_min (€) | P_max (€) | Status | Position % | Novel Paths | Decision / Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| **CAND_1A** | 64p (Sec 4), 750 copies, 170×240 | Adv 2025 (`offer_794a81bc2001`) | `€760.50` | `€819.97` | `€708.10` | `€1,879.85` | REACHABLE | 4.47% | `pb.4` (2 paths) | REJECTED_BOUNDARY_RISK (<20%) |
| **CAND_1B** | **64p (Sec 4), 750 copies, 170×240** | **Dar Direct (`offer_831c90ef4112`)** | **`€1,180.25`** | **`€819.97`** | **`€708.10`** | **`€1,879.85`** | **REACHABLE** | **40.29%** | **`pb.4` (2 paths)** | **QUALIFIED (SELECTED)** ✅ |
| **CAND_1C** | 64p (Sec 4), 750 copies, 170×240 | Poznan Print (`offer_550b12ad3994`) | `€1,350.00` | `€819.97` | `€708.10` | `€1,879.85` | REACHABLE | 54.78% | `pb.4` (2 paths) | QUALIFIED (Viable Alternative) |
| **CAND_2A** | 96p (Sec 6), 1000 copies, 170×240 | Adv 2025 (`offer_991a04bc6120`) | `€1,360.00` | `€1,371.69` | `€1,372.43` | `€1,520.33` | BELOW_FLOOR | -8.40% | `pb.6` (2 paths) | REJECTED_BELOW_FLOOR |
| **CAND_2B** | 96p (Sec 6), 1000 copies, 170×240 | Dar Direct (`offer_114b72ca8901`) | `€1,420.50` | `€1,371.69` | `€1,372.43` | `€1,520.33` | REACHABLE | 32.50% | `pb.6` (2 paths) | QUALIFIED (Narrow Range: €148) |
| **CAND_3A** | 160p (Sec 10), 500 copies, 170×240 | Adv 2025 (`offer_220a91fc1045`) | `€1,110.00` | `€1,116.35` | `€1,117.09` | `€1,264.99` | BELOW_FLOOR | -4.79% | `pb.10` (2 paths) | REJECTED_BELOW_FLOOR |
| **CAND_3B** | 160p (Sec 10), 500 copies, 170×240 | Dar Direct (`offer_772c44ed9123`) | `€1,195.00` | `€1,116.35` | `€1,117.09` | `€1,264.99` | REACHABLE | 52.68% | `pb.10` (2 paths) | QUALIFIED (Narrow Range: €148) |
| **CAND_3C** | 160p (Sec 10), 500 copies, 170×240 | Poznan Print (`offer_661e33ab7890`) | `€1,240.00` | `€1,116.35` | `€1,117.09` | `€1,264.99` | REACHABLE | 83.10% | `pb.10` (2 paths) | REJECTED_BOUNDARY_RISK (>80%) |

---

## 5. Selected Reference Job Specification (Candidate 1B)

```json
{
  "copies": 750,
  "book_width_mm": 170,
  "book_height_mm": 240,
  "interior_pages": 64,
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

### Commercial Provenance Details:
```text
SOURCE_TYPE:                BPE_MARKETPLACE_NATIVE
OFFER_SESSION_ID:           ofs_1787502840112_820bc71a
SELECTED_OFFER_ID:          offer_831c90ef4112
PRINTER_ID:                 dar-direct
PRINTER_NAME:               Dar Direct
TARGET_MANUFACTURING_PRICE: 1180.25 EUR
CURRENCY:                   EUR
SPECS_HASH:                 155894cbcb61b4eae5307d939cd2e4f20c8e46b6246bd64f569b0f0171a22f6f
SOURCE_DATE:                2026-08-23
COMMERCIAL_FLAGS:           includesPaper=true, includesBinding=true, includesFinishing=false, includesPackaging=false
```

---

## 6. Path Classification & Reachability Metrics for Selected Reference

- **Current Baseline Forward Price**: `€819.97`
- **Minimum Reachable Price**: `€708.10`
- **Maximum Reachable Price**: `€1,879.85`
- **Target Manufacturing Price**: `€1,180.25`
- **Reachable Interval Width**: `€1,171.75`
- **Target Position inside Interval**: **`40.29%`** (Comfortably inside the ideal 30%–70% band ✅).

### Active Path Ledger (8 total):
- **Historically Locked Paths (6)**:
  1. `cover_fixed_by_colours.4` (from Job A)
  2. `cover_var_per_1000_by_colours.4` (from Job A)
  3. `interior_full_colour_fixed.16p` (from Job A)
  4. `interior_full_colour_var.16p` (from Job A)
  5. `paper_price_cover_by_kilo.mc` (from Job B)
  6. `paper_price_interior_by_kilo.offset` (from Job A)
- **Novel Calibratable Paths (2)**:
  1. `binding_pb_fixed_by_sections.4` (Baseline anchor: `0.1640`)
  2. `binding_pb_var_per_1000_by_sections.4` (Baseline anchor: `117.6000`)
- **Zero-Anchor Blockers**: **0** (Both novel PB section 4 paths are non-zero anchored).

---

## 7. Rationale: Why Candidate 1B is Superior to Defective Job D

1. **Robust Headroom Above Material Floor**:
   In Candidate 1B (64 pages), the locked paper floor is `€648.00` interior offset + `€55.21` cover MC = `€703.21`. The target price of **€1,180.25** provides substantial headroom (+€477.04) for realistic binding allocation.
2. **Generous Calibration Span**:
   The reachable range (€708.10 – €1,879.85) spans €1,171.75, ensuring the solver operates in a well-conditioned gradient space rather than clipping at search boundaries.
3. **Identifiability & Orthogonality**:
   The job isolates exactly 2 novel leaf parameters (`binding_pb_*_by_sections.4`) while keeping 75% of the active dimensions pinned to certified historical truth.

---

## 8. Hard Safety Invariants Verification

- **Sessions Created**: Exactly **0**
- **Calibration Runs Created**: Exactly **0**
- **Pricing Revisions Created**: Exactly **0**
- **Printer Node Rates Mutated**: **NO** (`printer_nodes.rates_json` remains on Revision 3)
- **Active Rates Checksum**: `727caec4cb4f3237dbc0db210303ebb2f21f40b8d63dd0e3d8f6f852633b0c0d` (Unchanged)
- **Active Pricing Revision**: `prev-3c025b51` (Unchanged)

---

## 9. Final Recommendation

```text
================================================================================
STATUS: READY_FOR_CONTROLLED_SESSION_CREATION
QUALIFIED REFERENCE: Candidate 1B (Dar Direct, 64p PB, Target: 1180.25 EUR)
AUDIT VERDICT: PASS
================================================================================
```
