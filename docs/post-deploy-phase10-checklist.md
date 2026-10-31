# Post-Deploy Checklist — Phase 10 Industrial Operations

## 1. Backend Connectivity & Health
- [ ] `/health` returns `UP` (not `DEGRADED`).
- [ ] `/api/admin/metrics/overview` returns real MySQL data.
- [ ] `ppos-control-plane` logs show no `ECONNREFUSED` for database.

## 2. Industrial Orchestration
- [ ] `/admin/industrial` loads without `ReferenceError`.
- [ ] Orchestration tab shows "Zero nodes" (if none connected) instead of a crash.
- [ ] `orchestrationService` plans a mock job successfully: `node scripts/test-orchestration-plan.js` (Manual test).

## 3. Artifact Registry
- [ ] `preflight_artifacts` table exists in DB.
- [ ] New artifacts from jobs appear in the Industrial Ops / Forensics UI.
- [ ] File size and checksums are correctly populated.

## 4. Operational Incidents
- [ ] Create a manual test incident: `curl -X POST ... /api/admin/orchestration/incidents`.
- [ ] Incident appears in the Registry tab.
- [ ] Severity and status are correctly rendered.

## 5. Lifecycle Governance
- [ ] Global Default Policy exists in `lifecycle_policies`.
- [ ] Lifecycle tab displays the active policies.
- [ ] "Sync Lifecycle" button returns a success result (transition count: 0 for new deploy).

## 6. Frontend Consistency
- [ ] Sidebar links for "Operations Control" work correctly.
- [ ] Dashboard KPIs are not displaying synthetic "MOCKED" badges unless expected.
- [ ] No broken images or HeroIcons.
