# Phase 193C / Phase 6.13.2.4B
## Incremental Calibration Locking Remediation & Governed C′ Acceptance — Final Closure

**Date:** 2026-08-23  
**Repository:** `ppos-control-plane`  
**Branch:** `fix/phase193c-incremental-locking`

---

## 1. Executive Summary

A production-observed calibration defect was identified during controlled Job C′ qualification.

The deterministic inverse pricing solver correctly identified the 10 active manufacturing rate paths for Job C′, but its proportional scaling algorithm applied the same calibration multiplier to all active paths, including paths already established by previously accepted calibration revisions.

This created a regression risk for previously accepted jobs.

The defect was reproduced, remediated, tested, deployed under controlled conditions, and subsequently verified through a fresh governed C′ calibration and acceptance.

Final status:

- Phase 193C deterministic solver suite: **24/24 PASS**
- Incremental calibration locking: **PASS**
- Historical established-path resolution: **PASS**
- Governed C′ acceptance: **PASS**
- Revision 3 active: **PASS**
- Regression replay A/B/C′: **PASS**

No marketplace activation, grant promotion, or unrestricted production authorization was performed.

---

# 2. Original Defect

Original C′ calibration session:

- Session: `cal-2b34345b`
- Run: `crun-f78ccd90`
- Status: `ACCEPTABLE_CANDIDATE`

Target:

- Manufacturing reference: **€1802.84**

Original run result:

- Before: **€269.97**
- After: **€1803.40**
- Residual: **€0.56**
- Percent residual: **0.0311%**

The run identified the correct 10 active paths, but scaled all of them with the common proportional multiplier.

Two paths were already established by previously accepted Job A:

- `cover_fixed_by_colours.4`
- `cover_var_per_1000_by_colours.4`

The defective candidate changed:

- `cover_fixed_by_colours.4`
  - `134.8284 → 277.8688`

- `cover_var_per_1000_by_colours.4`
  - `25.5357 → 52.6267`

For Job A at 2000 copies, this implied approximately:

- previous price: **€3449.97**
- projected defective price: **€3647.19**
- regression: approximately **+€197.22 / +5.72%**

This exceeded governance tolerance and blocked acceptance.

The original run `crun-f78ccd90` was therefore explicitly **NOT ACCEPTED**.

---

# 3. Root Cause

The solver constructed a `baseActive` set containing every active manufacturing path and applied a single proportional multiplier `alpha` to every entry:

```js
candidateActive[k] = Number((v * midAlpha).toFixed(6));
```

There was no distinction between:

* historically established paths
* newly introduced paths

Therefore a later calibration could recalibrate rates already established by previous accepted revisions.

---

# 4. Target Architecture

The incremental calibration model was changed to:

```text
accepted revision chain
        ↓
historical accepted active paths
        ↓
lockedRatePaths

current active paths
        ├── historically established → LOCKED
        └── novel paths              → CALIBRATABLE
```

Rules:

1. Previously established active paths retain their exact baseline snapshot value.
2. Only novel paths participate in proportional calibration.
3. Locked paths are omitted entirely from `proposedPatch`.
4. Historical locks are derived from accepted revision provenance, not from rate values.
5. Zero/non-zero state is never used to infer historical establishment.
6. Broken or inconsistent revision provenance fails closed.

---

# 5. Solver Remediation

Commit:

```text
135da5b
fix: preserve established pricing paths during incremental calibration
```

The solver API now supports:

```js
solve(session, nodeConfig = {}, options = {})
```

with:

```js
{
  lockedRatePaths
}
```

It derives:

```text
activeRatePaths
lockedRatePaths
calibratableRatePaths
```

During binary search:

* locked paths preserve the exact baseline snapshot value
* calibratable paths are multiplied by `alpha`

Locked paths are removed from `proposedPatch`.

The result provenance includes:

```json
{
  "lockedRatePaths": [...],
  "calibratableRatePaths": [...]
}
```

inside the persisted `identifiabilityReport`.

---

# 6. Historical Established-Path Resolver

New service:

```text
src/api/services/calibrationEstablishedPathsService.js
```

Responsibility:

```text
baseline checksum
→ matching immutable revision
→ source calibration run
→ active_rate_paths_json
→ parent_revision_id
→ repeat to root
→ union of historically established paths
```

Fail-closed protections include:

* tenant isolation
* printer-node isolation
* exact baseline checksum lookup
* maximum revision depth
* cycle detection
* missing source run rejection
* missing parent rejection
* malformed `active_rate_paths_json` rejection
* invalid revision source type rejection
* revision/run baseline checksum consistency
* revision/parent checksum continuity

Continuity rules:

```text
revision.baseline_rates_checksum
    ==
source_run.rate_snapshot_checksum

revision.baseline_rates_checksum
    ==
parent_revision.rates_checksum
```

---

# 7. Calibration Run Integration

`calibrationRunService` now performs:

```text
READY session
→ compute snapshot checksum
→ resolve node configuration
→ resolve historical locked paths
→ solver.solve(..., { lockedRatePaths })
→ persist governed run
```

The established-path resolver is read-only.

No acceptance or printer-node rates mutation occurs during calculation.

---

# 8. Test Coverage

## Solver regression test

Added:

```text
C8e — Incremental calibration locks previously established active paths and calibrates only novel paths
```

Verifies:

* two historical cover paths remain locked
* exactly eight C′ paths remain calibratable
* locked cover paths do not appear in `proposedPatch`
* governed residual remains acceptable

Result:

```text
PASS
```

## Established paths resolver test

New:

```text
tests/smoke_phase193c_established_paths.js
```

Coverage includes:

* no matching baseline → empty locks
* accepted revision chain → union of paths
* missing parent → fail closed
* malformed historical paths → fail closed
* revision/run checksum mismatch → fail closed

Result:

```text
PASS: established paths resolver
```

## Run integration test

New:

```text
tests/smoke_phase193c_incremental_run_integration.js
```

Verifies:

```text
snapshot checksum
→ resolveLockedPaths(...)
→ solver.solve(..., { lockedRatePaths })
→ mocked persistence
```

Result:

```text
PASS: incremental run integration
```

---

# 9. Pre-existing C5 Test Correction

A pre-existing Phase 193C test incorrectly claimed to perform a synthetic round-trip.

The test:

* created a `scaledActive` object
* did not use it to derive the target
* instead used `baselinePrice * 1.35`

Therefore the target was not guaranteed to correspond to an exactly reachable calibrated-rate configuration.

The test was rewritten to:

```text
baseline active rates
→ apply known alpha
→ construct canonical patch
→ evaluate canonical forward price
→ use that exact reachable price as target
→ solve inverse problem
```

Commit:

```text
2ce2119
test: make phase193c synthetic round-trip target reachable
```

Final Phase 193C result:

```text
24 passed
0 failed
```

---

# 10. Fresh Governed C′ Qualification

The defective session was superseded using the canonical service.

Old session:

```text
cal-2b34345b
CALCULATED → REJECTED
```

Reason:

```text
SUPERSEDED_AFTER_INCREMENTAL_LOCKING_REMEDIATION_135da5b
```

New session:

```text
cal-63f1503a
READY
```

Fresh baseline checksum:

```text
397d361b7cceeb3d28b04d3ff3fb69bb1f0be0d3374b2b2e83a4eeb168ece989
```

This corresponds to Revision 2:

```text
prev-0f4796c9
```

Commercial inputs inherited correctly:

```text
target manufacturing price = €1802.84

includesPaper      = true
includesBinding    = true
includesFinishing  = true
includesPackaging  = false
```

---

# 11. Corrected C′ Run

New run:

```text
crun-cdd40e16
```

Status:

```text
ACCEPTABLE_CANDIDATE
```

Result:

```text
enginePriceBefore  = €269.97
enginePriceAfter   = €1803.40
targetPrice        = €1802.84
absoluteResidual   = €0.56
percentResidual    = 0.0311%
warnings           = []
```

Active paths:

```text
10
```

Historically locked:

```text
cover_fixed_by_colours.4
cover_var_per_1000_by_colours.4
```

Calibratable novel paths:

```text
binding_ts_fixed_by_sections.20
binding_ts_var_per_1000_by_sections.20
interior_two_colour_fixed.16p
interior_two_colour_var.16p
paper_price_cover_by_kilo.offset
paper_price_interior_by_kilo.lux
uv_varnish.fixed
uv_varnish.var
```

The proposed patch contains only novel paths.

The two historical cover paths are absent from the patch.

Proposed patch checksum:

```text
134e73e06078a170d252c8463b74dd3cf5dedd2397df86b6dabf7a21ac27f4c6
```

---

# 12. Pre-Acceptance Regression Replay

Using Revision 2 + corrected C′ patch:

```text
Job A  → €3449.97
Job B  → €850.15
Job C′ → €1803.40
```

Therefore:

```text
A preserved ✅
B preserved ✅
C′ within governance tolerance ✅
```

---

# 13. Governed C′ Acceptance

Phase:

```text
6.13.2.4B — Governed C′ Acceptance
```

Explicit authorization was granted only for the corrected C′ run.

Acceptance:

```text
pacc-1ef732aa
```

Accepted run:

```text
crun-cdd40e16
```

New immutable revision:

```text
prev-3c025b51
```

Parent revision:

```text
prev-0f4796c9
```

Baseline checksum:

```text
397d361b7cceeb3d28b04d3ff3fb69bb1f0be0d3374b2b2e83a4eeb168ece989
```

Revision 3 checksum:

```text
727caec4cb4f3237dbc0db210303ebb2f21f40b8d63dd0e3d8f6f852633b0c0d
```

Session:

```text
cal-63f1503a
ACCEPTED
```

The printer node active rates checksum was independently recomputed and matches Revision 3 exactly.

---

# 14. Final Active-Rates Replay

Using the active `printer_nodes.rates_json` after acceptance:

```text
A      €3449.97
B       €850.15
C′     €1803.40
```

Result:

```text
A regression: NONE
B regression: NONE
C′ calibrated: PASS
```

---

# 15. Canonical Baseline

The new authoritative calibration baseline is:

```text
Revision 3
prev-3c025b51
```

Checksum:

```text
727caec4cb4f3237dbc0db210303ebb2f21f40b8d63dd0e3d8f6f852633b0c0d
```

Any future incremental calibration must resolve historically established paths from this revision chain.

---

# 16. Final Status

```text
PHASE 193C:
PASS
24 / 24 tests

INCREMENTAL LOCKING:
PASS

C′ QUALIFICATION:
PASS

C′ GOVERNED ACCEPTANCE:
PASS

ACTIVE REVISION:
prev-3c025b51

A REPLAY:
€3449.97 PASS

B REPLAY:
€850.15 PASS

C′ REPLAY:
€1803.40 PASS
```

---

# 17. Governance Boundary

This closure does NOT authorize:

* marketplace activation
* automatic stage promotion
* grant modification
* production dispatch expansion
* unrestricted production
* unsupervised calibration
* automatic acceptance of future jobs

Current wider production authorization remains unchanged:

```text
CONTROLLED_BETA:
AUTHORIZED
Stage 1 — pre-provisioned, single instance, supervised

UNRESTRICTED_PRODUCTION:
NOT_AUTHORIZED
```

---

# 18. Follow-up

Recommended next step:

1. Treat Revision 3 as the canonical baseline.
2. Do not modify the incremental locking architecture.
3. Use historical established-path locking for all subsequent calibration jobs.
4. Define the next Job D qualification independently.
5. Maintain explicit acceptance gates for each new calibration evidence set.
