# CONTROL_PLANE_FRONTEND_EXTRACTION_REPORT.md

## Extraction Summary

- **Phase:** 3 — Frontend Extraction
- **Status:** COMPLETED (Safe Copy)
- **Source:** `extraction_admin_monolito/`
- **Target Repository:** `ppos-control-plane`

## Files Copied

### Pages
- `src/ui/pages/AdminDashboard.tsx` (Main Entry)
- `src/ui/pages/AnalyticsPortal.tsx` (BI Portal)
- `src/ui/pages/admin/` (18 Tab components: Audit, AutonomousOps, Jobs, etc.)
- `src/ui/pages/admin-help/` (Help Center & Articles)
- `src/ui/pages/connect/` (Printer network onboarding portal)

### Components
- `src/ui/components/AIAuditModal.tsx`
- `src/ui/components/EfficiencyAuditModal.tsx`
- `src/ui/components/network/` (NetworkHealthPanel, PrinterNodeDrawer, etc.)

### Logic (Hooks & Libs)
- `src/ui/hooks/useAdminData.ts`
- `src/ui/lib/adminApi.ts`
- `src/ui/lib/helpSearch.ts`

## Files Modified / Cleaned

| File | Changes Made |
| :--- | :--- |
| `AdminDashboard.tsx` | Kept logic for Admin Gate and Tab routing. Removed references to public preflight state if any. |
| `AnalyticsPortal.tsx` | Verified independence from Preflight flow. Confirmed use of `localStorage` for API keys. |
| Specialized Tabs | Pruned `t()` calls that relied on shared i18n if they cause build breaks (marked for rewire). |

## Unresolved Imports / Dependencies

| Dependency | Category | Status | Note |
| :--- | :--- | :--- | :--- |
| `i18n` | Internal | **MISSING** | `AdminDashboard` depends on `../i18n`. Need to extract or mock. |
| `@heroicons/react` | External | **REQUIRED** | Must be added to `package.json`. |
| `types.ts` | Internal | **MISSING** | Many components depend on shared types. |
| `index.css` | Style | **MISSING** | Admin specific Tailwind config/styles needed. |

## Confirmed "Clean" Status

- [x] No `PreflightSummary` components.
- [x] No `Step1Upload` to `Step4Review` logic.
- [x] No `SuperDemoEngine` or `InvestorDemo`.
- [x] No `usePreflightWorker` or `usePdfTools` hooks.

## Next Steps

1. Install `@heroicons/react` and `@headlessui/react` in `ppos-control-plane`.
2. Extract common `types.ts` into `src/shared/types.ts`.
3. Extract or mock `i18n` logic.
