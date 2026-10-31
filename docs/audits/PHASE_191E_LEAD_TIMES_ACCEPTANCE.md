# Phase 191E: Localized Lead Times Acceptance

## 1. Scope
Evaluates localized lead time configurations (timezone, working days, daily cutoff times) and production completion forecasting logic.

---

## 2. Localized Rules & Forecast Invariants

- **Cutoff Rollover Rule**:
  - Jobs received after the site's local cutoff time (e.g. `14:00` Europe/Madrid time) roll over to the next business day (starting at `09:00` local time).
- **Weekend / Non-Workdays Exclusion**:
  - Adds base lead time days (e.g. 2 days) by skipping non-working days (e.g. Saturdays and Sundays if not configured).
- **Transit Exclusions**:
  - Dynamic completion calculations estimate strictly the **production finish time**. Shipping / transit transit time is completely excluded.

---

## 3. Simulator Test Validation

Verified using `printhouseLeadTimeService.js` and local timezone offset math:
- **Test Case 1**: Job start Wednesday 10:00 Madrid (pre-cutoff, 2 base days). Expected Completion: Friday (2 business days).
  - ✅ **PASSED**
- **Test Case 2**: Job start Wednesday 15:00 Madrid (post-cutoff, 2 base days). Rolls start to Thursday. Expected Completion: Monday (skipping Saturday/Sunday).
  - ✅ **PASSED**
- **Test Case 3**: Job start Friday 20:00 Madrid (post-cutoff, 2 base days). Rolls start to Monday. Expected Completion: Wednesday.
  - ✅ **PASSED**
