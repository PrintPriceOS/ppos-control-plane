# CONTROL_PLANE_TARGET_STRUCTURE.md

This document outlines the proposed target structure for the `ppos-control-plane` repository to host the migrated admin and control-plane functionality.

## Proposed Folder Structure

```text
ppos-control-plane/
├── src/
│   ├── ui/                   # Control Plane UI (Vite + React)
│   │   ├── components/       # Shared UI components (Admin Tables, Modals)
│   │   ├── hooks/            # Frontend hooks (useAdminData, usePrinterSync)
│   │   ├── lib/              # Frontend libraries (API clients, Utils)
│   │   ├── pages/            # Page-level components
│   │   │   ├── admin/        # Migrated tabs (Audit, Tenants, etc.)
│   │   │   └── connect/      # Printer onboarding portal
│   │   └── App.tsx           # UI Entry and Routing logic
│   ├── api/                  # Control Plane API / BFF (Fastify)
│   │   ├── adapters/         # Bridges to other PPOS regional services
│   │   ├── middleware/       # Auth guards and request pre-handlers
│   │   ├── routes/           # Fastify route definitions (Admin, Ops)
│   │   └── services/         # Core business logic (NetworkOps, Audit)
│   └── shared/               # Domain types and constants (Admin Schema)
├── docs/                     # Architectural documentation
├── public/                   # Static assets for the Frontend
├── server.js                 # Unified Fastify server entry
├── package.json              # Monorepo/Unified project configuration
└── tsconfig.json             # Shared type configuration
```

## Mapping of Major Artifacts

| Category | Source Monolith Location | Target Control Plane Location | Justification |
| :--- | :--- | :--- | :--- |
| **Pages** | `/pages/admin/*` | `src/ui/pages/admin/` | Maintains logical grouping of admin functionality. |
| **Components** | `/components/network/*` | `src/ui/components/network/` | Keeps specialized network UI close to the domain. |
| **Backend** | `/routes/adminControl.js` | `src/api/routes/control.js` | Refactored for Fastify; becomes a core operation route. |
| **Services** | `/services/networkOpsService.js`| `src/api/services/network/` | Promotes services to first-class citizens in the API layer. |
| **Auth** | `/middleware/requireAdmin.js` | `src/api/middleware/auth.js` | Unified authentication decorator for all admin endpoints. |

## Justification for Structure

1. **Separation of Concerns**: Clearly distinguishes between the **UI (Vite/React)** and the **API/BFF (Fastify)**.
2. **Framework Alignment**: The API structure is optimized for Fastify plugins and hooks, moving away from Express-style monolithic routing.
3. **Domain Organization**: Grouping by domain (e.g., `api/services/network`) rather than just technical type (`api/services`) improves maintainability as the Control Plane grows.
4. **Shared-Infra Integration**: The new structure allows for easy consumption of `@ppos/shared-infra` at both the UI and API levels by exposing canonical hook and adapter points.
5. **Public-App Purity**: By moving all admin logic here, the `ppos-preflight` (public app) can be stripped of all sensitive admin routing and logic, reducing security surface area and bundle size.

## Extraction Confirmation Checklist (Pre-Phase 2)

- [ ] Confirm Fastify as the canonical backend framework for all new PPOS services.
- [ ] Validate that `@ppos/shared-infra` contains all necessary DB and Auth primitives.
- [ ] Ensure `control.printprice.pro` environment variables are provisioned in the CI/CD pipeline.
