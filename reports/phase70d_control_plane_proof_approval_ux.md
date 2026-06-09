# Phase 70D — Control Plane Customer Proof Approval UX

**Repo:** ppos-control-plane  
**Status:** COMPLETE  
**Smoke:** 70 / 70 PASS  
**Build:** SUCCESS  
**Generated:** 2026-06-09

---

## Summary

Phase 70D adds the customer proof approval UX layer to the Control Plane. It exposes the proof approval lifecycle to operators (HumanReportPanel) and customers (PublicHumanReportPage), gates artifact access based on proof status, and safely sanitizes all customer-facing output.

---

## Files Created

| File | Purpose |
|---|---|
| `src/api/services/proofApprovalUxService.js` | Builds `proof_approval_ux` for operator and customer audiences |
| `src/ui/components/preflight/ProofApprovalPanel.tsx` | UI component for proof approval state display |
| `scripts/smoke_phase70d_control_plane_proof_approval_ux.js` | 70-test smoke suite |
| `reports/phase70d_control_plane_proof_approval_ux.json` | Machine-readable report |
| `reports/phase70d_control_plane_proof_approval_ux.md` | Human-readable report |

## Files Modified

| File | Change |
|---|---|
| `src/api/services/preflightHumanReportService.js` | Phase 70D extraction block, safe subset build, `proof_approval_governance` + `proof_approval_ux` in reportPayload |
| `src/api/services/artifactUxLabelService.js` | Phase 70D badge logic for `certified_pdf` and `fixed_pdf` |
| `src/ui/components/preflight/HumanReportPanel.tsx` | Integrates `ProofApprovalPanel` (operator view) |
| `src/ui/pages/public/PublicHumanReportPage.tsx` | Integrates `ProofApprovalPanel` (customer-safe view) |

---

## Approval States

| State | Meaning |
|---|---|
| `PROOF_NOT_REQUIRED` | No visual changes; no approval needed |
| `PROOF_REQUIRED` | Visual change detected; proof must be sent to customer |
| `PROOF_PENDING_CUSTOMER` | Proof available; awaiting customer decision |
| `PROOF_APPROVED` | Customer approved; visual proof gate satisfied |
| `PROOF_REJECTED_REUPLOAD_REQUIRED` | Customer rejected; new file upload required |

---

## Artifact UX Badges Added (Phase 70D)

| Badge | Tone | Context |
|---|---|---|
| Proof approval required | warning | `certified_pdf` or `fixed_pdf` when proof required but not sent |
| Awaiting customer approval | info | `certified_pdf` / `fixed_pdf` when `proof_status=PENDING` |
| Customer approved | success | `fixed_pdf` when `proof_status=APPROVED` |
| Customer rejected — reupload required | danger | `certified_pdf` / `fixed_pdf` when `proof_status=REJECTED` |

---

## Gate Logic

- `proof_required=true AND proof_status != APPROVED` → `production_blocked=true`
- `proof_status=REJECTED` → `certified_pdf` downgraded: `customer_visible=false`, `artifact_role=REVIEW_REQUIRED`
- `proof_status=PENDING` → `certified_pdf` downgraded similarly
- `proof_status=APPROVED` → visual proof gate cleared; **other governance gates still apply**

---

## Governance Policy

```
proof_approval_implies_production_certified = false
proof_approval_implies_standard_certified  = false
proof_approval_implies_print_ready         = false
proof_approval_satisfies                   = visual_proof_gate_only
rejection_requires_reupload                = true
customer_feedback                          = operator-only (never exposed to customer)
proof_id                                   = operator-only (never exposed to customer)
evidence raw paths                         = sanitized (blocked keys: command, local_path, raw_path, file_path, internal_id, ...)
```

---

## Conservative Merge Semantics

- `REJECTED` wins over `PENDING` (can never be downgraded)
- `APPROVED` cannot override `REJECTED` (once rejected, stays rejected)
- `proof_required=true` is additive — once set, never cleared

---

## Acceptance Criteria

| Criterion | Status |
|---|---|
| Customer proof approval displayed safely | PASS |
| Customer output sanitized (no raw paths, no internal IDs) | PASS |
| Approval required blocks production | PASS |
| Rejected proof blocks production | PASS |
| Approved proof unblocks visual gate only | PASS |
| No production overclaim | PASS |
| No standards overclaim | PASS |
| Build passes | PASS |
| Smoke passes (70/70) | PASS |

---

## Input Reference

```
../ppos-preflight-worker/reports/phase70b_worker_proof_approval_policy.json
```
