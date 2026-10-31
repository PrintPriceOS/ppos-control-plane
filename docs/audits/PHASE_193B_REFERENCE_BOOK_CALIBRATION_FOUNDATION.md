# PHASE 193B — Reference Book Calibration Session & Provenance Foundation
## Audit & Verification Report

> **Auditor**: Google Deepmind (Antigravity)
> **Branch**: `ppos-control-plane`
> **Date**: 2026-08-20
> **Status**: **COMPLETE / PASS**
> **Test Suite**: `tests/smoke_phase193b_calibration_foundation.js` (**59 passed / 0 failed**)

---

## 1. Executive Summary

Phase 193B implements the durable persistence, validation, ambiguity detection, and provenance foundation for **Reference Book Calibration Sessions** in `ppos-control-plane`.

Key properties established:
- **Canonical Physical-Job Taxonomy**: Persists reference job specifications in physical production terms (`'1/1'`, `'4/4'`, `'4/0'`, `'perfect bound'`, `'hardcover'`), strictly rejecting internal rate card selectors (`'one'`, `'full'`, `'pb'`, `'hc'`).
- **Identity & Scope**: Uses `printer_nodes.id` as the globally unique authorization and persistence anchor, paired with `printer_node_name_snapshot` for human provenance.
- **Nullable Inclusion Semantics**: Fields `includes_paper`, `includes_binding`, `includes_finishing`, and `includes_packaging` are `NULL` during `DRAFT` and must be explicitly answered (`true` or `false`) to pass the preflight ambiguity gate before transitioning to `READY`.
- **Immutable Rates Snapshot**: Captured exclusively at the `READY` transition boundary with deterministic SHA-256 checksum hashing.
- **Strict State Machine**: `DRAFT` $\to$ `READY` $\to$ `REJECTED`. No rate mutation occurs, and `/calculate` and `/accept` are excluded from Phase 193B scope.

---

## 2. Migration 146 Rationale & Baseline Alignment

- **Baseline Pre-193B**: 148 SQL migration entries in baseline, highest prefix was `145` (due to 3 approved historical collisions `013`, `014`, `015`).
- **Phase 193B Migration**: `migrations/146_phase193b_calibration_session_foundation.sql`.
- **Properties**: Pure additive DDL creating `printhouse_pricing_calibration_sessions` with foreign keys to `tenants` and `printer_nodes`.

---

## 3. Physical-Job Data Contract

| Field | Governed Values | Rejected Internal Selectors |
|---|---|---|
| `interior_print` | `'1/1'`, `'2/2'`, `'4/4'` | `'one'`, `'two'`, `'full'` |
| `cover_print` | `'1/0'`, `'1/1'`, `'2/0'`, `'2/2'`, `'3/0'`, `'3/3'`, `'4/0'`, `'4/4'`, `'5/0'`, `'5/5'` | `'1'`, `'2'`, `'3'`, `'4'`, `'5'` |
| `binding_method` | `'perfect bound'`, `'saddle stitch'`, `'thread sewn'`, `'hardcover'`, `'wire-o'`, `'spiral'` | `'pb'`, `'ss'`, `'ts'`, `'hc'`, `'wo'`, `'sp'` |
| `lamination` | `'gloss'`, `'matt'`, `'varnish'`, `null` | Unsupported strings |
| `uv_varnish` | `true`, `false` | — |
| `delivery_country` | Uppercase ISO-2 (`'ES'`, `'DE'`, `'FR'`, etc.) | Lowercase or full country names |

---

## 4. Verification & Regression Evidence

1. **Smoke Suite**: `smoke_phase193b_calibration_foundation.js`: **59 passed / 0 failed**.
2. **Regression Suites**:
   - `smoke_phase192_9_rc20_3_2_setup_auth_and_icon_integrity.js`: **10 passed / 0 failed**.
   - `smoke_phase192_8_rc20_3_marketplace_adjacent_tabs_isolation.js`: **30 passed / 0 failed**.
   - `smoke_phase192_7_rc20_2_marketplace_tenant_isolation.js`: **30 passed / 0 failed**.
3. **Production Build**: `npm run build`: **PASS (built in 11.23s, 0 errors)**.

---

## 5. Database Safety Confirmation

- **No migration executed against MySQL/production.**
- **No active pricing records mutated.**
- **Zero destructive DB operations.**
