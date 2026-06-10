# Phase 71D — Control Plane Printhouse Handoff Package UX

**Repo:** ppos-control-plane
**Status:** COMPLETE
**Smoke:** 88 / 88 PASS
**Build:** SUCCESS
**Generated:** 2026-06-10

---

## Summary

Phase 71D adds a controlled, sanitized **printhouse handoff package** to the Control Plane. It bundles the approved production artifact reference (when release-gated), the human report and fix audit summaries, validation report summary, artifact trust, warnings, payment/invoice/production-unlock status, sanitized order/customer metadata, and a sanitized file access audit — exposed to operators as a single packaging/delivery manifest for printhouses.

The package is a **packaging manifest, not a new certification authority**: the Control Plane re-validates `package_ready` against its own production/review gates (can only downgrade, never upgrade, the upstream worker/service value), and additionally requires invoice issuance, payment confirmation, and production unlock before the approved artifact reference is exposed.

---

## Files Created

| File | Purpose |
|---|---|
| `src/api/services/productionHandoffPackageService.js` | Builds the handoff package: release gate evaluation, order/payment/file-access lookups, sanitization |
| `src/ui/components/preflight/ProductionHandoffPackagePanel.tsx` | UI component for the handoff package (operator view) |
| `scripts/smoke_phase71d_control_plane_printhouse_handoff_package.js` | 88-test smoke suite |
| `reports/phase71d_control_plane_printhouse_handoff_package.json` | Machine-readable report |
| `reports/phase71d_control_plane_printhouse_handoff_package.md` | Human-readable report |

## Files Modified

| File | Change |
|---|---|
| `src/api/services/preflightHumanReportService.js` | Phase 71D extraction block: defensive multi-source extraction, conservative merge, sanitization, and final-authority recomputation of `production_package_governance` exposed in `reportPayload` |
| `src/api/routes/adminPreflightJobs.js` | New `GET /jobs/:jobId/production-handoff-package` route, audit-logged as `PREFLIGHT_PRODUCTION_HANDOFF_PACKAGE_VIEWED` |
| `src/ui/lib/adminApi.ts` | New `getAdminPreflightProductionHandoffPackage(jobId, orderId?)` fetcher |
| `src/ui/components/preflight/HumanReportPanel.tsx` | Integrates `ProductionHandoffPackagePanel` (operator view), conditioned on `report.production_package_governance` |

---

## Package Contents

| Section | Source |
|---|---|
| `approved_artifact` (type + hash) | Only included when `package_release_gate.ready === true` |
| `included_reports` | From `production_package_governance.included_reports` |
| `human_report_summary` | `recommended_next_action`, `review_required`, `production_certified`, `highest_risk_level` |
| `fix_audit_summary` | `applied_count`, `skipped_count`, `failed_count` |
| `validation_report_summary` | From `standards_certification_governance` + `standard_claimed`, `null` if unavailable |
| `artifact_trust` | From human report |
| `warnings` | Preflight warnings + blocked governance domains surfaced as warnings |
| `payment_status` | `invoice_status`, `payment_status`, `production_unlock_status` |
| `order_summary` | `order_id`, `status`, `printhouse_id`, `customer_name`, `total`, `currency` — **no email/phone/address** |
| `file_access_audit` | Sanitized `PRINTHOUSE_FILE_*` / `PRINTHOUSE_HANDOFF_*` events — actor, role, event type, timestamp only |

---

## Package Release Gate

The package can only be released (i.e. `approved_artifact` exposed) when **all** of the following hold:

1. `production_package_governance.package_ready === true` (Control Plane final authority)
2. `blocked_by_governance_domains` is empty
3. `invoice.status === 'ISSUED'`
4. `payment.status === 'PAYMENT_CONFIRMED'`
5. `production_unlock.status === 'PRODUCTION_UNLOCKED'`

| Blocker code | Meaning |
|---|---|
| `PREFLIGHT_PACKAGE_NOT_READY` | Upstream `package_ready=false` (worker/service gates not satisfied) |
| `GOVERNANCE_DOMAINS_BLOCKING` | One or more governance domains still blocking |
| `INVOICE_NOT_ISSUED` | Order invoice not yet issued |
| `PAYMENT_NOT_CONFIRMED` | Payment not confirmed |
| `PRODUCTION_NOT_UNLOCKED` | Production unlock not granted |

When the gate is not satisfied, `approved_artifact` is `null`, but `included_reports`, `human_report_summary`, `fix_audit_summary`, `warnings`, and `payment_status` remain visible for operator triage.

---

## New Endpoint

```
GET /api/admin/preflight/jobs/:jobId/production-handoff-package?orderId=<optional>
```

- Auth: `X-Admin-Api-Key` (existing admin middleware)
- Returns 404 if the underlying human report is unavailable
- Returns 500 with `{ ok: false, error: { code: 'PRODUCTION_HANDOFF_PACKAGE_ERROR', message } }` on unexpected errors
- Logs `PREFLIGHT_PRODUCTION_HANDOFF_PACKAGE_VIEWED` via the preflight admin audit log

---

## Governance Policy

```
handoff_package_is_certification_authority = false
handoff_package_is_packaging_manifest      = true
package_ready_recomputed_at_control_plane  = true (final authority — can only downgrade)
evidence raw paths                         = sanitized (blocked keys: command, local_path, raw_path, file_path, internal_id, ...)
order_summary                              = no PII (no email, phone, address)
file_access_audit                          = no tokens, no raw storage paths
```

---

## Acceptance Criteria

| Criterion | Status |
|---|---|
| Only approved artifact included when release gate ready | PASS |
| Reports (human report, fix audit, validation, included_reports) included | PASS |
| Warnings (incl. blocked governance domains) preserved | PASS |
| Blocked jobs cannot be handed off (approved_artifact withheld) | PASS |
| Customer/private data scoped correctly (no PII, no tokens) | PASS |
| Build passes | PASS |
| Smoke passes (88/88) | PASS |

---

## Input Reference

```
../ppos-preflight-service/reports/phase71c_service_production_package_exposure.json
```
