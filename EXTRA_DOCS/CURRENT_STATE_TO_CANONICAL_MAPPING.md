# Current State to Canonical Mapping

This document defines the transition path for each artifact from the legacy monolith to the dedicated `ppos-control-plane` repository.

## Mapping Table

| Current Artifact | Current Role | Canonical Home | Action | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `App.tsx` (Admin Routing) | Navigation Entry | `src/App.tsx` | `split` | Extract Switch/Router logic into a dedicated Control Plane shell. |
| `pages/AdminDashboard.tsx` | Main UI | `src/pages/Dashboard/` | `move` | Direct transfer to the new UI structure. |
| `pages/admin/TenantManagement.tsx` | Multi-tenancy UI | `src/pages/Tenants/` | `move` | High priority for control plane. |
| `pages/admin/*.tsx` (Tabs) | Specific Modules | `src/pages/Modules/` | `move` | Preserve tab structure in new UI shell. |
| `pages/connect/*.tsx` | Printer UI | `src/pages/Network/` | `move` | Focus on printer onboarding and health. |
| `hooks/useAdminData.ts` | Data Fetching | `src/hooks/` | `move` | Update API base URL to point to `control.printprice.pro/api`. |
| `lib/adminApi.ts` | API Client | `src/lib/` | `move` | Add authentication header logic specific to Control Plane. |
| `routes/admin.js` | API Gateway | `routes/index.js` | `wrap` | Will become the primary API entry point for the BFF. |
| `routes/adminControl.js` | System Control | `routes/system.js` | `move` | Move to internal system routes. |
| `routes/*.js` (Admin Subs) | Sub-modules | `routes/modules/` | `move` | Backend counterparts to the UI tabs. |
| `services/networkOpsService.js`| Network Logic | `services/network/` | `move` | Core business logic for control plane. |
| `services/db.js` | Database Access | `lib/database.js` | `wrap` | Implement a persistent singleton connection for the new BFF. |
| `services/auditService.js` | Logging | `services/audit/` | `move` | Ensure all control plane actions are logged locally. |
| `middleware/requireAdmin.js` | Security | `middleware/auth.js` | `move` | Review token/key validation logic for the new domain. |

## Action Definitions
- **copy**: Replicate file exactly (use for shared utilities).
- **move**: Primary migration strategy; original will eventually be deleted.
- **split**: Extract specific code blocks (e.g., from `App.tsx`).
- **wrap**: Re-implement logic inside a new container/class.
- **retire**: Do not move; feature is deprecated.
- **defer**: Move in a later phase due to complex dependencies.
