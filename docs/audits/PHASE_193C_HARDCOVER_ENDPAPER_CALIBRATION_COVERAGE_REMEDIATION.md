# PHASE 6.13.2.5A.1 — HARDCOVER / ENDPAPERS CALIBRATION COVERAGE & BINDING-PRIOR GOVERNANCE REMEDIATION REPORT

```text
================================================================================
PHASE 6.13.2.5A.1 — HARDCOVER / ENDPAPER CALIBRATION COVERAGE & BINDING-PRIOR GOVERNANCE
STAGE 1 CONTROLLED BETA: AUTHORIZED
UNRESTRICTED PRODUCTION: NOT_AUTHORIZED
OPERATIONAL MODE: CODE + TEST REMEDIATION ONLY (ZERO DB MUTATIONS)
================================================================================
```

---

## 1. Executive Summary & Problem Remediation

During technical preparations for hardcover reference calibration (Job D qualification), an architectural audit of `@ppos/pricing-engine` and `deterministicInversePricingSolver.js` identified three critical coverage and governance defects:

1. **Endpaper Parameter Decoupling in Calibration Adapter**:
   The `buildPriceCalibrationAdapter` did not propagate explicit or defaulted endpaper parameters (`endpapers`, `endpapers_print`, `paper_type_endpaper`, `paper_weight_endpapers`) into canonical BPE evaluations.
2. **Missing Active Endpaper Dimensions in Inverse Solver**:
   The deterministic inverse solver omitted endpaper printing and sheet waste leaf dimensions (`endpaper_fixed_by_colours`, `endpaper_var_per_1000_by_colours`, `paper_endpapers_fixed_by_colours`, `paper_endpapers_var_per_1000_by_colours`, `paper_price_endpaper_by_kilo`) from `extractActiveRatePaths()` and `buildPatchFromActiveRates()`.
3. **Cross-Family Binding Prior Pollution**:
   The solver applied generic perfect-bound (`pb`) safe calibration priors (`0.164 €/book`, `14.7 €/1000`) across unrelated binding families (`hc`, `ss`, `ts`, `wo`, `sp`), silently injecting synthetic perfect-bound constants instead of failing closed on unanchored zero leaves.

### Remediation Applied:
- **Adapter Standardized Defaults**: When `binding_method === 'hardcover'` and endpaper fields are omitted, the adapter automatically resolves canonical industrial defaults (`endpapers: 'standard'`, `endpapers_print: '4/0'`, `paper_type_endpaper: 'offset'`, `paper_weight_endpapers: 115`), exactly matching `PriceEngine.js` behavior.
- **Full Endpaper Rate Path Extraction & Patching**: Hardcover specs dynamically extract all 5 participating endpaper leaf paths (supporting front and reverse color permutations, e.g. `4/0`, `1/0`, `4/1`, `0/0`), and construct exact nested patch structures.
- **Strict Binding-Prior Isolation & `UNQUALIFIED_ZERO_ANCHOR` Governance**: Binding priors (`0.164`, `14.7`) are strictly isolated to `binding_pb_*`. Non-PB binding families (`hc`, `ss`, `ts`, `wo`, `sp`) have no default priors and throw `UNQUALIFIED_ZERO_ANCHOR` (with `{ ratePath }` metadata) when encountering an active calibratable zero leaf.
- **Historical Locked Rate Invariant**: Historically established rate paths in `lockedRatePaths` preserve their exact baseline value (even if 0.0), receive no synthetic priors, are omitted from `proposedPatch`, and do NOT trigger `UNQUALIFIED_ZERO_ANCHOR`.

---

## 2. Technical Implementation Details

### A. Adapter Endpaper Normalization (`src/api/services/buildPriceCalibrationAdapter.js`)
```javascript
// Endpaper semantics
let endpapers = bookSpec.endpapers !== undefined ? bookSpec.endpapers : null;
let endpapersPrint = bookSpec.endpapers_print !== undefined ? bookSpec.endpapers_print : null;
let paperTypeEndpaper = bookSpec.paper_type_endpaper || 'offset';
let paperWeightEndpapers = Number(bookSpec.paper_weight_endpapers) || 115;

// Hardcover defaults matching canonical PriceEngine / Normalizer
if (bindingCode === 'hc') {
    if (endpapers === null || endpapers === undefined) endpapers = 'standard';
    if (!endpapersPrint) endpapersPrint = '4/0';
} else if (endpapers === null || endpapers === undefined) {
    endpapers = 'none';
    if (!endpapersPrint) endpapersPrint = 'none';
}
```

### B. Solver Active Endpaper Rate Paths (`src/api/services/deterministicInversePricingSolver.js`)
```javascript
// Endpapers (active only when endpapers is not 'none')
if (p.endpapers && p.endpapers !== 'none') {
    const epPrint = String(p.endpapersPrint || '4/0');
    const hasSlash = epPrint.includes('/');
    const frontCols = hasSlash ? parseInt(epPrint.split('/')[0] || '0', 10) : 0;
    const revCols = hasSlash ? parseInt(epPrint.split('/')[1] || '0', 10) : 0;

    // Endpaper print colors (front & reverse if > 0)
    if (frontCols >= 1 && frontCols <= 5) {
        paths.push(`endpaper_fixed_by_colours.${frontCols}`);
        paths.push(`endpaper_var_per_1000_by_colours.${frontCols}`);
    }
    if (revCols >= 1 && revCols <= 5) {
        paths.push(`endpaper_fixed_by_colours.${revCols}`);
        paths.push(`endpaper_var_per_1000_by_colours.${revCols}`);
    }

    // Paper sheets print mode for endpaper paper waste
    let printMode = 'one';
    if (frontCols === 1) printMode = 'two';
    else if ([2, 3, 4].includes(frontCols)) printMode = 'full';
    else if (frontCols === 0) printMode = 'one';

    paths.push(`paper_endpapers_fixed_by_colours.${printMode}`);
    paths.push(`paper_endpapers_var_per_1000_by_colours.${printMode}`);
    paths.push(`paper_price_endpaper_by_kilo.${p.paperTypeEndpaper || 'offset'}`);
}
```

### C. Fail-Closed Prior Governance & Locked Invariant
```javascript
// Family-specific binding priors: PB is historically governed (0.164, 14.7). Other families do NOT inherit PB priors.
let bindFixedPrior = null;
let bindVarPrior = null;
if (p.bindingCode === 'pb') {
    bindFixedPrior = 0.164;
    bindVarPrior = 14.7;
}
```
If an active, calibratable rate path has an explicit `0.0` and no governed prior, the solver immediately halts execution:
```javascript
const err = new Error(`UNQUALIFIED_ZERO_ANCHOR: ${pathString}`);
err.code = 'UNQUALIFIED_ZERO_ANCHOR';
err.ratePath = pathString;
throw err;
```

---

## 3. Dedicated Verification Suites

Two dedicated test suites were implemented and verified with 100% pass rates:

### Suite 1: `tests/smoke_phase193c_hardcover_endpaper_coverage.js` (9/9 PASS)
- **Test A**: Hardcover without explicit endpaper fields resolves to `standard`, `4/0`, `offset`, `115gsm`.
- **Test B**: Standard hardcover (4/0, offset) activates exactly the expected endpaper & HC paths.
- **Test C**: Explicit `endpapers = "none"` does not activate endpaper paths.
- **Test D**: Printed `1/0` vs unprinted `0/0` endpapers produce distinct active path sets.
- **Test E**: Reverse-side print (e.g. `4/1`) includes both front and reverse endpaper color paths.
- **Test F**: Active calibratable endpaper leaf with explicit zero and no prior fails closed with `UNQUALIFIED_ZERO_ANCHOR`.
- **Test G**: Hardcover binding variable zero is not promoted to PB prior (`14.7`) and fails closed with `UNQUALIFIED_ZERO_ANCHOR`.
- **Test J**: Historically locked zero rate is preserved exactly (no prior injected, no failure, omitted from proposed patch).
- **Test L**: `buildPatchFromActiveRates` constructs correct nested endpaper paths.

### Suite 2: `tests/smoke_phase193c_binding_prior_governance.js` (6/6 PASS)
- **Test H**: Documented PB prior behavior promotes missing/zero PB rates with governed priors.
- **Test I**: Cross-family isolation verifies that zero variable binding rates for `hc`, `ss`, `ts`, `wo`, and `sp` fail closed with `UNQUALIFIED_ZERO_ANCHOR` without cross-family pollution.

---

## 4. Full Phase 193 Regression Suite Results

```text
================================================================================
TEST SUITE SUMMARY
================================================================================
- smoke_phase193c_hardcover_endpaper_coverage.js:  9 / 9  PASS ✅
- smoke_phase193c_binding_prior_governance.js:     6 / 6  PASS ✅
- smoke_phase193c_inverse_solver.js:              24 / 24 PASS ✅
- smoke_phase193c_established_paths.js:                  PASS ✅
- smoke_phase193c_incremental_run_integration.js:        PASS ✅
- smoke_phase193h8c61131311_revision_lineage:      5 / 5  PASS ✅
- smoke_phase193h8c611368_acceptance_audit:        5 / 5  PASS ✅
- smoke_phase193h8c611367_acceptance_schema:       4 / 4  PASS ✅
- smoke_phase193h8c611364_proposed_patch:          4 / 4  PASS ✅
- smoke_phase193h8c61322_multi_reference:          6 / 6  PASS ✅
================================================================================
TOTAL: ZERO REGRESSIONS, ALL CRITICAL GOVERNANCE PATHS VALIDATED
================================================================================
```

---

## 5. Live Production Baseline Preservation

- **Production Node**: `node-329a3bc4`
- **Tenant ID**: `ph-707a5869`
- **Active Pricing Revision**: `prev-3c025b51` (Revision 3)
- **Revision 3 Rates Checksum**: `727caec4cb4f3237dbc0db210303ebb2f21f40b8d63dd0e3d8f6f852633b0c0d`
- **Certified Tri-Reference Replays**:
  - Reference Job A: `€3,449.97` ($\Delta = €0.00$)
  - Reference Job B: `€850.15` ($\Delta = €0.00$)
  - Reference Job C′: `€1,803.40` ($\Delta = €0.00$)
- **Operating Boundary**: `Stage 1 Controlled Beta` **AUTHORIZED**; `Unrestricted Production` **NOT_AUTHORIZED**.
