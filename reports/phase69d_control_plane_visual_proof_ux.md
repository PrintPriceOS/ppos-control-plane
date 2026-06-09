# Phase 69D — Control Plane Visual Proof UX

**Repo:** ppos-control-plane  
**Result:** PASS  
**Smoke:** 20 / 20 PASS  
**Build:** SUCCESS  
**Generated:** 2026-06-09

---

## What Was Implemented

Phase 69D adds Control Plane UX for safely displaying visual diff / rendered proof information to operators and customers, consuming `visual_diff_governance` produced by upstream phases (69A Engine → 69B Worker → 69C Service).

---

## Files Modified

| File | Change |
|---|---|
| `src/api/services/preflightHumanReportService.js` | Extract `visual_diff_governance`, sanitize to safe subset, add wording to customer/operator summaries, add `artifact_ux` warnings, add to `reportPayload`, pass to `buildArtifactUxLabels` |
| `src/api/services/artifactUxLabelService.js` | Extract `visual_diff_governance`, add badges: "Visual review required", "Visual proof available", "Rendered comparison"; downgrade `certified_pdf` when visual review required |
| `src/ui/components/preflight/HumanReportPanel.tsx` | Integrate `VisualProofPanel` (operator view) |
| `src/ui/pages/public/PublicHumanReportPage.tsx` | Integrate `VisualProofPanel` (customer-safe view) |
| `src/ui/components/JobDetailDrawer.tsx` | Integrate `VisualProofPanel` in result tab (operator) |

## Files Created

| File | Purpose |
|---|---|
| `src/ui/components/preflight/VisualProofPanel.tsx` | React component displaying visual diff information safely |
| `scripts/smoke_phase69d_control_plane_visual_proof_ux.js` | Smoke test |
| `reports/phase69d_control_plane_visual_proof_ux.json` | Machine-readable report |
| `reports/phase69d_control_plane_visual_proof_ux.md` | This file |

---

## Governance Implementation

### `preflightHumanReportService.js`

- Extracts `visual_diff_governance` defensively from all job sources (job root, fix_summary, fix_audit, delta_summary, delta_report, report, artifact metadata, injectedJob).
- Merges conservatively: review flags are additive (once set, not cleared). Numeric values keep the maximum seen.
- Sanitizes evidence — blocks: `command`, `local_path`, `raw_path`, `file_path`, `internal_id`, `obj_`, `forensic_object_id`, `raw_stream`, `diff_images`, `thumbnails`.
- Thumbnail and diff image references are stored as `thumbnail_artifact_ids` / `diff_image_artifact_ids` (safe artifact IDs, never raw filesystem paths).
- Builds `safeVisualDiffGov` with: `production_certified: false`, `standard_certified: false` (always — visual diff is evidence generation only).
- Propagates to `certLevel`, `isReviewReq`, `isProdCert`, and `certified_pdf` downgrade when `visual_change_detected=true` or diff was required but not performed.
- Adds customer and operator summary wording when visual changes are detected, diff was skipped, or tool gap exists.
- Adds `artifact_ux.warnings` entries for visual change detection, missing diff, and tool gap.
- Passes `visual_diff_governance: safeVisualDiffGov` to both `customer` and `operator` calls to `buildArtifactUxLabels`.
- Emits `visual_diff_governance` in `reportPayload`.

### `artifactUxLabelService.js`

Three new badges for visually sensitive artifacts:

| Badge | Condition | Type | Tone |
|---|---|---|---|
| **Visual review required** | `visual_review_required=true` on `certified_pdf` or `fixed_pdf` | Downgrade | warning |
| **Visual proof available** | Proof available, diff performed, no change detected | `fixed_pdf` | info |
| **Rendered comparison** | Proof available, diff performed, change detected | `fixed_pdf` | warning |

Additional behavior:
- `certified_pdf` is hidden from customer (`customer_visible=false`) when `visual_review_required=true`.
- Operator warning added for render tool gap on `fixed_pdf`.
- Tooltip for "Rendered comparison" includes the max changed pixel ratio.

---

## VisualProofPanel.tsx

Safe React component that displays:

**Operator view:**
- Diff performed / visual change / proof artifacts / tool gap status cells
- Pages rendered, pages compared, max pixel Δ, avg pixel Δ
- Dimensions match check
- Render tool + version
- Thumbnail artifact ID chips (with fetch link via download-ticket API, no raw paths)
- Diff image artifact ID chips
- Limitations list
- Warnings
- Governance disclaimer

**Customer view:**
- Status cells (diff performed, visual change, proof availability, tool gap)
- Customer-safe thumbnail placeholder message (no raw paths, no internal IDs)
- Warnings

**Never shown in either view:**
- Raw file system paths
- Internal job or file IDs in image `src` attributes
- `production_certified` or `standard_certified` claims
- Any PDF/X or PDF/A certification language

### Integration points

| Panel | Audience | Position |
|---|---|---|
| `HumanReportPanel` | operator | After Operator Details, before CustomerRemediationPanel |
| `PublicHumanReportPage` | customer | After CustomerRemediationPanel |
| `JobDetailDrawer` (result tab) | operator | After artifact pool, before bundle seal |

---

## Smoke Tests — 20 / 20 PASS

| # | Test | Result |
|---|---|---|
| 1 | `visual_review_required` downgrades `certified_pdf` — hidden from customer, badge set | PASS |
| 2 | Proof available, no change → badge "Visual proof available", tone info | PASS |
| 3 | Proof available with change → badge "Rendered comparison", tone warning, pixel ratio in tooltip | PASS |
| 4 | Render tool gap → operator warning contains tool gap message | PASS |
| 5 | Safe evidence subset omits `local_path`, `diff_images`, `thumbnails`, `command` | PASS |
| 6 | `production_certified` / `standard_certified` always `false` in `visual_diff_governance` | PASS |

---

## Acceptance Criteria

| Criterion | Status |
|---|---|
| Visual proof displayed safely | PASS |
| Customer output sanitized (no raw paths, no internal IDs) | PASS |
| Visual changes require review | PASS |
| Missing visual diff blocks visual/destructive fix progression | PASS |
| No production overclaim | PASS |
| No standards overclaim | PASS |
| Build passes | PASS |
| Smoke passes (20/20) | PASS |

---

## Policy

> Visual diff is evidence generation only — it does not imply print-ready status, production certification, or PDF/X / PDF/A compliance.
