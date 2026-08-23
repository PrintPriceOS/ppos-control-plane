# PHASE 193H.8C.6.13.2.5F — GOVERNED JOB-D ACCEPTANCE & REVISION 4 CLOSURE

```text
================================================================================
PHASE 193H.8C.6.13.2.5F: GOVERNED JOB-D ACCEPTANCE & REVISION 4 CLOSURE
STATUS: PASS / CLOSED ✅
STAGE 1 CONTROLLED BETA: AUTHORIZED
UNRESTRICTED PRODUCTION: NOT_AUTHORIZED
OPERATIONAL MODE: CANONICAL PRODUCTION EVIDENCE & REVISION 4 SEALING
================================================================================
```

---

## 1. Executive Summary

Phase 6.13.2.5E/F successfully resolved the Job D reachability challenge through pre-calibration analysis, identification and correction of an upstream Budget assistant parser defect, and execution of a governed calibration and acceptance workflow in production.

- **Phase 6.13.2.5D**: `PASS` (Pre-Calibration Reachability Gate implemented and active).
- **Phase 6.13.2.5E**: `PASS` (Reachability-guided reference qualification completed).
- **Phase 6.13.2.5F**: `PASS / CLOSED` (Governed calibration and acceptance promoted to Revision 4).

---

## 2. Upstream Bug Remediation & Parser Invariant

A frontend semantic bug was identified and remediated in the Budget interface (`components/AssistantChat.tsx`).
- **Defect**: The heuristic parser was forcing `endpapers = "standard"` whenever user text contained words like "endpapers" or "guardas", even when `binding_method` was `perfect bound`.
- **Invariant Enforcement**:
  - `perfect_bound` $\rightarrow$ `endpapers = "none"`
  - `perfect_bound` $\rightarrow$ `endpapers_print = "none"`
- **Commit Reference**: `475b875` (`fix: keep perfect bound endpapers disabled`).
- **Deployment**: Production bundle rebuilt and verified; corrected BPE payload validated.

---

## 3. Validated Commercial Reference & Market Evidence

- **Source Type**: `BPE_MARKETPLACE_NATIVE`
- **Book Specification**:
  - **Copies**: `750`
  - **Dimensions**: `170 × 240 mm`
  - **Interior Pages**: `64` (4 sections of 16p)
  - **Interior Print**: `4/4` CMYK
  - **Interior Paper**: `offset 115 gsm`
  - **Cover Paper**: `mc 250 gsm`
  - **Cover Print**: `4/0`
  - **Binding Method**: `perfect bound`
  - **Lamination / Endpapers**: None (`endpapers = "none"`, `endpapers_print = "none"`)
  - **Delivery Country**: `ES`
- **Marketplace Offers**:
  - ADV (adv-2025): `€831.38`
  - DAR (dar-direct): `€845.94`
  - POZ (poz-print): `€939.66`
- **Selected Calibration Target**: **`€939.66`**

---

## 4. Pre-Calibration Reachability Verification

Evaluated against active baseline **Revision 3** (`prev-3c025b51` / `727caec4...`):
- **Gate Status**: **`REACHABLE`**
- **Current Forward Price**: `€844.53`
- **Reachable Span**: `€788.52` – `€1,375.21`
- **Active Paths (8 total)**:
  - **Historically Locked (6)**: `cover_fixed_by_colours.4`, `cover_var_per_1000_by_colours.4`, `interior_full_colour_fixed.16p`, `interior_full_colour_var.16p`, `paper_price_cover_by_kilo.mc`, `paper_price_interior_by_kilo.offset`
  - **Novel Calibratable (2)**: `binding_pb_fixed_by_sections.4`, `binding_pb_var_per_1000_by_sections.4`
- **Zero-Anchor Blockers**: `0` (`unqualifiedZeroAnchors: []`).

---

## 5. Governed Production Calibration Run

- **Calibration Session**: `cal-adc1df15`
- **Calibration Run**: `crun-70aa6d5c`
- **Run Status**: **`SUCCEEDED`**
- **Engine Price Before**: `€844.53`
- **Engine Price After**: `€939.63`
- **Target Price**: `€939.66`
- **Absolute Residual**: `€0.03`
- **Percent Residual**: `0.0032%`
- **Evaluations Count**: `14`
- **Proposed Patch**:
  - `binding_pb_fixed_by_sections.4`: `0.1640 → 0.4285`
  - `binding_pb_var_per_1000_by_sections.4`: `58.8000 → 153.6329`
- **Locked Path Isolation**: 100% verified (All 6 historical paths preserved bit-for-bit).

---

## 6. Governed Acceptance & Revision 4 Lineage

- **Acceptance ID**: `pacc-fcd1c952`
- **New Active Revision**: `prev-1b6d9af1` (Revision 4)
- **Parent Revision Pointer**: `prev-3c025b51` (Revision 3)
- **New Canonical Live Rates Checksum**:
  ```text
  39ded89fed4da1a721fa34d6ac392a70bc3096ea890560b8add9638f0d9baf7a
  ```

### Lineage Chain:
```text
prev-ffb9b4a5 (Revision 1)
      ↓
prev-0f4796c9 (Revision 2)
      ↓
prev-3c025b51 (Revision 3)
      ↓
prev-1b6d9af1 (Revision 4)  ← ACTIVE CANONICAL BASELINE
```

### Production Verification Ledger:
- `sessionAccepted = true`
- `revisionMatchesLive = true`
- `acceptanceMatchesLive = true`
- `baselineMatchesRun = true`
- `lineageCorrect = true`
- `sourceSessionCorrect = true`
- `sourceRunCorrect = true`

---

## 7. Governance Policy & Baseline Freezing

1. **Deprecated Synthetic Evidence**: The earlier analytical candidate explore table utilizing synthetic `overrideRates` is deprecated and superseded by real production evidence above.
2. **Canonical Working Baseline**: All subsequent work must treat **Revision 4** (`prev-1b6d9af1` / `39ded89fed4da1a721fa34d6ac392a70bc3096ea890560b8add9638f0d9baf7a`) as the canonical active baseline.
3. **Immutability of Historical Evidence**: Session `cal-adc1df15` is terminally `ACCEPTED` and locked.
4. **Stage Boundary**: Stage 1 Controlled Beta remains **AUTHORIZED**; Unrestricted Production remains **NOT_AUTHORIZED**.

---

## 8. Final Status

```text
================================================================================
PHASE 6.13.2.5D: PASS
PHASE 6.13.2.5E: PASS
PHASE 6.13.2.5F: PASS / CLOSED
ACTIVE REVISION: prev-1b6d9af1 (Revision 4)
ACTIVE CHECKSUM: 39ded89fed4da1a721fa34d6ac392a70bc3096ea890560b8add9638f0d9baf7a
================================================================================
```
