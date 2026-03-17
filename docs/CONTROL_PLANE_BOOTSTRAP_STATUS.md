# CONTROL_PLANE_BOOTSTRAP_STATUS

**Status**: 🟢 ACTIVE (BOOTABLE / MOCKED)
**Date**: 2026-03-17

## 🚀 How to Run

### Backend
1. `cd workspace/PrintPriceOS_Workspace/ppos-control-plane`
2. `node server.js`

Confirmed listening on port 8080. Verified with health and metrics curls.

### Frontend (Development)
1. `npm run dev` (Requires Vite, currently being configured)

---

## ✅ What Works

| Component | Status | Note |
| :--- | :--- | :--- |
| **Fastify Server** | 🟢 ACTIVE | Successfully boots and listens on port 8080. |
| **Legacy Route Bridge** | 🟢 ACTIVE | Express routers are mounted via `@fastify/express` on `/api/admin`. |
| **Auth** | 🟡 STUBBED | Always allows access, logs request. |
| **Data Access** | 🟡 ADAPTED | All `db.query` calls go through `dataAdapter.js` (Mocked). |
| **Queue Operations** | 🟡 ADAPTED | All `queue.js` calls go through `queueOperator.js` (No-op). |
| **Metrics API** | 🟢 FUNCTIONAL | `/api/admin/metrics/overview` returns valid JSON with mock data. |
| **UI Shell** | 🟡 EXTRACTED | React components are present in `src/ui/`. |

---

## 🛠️ What is Mocked

- **Auth**: No API key verification yet.
- **Database**: No real PostgreSQL connection; returns empty/zeroed sets.
- **Queues**: No real BullMQ connection; no-op success reports.
- **i18n**: `t(key)` simply returns the `key`.

---

## 🛑 Blockers

- **Vite Configuration**: Frontend build system needs to be finalized to serve the UI.
- **Shared Infra**: Database schema mapping for real data extraction.
