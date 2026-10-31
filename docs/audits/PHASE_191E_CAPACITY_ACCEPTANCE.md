# Phase 191E: Capacity Onboarding Acceptance

## 1. Scope
Configures indicative daily jobs and sheets limits at the site level, and individual throughput boundaries for active machines.

---

## 2. Validation Findings

- **Site Capacity Limits**:
  - Configures `daily_jobs_limit`, `daily_sheets_limit`, `working_days_per_week`, and `operating_hours_per_day` in `printhouse_site_capacities` table.
  - Multi-tenant boundary checks enforce that a site capacity entry cannot be created or updated for foreign sites.
- **Machine Capacity Constraints**:
  - Adds `indicative_daily_capacity` and `capacity_unit_name` directly to the `printhouse_machines` table.
  - Enables configuring machine boundaries (e.g. 15,000 sheets/day) for scheduling.
- **Indicative Only**:
  - All configurations represent indicative limits. Live job routing and real-time scheduling remain disabled.

---

## 3. Verification Evidence
- **Smoke test output**:
  ```text
  ✅ Site capacity configured
  ✅ Daily jobs limit matches
  ✅ Daily sheets limit matches
  ...
  ✅ Machine capacity config updated
  ✅ Indicative daily capacity matches
  ```
  All tests passed successfully.
