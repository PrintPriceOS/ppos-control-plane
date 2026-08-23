# PHASE 6.13.2.5C — CONTROLLED JOB-D CALCULATION AUDIT & FORENSICS REPORT

```text
================================================================================
PHASE 6.13.2.5C: CONTROLLED JOB-D CALCULATION REPORT
SESSION ID: cal-ad0bd0d5
RUN ID: crun-71d3a48e
STATUS: NO_SOLUTION (REMAINED_READY)
STAGE 1 CONTROLLED BETA: AUTHORIZED
UNRESTRICTED PRODUCTION: NOT_AUTHORIZED
ACCEPTANCE EXECUTED: NO (HARD STOP RESPECTED)
PRINTER NODE RATES MUTATION: ZERO (REVISION 3 PRESERVED)
================================================================================
```

---

## 1. Execution & Service Summary

1. **Calculation Invocation Count**: Exactly **1** (Hard idempotency rule enforced).
2. **Exact Governed Service / Route Used**: `calibrationRunService.executeRun(tenantId, sessionId, user)` (Canonical service mapping to `POST /api/printhouse/onboarding/pricing/calibrations/:id/calculate`).
3. **Session ID**: `cal-ad0bd0d5`
4. **Run ID**: `crun-71d3a48e`
5. **Run Status**: `NO_SOLUTION` (Correct fail-closed classification; session status remained `READY`).
6. **Solver Version**: `193C_v1_deterministic`
7. **Engine Price Before**: `€2,175.77`
8. **Engine Price After**: `€2,008.04` (Bounded at minimum scale factor $\alpha_{\min} = 0.050038$)
9. **Target Manufacturing Price**: `€1,790.14`
10. **Absolute Residual**: `€217.90`
11. **Percent Residual**: `12.1722%`
12. **Evaluations Count**: `32`
13. **Execution Duration**: `6 ms`

---

## 2. Active Path Breakdown & Isolation Analysis

14. **Active Path Count**: `8`
15. **Locked Path Count**: `6`
16. **Novel Path Count**: `2`

### Exact Active Path Ledger:
```text
LOCKED PATHS (6) — Preserved from Accepted Revisions (Job A & Job B):
  1. cover_fixed_by_colours.4          = 134.8284 (from Job A)
  2. cover_var_per_1000_by_colours.4   = 25.5357  (from Job A)
  3. interior_full_colour_fixed.16p    = 164.0616 (from Job A)
  4. interior_full_colour_var.16p      = 16.5880  (from Job A)
  5. paper_price_cover_by_kilo.mc      = 1.6237   (from Job B)
  6. paper_price_interior_by_kilo.offset = 2.5577 (from Job A)

NOVEL CALIBRATABLE PATHS (2):
  1. binding_pb_fixed_by_sections.12   (Baseline anchor: 0.1640)
  2. binding_pb_var_per_1000_by_sections.12 (Baseline anchor: 176.4000)
```

17. **Exact Proposed Patch**:
```json
{
  "binding_pb_fixed_by_sections": {
    "12": 0.0082
  },
  "binding_pb_var_per_1000_by_sections": {
    "12": 8.8267
  }
}
```
- Proposed Patch Checksum: `3c579be3c97c3bf5decc251c0ef462c292ed3bbf1027adbec9b3393979382220`

18. **Confirmation Proposed Patch Modifies Only Novel Paths**: **CONFIRMED (100% isolated to the 2 novel PB.12 paths)**.
19. **Confirmation All 6 Locked Paths Remained Unchanged**: **CONFIRMED (Zero historical paths modified)**.

---

## 3. Structural Identifiability & Infeasibility Forensics

20. **Identifiability Result**: `PRIOR_ANCHORED_CANDIDATE` (`UNDERDETERMINED_SINGLE_JOB`).
21. **Warnings**: `["Failed to converge within governed tolerance and bounds"]`.
22. **Error**: None (Solver executed deterministically to completion).

### Root Cause of Over-Determined Locked Lower Bound:
A physical and economic cost breakdown of Job D against the locked historical rates reveals:
- **Locked Interior Paper (`offset 115gsm` @ €2.5577/kg)**: `€1,944.00`
- **Locked Cover Paper (`mc 250gsm` @ €1.6237/kg)**: `€55.21`
- **Locked Printing & Finishing Costs**: `€0.00`
- **Total Fixed Physical Floor from Locked Leaves**: `€1,999.21`
- **Novel Binding Line (`binding_pb_*.12`)**: Scaled down to minimum bounds ($\alpha = 0.05$) yields `€8.83`.
- **Absolute Minimum Asymptotic Forward Price**: $\approx €2,008.04$.

Because the external commercial quote target is **€1,790.14**, the job target is **strictly below the physical paper cost (€1,999.21)** already locked and certified by Reference Job A (`offset @ €2.5577/kg`).

---

## 4. Governance & Convergence Verdicts

23. **Governance Tolerance Result ($\le €8.9507$)**: **`FAIL`** (Residual: `€217.90` > `€8.9507`).
24. **Strict Convergence Result ($\le €0.05$ & $\le 0.01\%$)**: **`FAIL`**.
25. **Calibration Run Count for Session `cal-ad0bd0d5`**: Exactly **1**.

---

## 5. Post-Calculation Production Immutability Verification

26. **Live Rates Checksum After Calculation**: `727caec4cb4f3237dbc0db210303ebb2f21f40b8d63dd0e3d8f6f852633b0c0d`
27. **Confirmation Live Rates Equal Revision 3**: **CONFIRMED (100% match)**.
28. **Confirmation Latest Pricing Revision Remains `prev-3c025b51`**: **CONFIRMED**.
29. **Confirmation No Acceptance Call Occurred**: **CONFIRMED**.
30. **Confirmation No Pricing Revision Was Created**: **CONFIRMED (0 revisions created)**.
31. **Confirmation No Manual SQL Mutation Was Used**: **CONFIRMED (`calibrationRunService` executed via canonical contract)**.

### Certified Live Regression Replay:
- Reference Job A: `€3,449.97` (0.00 EUR drift ✅)
- Reference Job B: `€850.15` (0.00 EUR drift ✅)
- Reference Job C′: `€1,803.40` (0.00 EUR drift ✅)

---

## 6. Final Recommendation

```text
================================================================================
STATUS: BLOCKED (MATHEMATICAL / COMMERCIAL CONFLICT)
FINDING: Target price (€1790.14) is below the immutable locked paper cost floor (€1999.21).
RECOMMENDATION: BLOCKED_COMMERCIAL_TARGET_BELOW_LOCKED_PAPER_FLOOR
DO NOT ACCEPT RUN OR CREATE REVISION.
================================================================================
```
