# PHASE 193F — Quick Calibration Creation Flow & Provenance Audit
## Remediating Lifecycle & Preserving Phase 193B Contract Boundaries

> **Status**: **COMPLETE / PASS**  
> **Classification**: **EXPLICIT CREATION & FIELD PROVENANCE REMEDIATED**  
> **Backend Contract**: **UNTOUCHED / STRICT VALIDATION INTACT**

---

### 1. Root Cause Analysis

1. **Premature Auto-Creation on Mount**:
   - `QuickCalibrationPanel.tsx` previously executed `createSession()` inside a mount `useEffect()`.
   - It sent `{ printerNodeId, referenceBookName }` without `bookSpec` or `targetManufacturingPrice`.
   - `calibrationSessionService.createSession()` strictly validates `validateBookSpec(body.bookSpec)` and `targetManufacturingPrice > 0`. Because the payload was empty, the backend returned **`400 INVALID_BOOK_SPEC`**.
2. **Fake Confirmed Badges**:
   - The UI previously populated `draftSpec` with hardcoded defaults (1000 copies, 2450 EUR) and inferred `Confirmed` if the value was non-empty.

---

### 2. Remediated Architecture (Option B — Explicit Flow)

```text
1. Mount / Initial State
   QuickCalibrationPanel mounted
   ├── Session: null (status: LOCAL_DRAFT)
   ├── Draft Spec: empty (copies: undefined, etc.)
   ├── Draft Commercials: empty (targetManufacturingPrice: null)
   └── Zero POST requests to /pricing/calibrations on mount

2. Input & AI Extraction
   Manager inputs parameters / chats with assistant
   ├── Unfilled fields => "Missing" (rose badge)
   ├── Extracted fields => "AI Extracted" (blue badge)
   └── Hand-edited fields => "Draft" (amber badge)

3. Explicit Save & Validation Gate
   Manager clicks [ Apply Extracted Details ] or [ Ready to Calibrate ]
   ├── Frontend pre-validates all mandatory 193B fields
   ├── If incomplete => displays actionable list of Missing fields (no POST sent)
   └── If complete & valid =>
       - If no session => calls createSession({ printerNodeId, bookSpec, targetManufacturingPrice, ... })
       - If session exists => calls updateDraftSession(...)
       - Marks saved fields as "Confirmed" (green badge)
```

---

### 3. Changed Files

1. **`src/ui/lib/printhouseCalibrationApi.ts`**:
   - Updated `createSession` to accept `CreateCalibrationSessionPayload` matching the exact `193B` contract.
2. **`src/ui/components/printhouse/pricing/quick-calibration/QuickCalibrationPanel.tsx`**:
   - Removed `initSession` from `useEffect`.
   - Initialized draft states cleanly without artificial defaults.
   - Added pre-POST validation `validateDraftForCreation`.
   - Handled session creation on explicit Apply/Save.
3. **`src/ui/components/printhouse/pricing/quick-calibration/CalibrationStructuredSummary.tsx`**:
   - Updated `getBadge` to enforce explicit provenance: `Missing` vs `AI Extracted` vs `Confirmed` vs `Draft`.
4. **`tests/smoke_phase193f_quick_calibration_ui.js`**:
   - Added regression tests `F24`–`F30` covering mount behavior, empty initial state, field provenance, contract validation, and backend integrity.

---

### 4. Verification Evidence

```text
✓ Phase 193F Quick Calibration UI:     30 passed / 0 failed
✓ Phase 193E Conversational Assistant: 26 passed / 0 failed
✓ Phase 193D Governed Acceptance:       29 passed / 0 failed
✓ Phase 193C Deterministic Solver:      23 passed / 0 failed
✓ Phase 193B Calibration Foundation:    59 passed / 0 failed
✓ Migration Baseline Integrity:         151 SQL files / 0 errors / 0 collisions
✓ RC20 Canonical Pricing Suite:         ALL PASSED
✓ Production Build (npm run build):     PASS
```

> [!NOTE]
> Backend validation in `src/api/services/calibrationSessionService.js` was **not weakened or modified**. All strict guard rails and fail-closed checks remain intact.
