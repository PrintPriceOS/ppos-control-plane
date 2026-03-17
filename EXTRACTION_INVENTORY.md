# EXTRACTION_INVENTORY.md

This document provides a comprehensive inventory and classification of admin-related assets within the `extraction_admin_monolito` project, targeted for migration to the `ppos-control-plane` repository.

## Inventory Summary

- **Total identified assets:** 68
- **Domain:** Control Plane (Admin, Network Ops, Financial Ops, Governance)
- **Target environment:** `control.printprice.pro`

## Asset Inventory & Classification

| Artifact | Type | Location | Classification | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend** | | | | |
| `App.tsx` (Admin Routes) | Logic | `/` | `KEEP_BUT_REWIRE_LATER` | Extract routing logic (`/admin`, `/analytics`, `/connect`) and navigation. |
| `AdminDashboard.tsx` | Page | `/pages/` | `KEEP_FOR_CONTROL_PLANE` | Core dashboard shell for all admin tabs. |
| `AnalyticsPortal.tsx` | Page | `/pages/` | `KEEP_FOR_CONTROL_PLANE` | Business intelligence and platform metrics view. |
| `pages/admin/**` (18 files) | Pages | `/pages/admin/` | `KEEP_FOR_CONTROL_PLANE` | Specialized tabs: Audit, AutonomousOps, Tenants, NetworkOps, Financial, etc. |
| `pages/admin-help/**` (2 files) | Pages | `/pages/admin-help/` | `KEEP_FOR_CONTROL_PLANE` | Specialized help center for administrative users. |
| `pages/connect/**` (5 files) | Pages | `/pages/connect/` | `KEEP_FOR_CONTROL_PLANE` | Printer network onboarding and management portal. |
| `useAdminData.ts` | Hook | `/hooks/` | `KEEP_FOR_CONTROL_PLANE` | Main data-fetching hook for admin screens. |
| `adminApi.ts` | Lib | `/lib/` | `KEEP_BUT_REWIRE_LATER` | API client methods. Needs `BASE_URL` adjustment for `api.control.printprice.pro`. |
| `helpSearch.ts` | Lib | `/lib/` | `KEEP_FOR_CONTROL_PLANE` | Frontend search indexing for help articles. |
| `components/network/**` (7 files) | Comp. | `/components/network/` | `KEEP_FOR_CONTROL_PLANE` | Complex UI for Printer Nodes, Capacity, and Health. |
| `AIAuditModal.tsx` | Comp. | `/components/` | `KEEP_FOR_CONTROL_PLANE` | Critical for manual validation and audit review. |
| `EfficiencyAuditModal.tsx` | Comp. | `/components/` | `KEEP_FOR_CONTROL_PLANE` | Performance and cost-saving audit UI. |
| `index.css` (Admin Styles) | Style | `/` | `KEEP_BUT_REWIRE_LATER` | Extract Tailwind/CSS globals relevant to Admin UI. |
| **Backend** | | | | |
| `admin.js` | Route | `/routes/` | `KEEP_BUT_REWIRE_LATER` | Bulk of admin API. Convert Express logic to Fastify. |
| `adminControl.js` | Route | `/routes/` | `KEEP_BUT_REWIRE_LATER` | Operations controls (Queue, Jobs, Quarantine). Convert to Fastify. |
| `autonomyAdmin.js` | Route | `/routes/` | `KEEP_BUT_REWIRE_LATER` | Autonomy policy management. Convert to Fastify. |
| `connectAdmin.js` | Route | `/routes/` | `KEEP_BUT_REWIRE_LATER` | Printer network admin. Convert to Fastify. |
| `routingAdmin.js` | Route | `/routes/` | `KEEP_BUT_REWIRE_LATER` | Intelligent routing config. Convert to Fastify. |
| `pricingAdmin.js` | Route | `/routes/` | `KEEP_BUT_REWIRE_LATER` | Dynamic pricing config. Convert to Fastify. |
| `offersAdmin.js` | Route | `/routes/` | `KEEP_BUT_REWIRE_LATER` | Market offers oversight. Convert to Fastify. |
| `marketplaceAdmin.js` | Route | `/routes/` | `KEEP_BUT_REWIRE_LATER` | Federation Marketplace admin. Convert to Fastify. |
| `negotiationAdmin.js` | Route | `/routes/` | `KEEP_BUT_REWIRE_LATER` | SLA/Negotiation oversight. Convert to Fastify. |
| `commercialCommitmentAdmin.js` | Route | `/routes/` | `KEEP_BUT_REWIRE_LATER` | Contractual commitments. Convert to Fastify. |
| `autonomyFinanceAdmin.js` | Route | `/routes/` | `KEEP_BUT_REWIRE_LATER` | Financial autonomy (payouts/settlements). Convert to Fastify. |
| `requireAdmin.js` | M-ware | `/middleware/` | `KEEP_BUT_REWIRE_LATER` | RBAC/Auth logic. Adapt to Fastify `preHandler` hook. |
| `auditService.js` | Service | `/services/` | `KEEP_FOR_CONTROL_PLANE` | Centralized audit logger. |
| `networkOpsService.js` | Service | `/services/` | `KEEP_FOR_CONTROL_PLANE` | Network health & printer state management. |
| `autonomousOrchestrator.js` | Service | `/services/` | `KEEP_FOR_CONTROL_PLANE` | Policy execution engine. |
| `commercialCommitmentService.js` | Service | `/services/` | `KEEP_FOR_CONTROL_PLANE` | Legal/Business logic for network. |
| `connectService.js` | Service | `/services/` | `KEEP_FOR_CONTROL_PLANE` | Onboarding backend logic. |
| `csWorkflowService.js` | Service | `/services/` | `KEEP_FOR_CONTROL_PLANE` | Customer Success workflow state. |
| `economicRoutingService.js` | Service | `/services/` | `KEEP_FOR_CONTROL_PLANE` | Cost-optimization logic. |
| `engagementEngine.js` | Service | `/services/` | `KEEP_FOR_CONTROL_PLANE` | Behavioral signals analysis. |
| `financialLedgerService.js` | Service | `/services/` | `KEEP_FOR_CONTROL_PLANE` | Internal settlements tracking. |
| `marketplaceReadinessService.js`| Service | `/services/` | `KEEP_FOR_CONTROL_PLANE` | Marketplace trust/quality scores. |
| `marketplaceService.js` | Service | `/services/` | `KEEP_FOR_CONTROL_PLANE` | Core marketplace operations. |
| `notificationRegistry.js` | Service | `/services/` | `KEEP_FOR_CONTROL_PLANE` | System-wide alert categorization. |
| `payoutService.js` | Service | `/services/` | `KEEP_FOR_CONTROL_PLANE` | Financial disbursement logic. |
| `pricingIntelligenceService.js` | Service | `/services/` | `KEEP_FOR_CONTROL_PLANE` | ML/Heuristic pricing. |
| `productionSignalService.js` | Service | `/services/` | `KEEP_FOR_CONTROL_PLANE` | Real-time production telemetry. |
| `reportService.js` | Service | `/services/` | `KEEP_FOR_CONTROL_PLANE` | PDF/CSV generation for admins. |
| `db.js` | infra | `/services/` | `KEEP_BUT_REWIRE_LATER` | DB access. Switch to `ppos-shared-infra` DB modules. |
| `dbSchema.js` | infra | `/services/` | `LEGACY_REFERENCE_ONLY` | Schema source. Use for migration scripts only. |
| `server.js` | App | `/` | `LEGACY_REFERENCE_ONLY` | Reference for route mounting and middleware order. |
| **Common/Misc** | | | | |
| `types.ts` (Admin Parts) | Types | `/` | `KEEP_BUT_REWIRE_LATER` | Specific admin & network types to be extracted. |
| `constants.ts` (Admin Parts) | Const | `/` | `KEEP_BUT_REWIRE_LATER` | Admin specific constants. |

## Classification Legend

- **KEEP_FOR_CONTROL_PLANE**: High-value asset, move as is (with minimal path updates).
- **KEEP_BUT_REWIRE_LATER**: Core functionality that needs refactoring/translation (e.g., Express -> Fastify).
- **LEGACY_REFERENCE_ONLY**: Keep in the monolith repository but do not move; used to verify behavior.
- **DO_NOT_MOVE**: Asset belongs to the Public Preflight domain.
- **UNKNOWN_REQUIRES_REVIEW**: Ownership or technical dependency is unclear.
