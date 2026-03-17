# CURRENT_STATE_TO_CANONICAL_MAPPING.md

This document maps current assets in the legacy monolith `extraction_admin_monolito/` to their canonical homes in the `ppos-control-plane` repository.

## Mapping Table

| Current Artifact | Current Role | Canonical Home | Action | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `App.tsx` (Admin logic) | Routing Shell | `src/ui/App.tsx` | **split** | Extract admin-only routes and high-level navigation. |
| `pages/AdminDashboard.tsx`| Dashboard Root | `src/ui/pages/AdminDashboard.tsx` | **move** | Primary entry point for Control Plane UI. |
| `pages/admin/*.tsx` | Feature Tabs | `src/ui/pages/admin/*.tsx` | **move** | Grouped by functional domain (Audit, Telecom, etc.). |
| `pages/connect/*.tsx` | Printer Portal | `src/ui/pages/connect/*.tsx` | **move** | Onboarding and printer health management. |
| `hooks/useAdminData.ts` | Data Provider | `src/ui/hooks/useAdminData.ts` | **move** | Update to point to `@ppos/control-plane` API. |
| `lib/adminApi.ts` | API Client | `src/ui/lib/adminApi.ts` | **wrap** | Re-bind to `api.control.printprice.pro`. |
| `routes/admin.js` | API Entry | `src/api/routes/admin.js` | **wrap** | Translation layer: Express -> Fastify. |
| `routes/adminControl.js` | System Ops | `src/api/routes/control.js` | **wrap** | Translation layer: Express -> Fastify. |
| `routes/*Admin.js` | Domain APIs | `src/api/routes/*.js` | **wrap** | Convert localized admin routes to Fastify gems. |
| `middleware/requireAdmin.js`| Authorization | `src/api/middleware/auth.js` | **wrap** | Convert to Fastify `preHandler` / Decorator. |
| `services/*Service.js` | Business Logic | `src/api/services/*.js` | **move** | Relocate core logic; update imports to shared-infra. |
| `services/db.js` | Data Access | N/A | **retire** | Replaced by canonical `@ppos/shared-infra/db`. |
| `server.js` | Root Entry | `server.js` | **retire**| Monolith server architecture is deprecated. |
| `types.ts` (Admin) | Type Defs | `src/api/types/` | **split** | Move admin-only types to Control Plane. |

## Action Definitions

- **copy**: Replicate asset in target while maintaining original in monolith (temporary).
- **move**: Relocate asset to target repository (deleting from source after validation).
- **split**: Extract specific relevant blocks into target; original stays in monolith (pruned).
- **wrap**: Re-implement logic in target using a new framework/wrapper (e.g., Express to Fastify).
- **retire**: Do not migrate; functionality is replaced by a newer or shared service.
- **defer**: Postpone migration until Phase 3 or later.
