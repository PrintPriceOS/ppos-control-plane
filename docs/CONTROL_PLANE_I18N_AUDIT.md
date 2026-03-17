# CONTROL_PLANE_I18N_AUDIT

**Version**: 1.9.0
**Domain**: UX & Localization

## 🔍 Audit Summary

| Dimension | Status | Detail |
| :--- | :--- | :--- |
| **Current Implementation** | 🔴 STUB | `src/ui/i18n.tsx` is a non-functional stub that returns keys instead of values. |
| **Visible Issues** | 🔴 CRITICAL | Raw keys like `admin.title`, `admin.tabs.overview` are rendered to the operator. |
| **Legacy Dictionary** | 🟢 RECOVERED | Both `en.ts` and `es.ts` were found in `extraction_admin_monolito/i18n`. |
| **Key Coverage** | 🟢 HIGH | The legacy dictionary contains almost all `admin.*` keys used in the dashboard. |

## 📋 Required Keys (Sample)
Based on `AdminDashboard.tsx` and related pages:
- `admin.title`
- `admin.subtitle`
- `admin.tabs.overview`
- `admin.tabs.tenants`
- `admin.tabs.jobs`
- `admin.tabs.errors`
- `admin.tabs.audit`
- `admin.tabs.controls`
- `admin.kpi.*`
- `admin.queue.title`

## 🛠️ Recovery Choice
**Choice**: Full Recovery of Baseline Dictionary.
The legacy `en.ts` and `es.ts` are high quality and already contain the necessary mapping for the extracted admin logic. I will integrate them directly into the new `ppos-control-plane` to restore readability immediately.
