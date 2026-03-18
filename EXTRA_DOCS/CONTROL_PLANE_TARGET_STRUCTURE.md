# Control Plane Target Structure

This document outlines the proposed architecture for `ppos-control-plane` to accommodate the migrated administration and governance functionality while maintaining its dedicated role at `control.printprice.pro`.

## Proposed Folder Structure

```text
ppos-control-plane/
├── client/                     # [Control Plane UI]
│   ├── src/
│   │   ├── pages/
│   │   │   ├── admin/          # Migrated: Audit, Ops, Finance tabs
│   │   │   ├── connect/        # Migrated: Printer Network Portals
│   │   │   └── analytics/      # Migrated: Analytics Portal
│   │   ├── components/         # Shared Control Plane components (StatCards, Charts)
│   │   ├── hooks/              # useAdminData, usePreflightMonitor
│   │   └── services/           # adminApiClient (Axios/Fetch wrapper)
│   ├── public/                 # Static assets for the control domain
│   └── vite.config.ts          # Configured for control.printprice.pro
├── server/                     # [Control Plane API/BFF]
│   ├── routes/                 # Handlers (FASTIFY Conversion)
│   │   ├── admin/              # Aggregated admin routes
│   │   ├── network/            # Connect & Printer management
│   │   └── federation.js       # Regional health aggregation (Existing)
│   ├── middleware/             # RBAC and Security hooks
│   ├── services/               # Core logic (Migrated: NetworkOps, Audit, AutonomousOps)
│   ├── adapters/               # Database, Telemetry, and Cross-Region bridges
│   └── index.js                # Fastify entry point (Extended server.js)
├── docs/                       # Runbooks and API Specifications
├── infra/                      # Docker, Nginx, and Deployment YAMLs
└── package.json                # Root package with workspace support
```

## Migration Strategy: Express to Fastify
The legacy monolith uses Express, while the target uses Fastify. The migration will involve:
1. **Schema Validation**: Utilizing Fastify's native JSON schema validation for all `/api/admin` endpoints.
2. **Hook Lifecycle**: Replacing Express middleware with Fastify `onRequest` or `preHandler` hooks.
3. **Async Performance**: Leveraging Fastify's optimized serialization for large metrics payloads.

## Destination Mapping for Major Artifacts

| Legacy Monolith Source | Target Canonical Home | Justification |
| :--- | :--- | :--- |
| `pages/admin/TenantManagement.tsx` | `client/src/pages/admin/Tenants.tsx` | Logical grouping by domain. |
| `routes/connectAdmin.js` | `server/routes/network/nodes.js` | Clarifies that Connect is a network-level management module. |
| `services/networkOpsService.js` | `server/services/NetworkOpsService.js` | Core service layer remains in the server core. |
| `middleware/requireAdmin.js` | `server/middleware/adminAuth.js` | Standardizes security guards. |
| `lib/adminApi.ts` | `client/src/services/api.ts` | Backend-For-Frontend client logic. |

## Major Risk: Database Proximity
The Control Plane currently depends on the same database as the Product App.
- **Immediate Action**: The `server/adapters` must implement a secure, read-optimized connection to the main DB.
- **Future Goal**: Decouple Control Plane state into a dedicated governance database to ensure `control.printprice.pro` remains available even during product-side outages.
