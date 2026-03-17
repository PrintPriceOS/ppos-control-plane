# CONTROL_PLANE_WIRING_REPORT

## 🔧 Summary of Fixes

### 1. Backend Wiring
- **Server Entry**: Refactored `server.js` to use `@fastify/express` bridge.
- **Legacy Redirects**: Created `src/api/services/db.js` and `src/api/middleware/requireAdmin.js` to point to new adapters, avoiding modification of 15+ legacy files.
- **Service Extraction**: Surgically copied missing services (`printerSyncService`, `printerQualityService`, etc.) to resolve `MODULE_NOT_FOUND` errors.
- **Dependency Installation**: Added `uuid`, `@fastify/express`, and `express` to `package.json`.

### 2. Frontend Wiring
- **i18n Stub**: Created `src/ui/i18n.tsx` providing a minimal `t()` implementation to unblock rendering.
- **Auth Stub**: Implemented permissive `src/api/middleware/auth.js` for development bootability.
- **Asset Structure**: Verified that relative imports `../lib/adminApi` and `../hooks/useAdminData` are valid within the new `src/ui/` structure.

### 3. Adapters (v1)
- **Data Adapter**: Implemented `src/api/adapters/dataAdapter.js` to intercept and safely mock SQL queries.
- **Queue Operator**: Implemented `src/api/adapters/queueOperator.js` to replace legacy BullMQ dependencies with logs.

## ⚠️ Remaining Broken Areas
- **Vite/Build**: The project still lacks a `vite.config.ts` to build the frontend assets.
- **Tailwind**: Styles might be broken due to missing `tailwind.config.js` in the new repo.
- **Real Data**: Some deeper service methods might still crash if they call complex DB logic not covered by the `dataAdapter` mock.
