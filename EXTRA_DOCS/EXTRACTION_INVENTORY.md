# Extraction Inventory: Admin & Control Plane Assets

This inventory catalogs all administration and control-plane related assets currently residing in `extraction_admin_monolito`. These assets are candidates for migration to the canonical `ppos-control-plane` repository.

## CONFIDENCE LEVEL: HIGH
The scanning of `App.tsx` routing and `server.js` mounting points has provided a comprehensive map of dependencies.

## Inventory Table

| Artifact | Type | Location | Classification | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend Assets** | | | | |
| `App.tsx` (Admin Routes) | Logic | `/` | `KEEP_BUT_REWIRE_LATER` | Admin routes (`/admin`, `/analytics`, `/connect`, `/admin/help`) must be moved to a new React entry point. |
| `AdminDashboard.tsx` | Page | `/pages` | `KEEP_FOR_CONTROL_PLANE` | Central hub for administrative actions. |
| `AnalyticsPortal.tsx` | Page | `/pages` | `KEEP_FOR_CONTROL_PLANE` | BI and performance reporting. |
| `pages/admin/*.tsx` | Pages | `/pages/admin` | `KEEP_FOR_CONTROL_PLANE` | 18 tabs including Audit, AutonomousOps, FinancialOps, TenantManagement, etc. |
| `pages/admin-help/*.tsx` | Pages | `/pages/admin-help` | `KEEP_FOR_CONTROL_PLANE` | Operator-facing documentation and help center. |
| `pages/connect/*.tsx` | Pages | `/pages/connect` | `KEEP_FOR_CONTROL_PLANE` | Printer network onboarding and management portals. |
| `useAdminData.ts` | Hook | `/hooks` | `KEEP_FOR_CONTROL_PLANE` | Core hook for fetching admin-level statistics. |
| `adminApi.ts` | Library | `/lib` | `KEEP_FOR_CONTROL_PLANE` | API client wrapper for admin endpoints. |
| `helpSearch.ts` | Library | `/lib` | `KEEP_FOR_CONTROL_PLANE` | Logic for help center search functionality. |
| **Backend Assets** | | | | |
| `routes/admin.js` | Router | `/routes` | `KEEP_FOR_CONTROL_PLANE` | Aggregator for all administrative API sub-routes. |
| `routes/adminControl.js` | Router | `/routes` | `KEEP_FOR_CONTROL_PLANE` | System-level control operations (state reset, overrides). |
| `routes/analyticsV2.js` | Router | `/routes` | `KEEP_FOR_CONTROL_PLANE` | Backend for the Analytics Portal. |
| `routes/connectAdmin.js` | Router | `/routes` | `KEEP_FOR_CONTROL_PLANE` | Printer node administration (approval, suspension). |
| `routes/routingAdmin.js` | Router | `/routes` | `KEEP_FOR_CONTROL_PLANE` | Global routing policy management. |
| `middleware/requireAdmin.js`| Middleware| `/middleware` | `KEEP_FOR_CONTROL_PLANE` | Authorization guard for all control plane endpoints. |
| `services/networkOpsService.js`| Service | `/services` | `KEEP_FOR_CONTROL_PLANE` | Core engine for network health and capacity monitoring. |
| `services/auditService.js` | Service | `/services` | `KEEP_FOR_CONTROL_PLANE` | Centralized auditing for admin actions. |
| `services/autonomousOrchestrator.js` | Service | `/services` | `KEEP_FOR_CONTROL_PLANE` | High-level automation logic (Marketplace / Offers). |
| `services/reportService.js` | Service | `/services` | `KEEP_FOR_CONTROL_PLANE` | Generation of management and tenant reports. |
| `services/db.js` | Service | `/services` | `KEEP_BUT_REWIRE_LATER` | Admin logic depends on DB access; needs a clean adapter in the new repo. |
| `server.js` (Routing map) | Server | `/` | `LEGACY_REFERENCE_ONLY` | Reference for how services and routes are wired. |

## Unknown / Requires Review
| Artifact | Type | Location | Classification | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `services/dbSchema.js` | Data | `/services` | `UNKNOWN_REQUIRES_REVIEW` | Contains full schema; may need to be split between "App Schema" and "Admin Schema". |
| `adapters/bpePayloadAdapter.js`| Adapter | `/adapters` | `UNKNOWN_REQUIRES_REVIEW` | Used in `networkOpsService`; check if it has public app dependencies. |
