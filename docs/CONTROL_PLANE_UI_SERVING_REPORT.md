# CONTROL_PLANE_UI_SERVING_REPORT

**Status**: ✅ IMPLEMENTED
**Date**: 2026-03-17

## 🛠️ UI Serving Strategy

The ppos-control-plane now serves its own frontend SPA directly from the Fastify server.

### 1. Auth Hook Fix
The `onRequest` hook in `server.js` was updated to distinguish between UI assets and protected API routes.

**Publicly Accessible Routes:**
- `/` (Root shell)
- `/index.html`
- `/favicon.ico`
- `/assets/*` (Bundled JS/CSS/Images)
- `/health` (Infrastructure health)

**Protected Routes (Require Bearer Token):**
- `/api/*` (Generic APIs)
- `/federation/*` (Strategic coordination)

**Internal Bypass (Admin Logic):**
- `/api/admin/*`
- `/api/v2/analytics/*`
- `/api/system/*`
These keep their existing bypass/logic for compatibility with the activation layer.

### 2. Static Serving & SPA Fallback
- **Static Plugin**: `fastify-static` is registered to serve the `dist` folder.
- **SPA Fallback**: A `setNotFoundHandler` is implemented to serve `index.html` for any non-API route, allowing client-side routing to work.
- **Vite Integration**: The repository is now wired with Vite for building the React frontend.

## 📦 Build Requirements
To prepare the UI for production:
1. `npm install`
2. `npm run build` (Generates the `dist` folder)
3. Restart `server.js`
