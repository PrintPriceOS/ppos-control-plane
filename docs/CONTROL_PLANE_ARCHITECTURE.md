# PrintPrice OS — Control Plane Architecture

## Overview

The **PrintPrice OS Control Plane** is a production-grade industrial orchestration platform that evolved from a Manufacturing Execution System (MES) into a self-healing, federated, multi-region intelligent manufacturing coordinator across Phases 12–22.

---

## System Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                   PPOS CONTROL PLANE (v1.0.0)                   │
│                      port :8081 (Fastify)                       │
├───────────────┬───────────────────────────────────────────────┤
│  FRONTEND     │  React + Vite + TailwindCSS                    │
│               │  dist/ served statically via Fastify           │
├───────────────┼───────────────────────────────────────────────┤
│  API LAYER    │  Express-style routers mounted at /api/admin/* │
│               │  Auth: Bearer token (JWT + break-glass)        │
├───────────────┼───────────────────────────────────────────────┤
│  SERVICE LAYER│  170+ service modules in src/api/services/     │
│               │  Grouped by capability domain                  │
├───────────────┼───────────────────────────────────────────────┤
│  DATA LAYER   │  MySQL (primary store)                         │
│               │  Redis (optional queue / cache)                │
│               │  50+ provisioned tables                        │
└───────────────┴───────────────────────────────────────────────┘
```

---

## Service Domains

| Domain | Services | Phases |
|--------|----------|--------|
| Core MES | dispatch, SLA monitoring, rerouting, capacity | 12 |
| Predictive Intelligence | bottleneck, risk, material forecasting | 13 |
| Digital Twin | anomaly detection, failure prediction, twin snapshots | 14 |
| Economic | optimization, profitability, energy, swarm | 15 |
| Federation | registry, orchestration, consensus, recovery | 16 |
| Marketplace | listings, auctions, trade ledger, capacity exchange | 17 |
| Governance | AI governance, recursive optimization, ethics | 18 |
| Civilization | planetary coordination, cognition, equilibrium | 19 |
| Interplanetary | orbital manufacturing, stellar logistics, survival | 20 |
| Reality Simulation | timeline optimization, parallel modeling, quantum forecasting | 21 |
| Omniversal | consciousness, entropy management, causal chains | 22 |

---

## API Surface

All admin endpoints are protected with Bearer token auth.

```
/api/admin/autonomy/*         Phase 12 — Autonomous MES
/api/admin/predictive/*       Phase 13 — Predictive Intelligence
/api/admin/anomaly/*          Phase 14 — Digital Twin + Anomaly
/api/admin/economic/*         Phase 15 — Economic Optimization
/api/admin/federation/*       Phase 16 — Multi-Factory Federation
/api/admin/marketplace/*      Phase 17 — Industrial Marketplace
/api/admin/governance/*       Phase 18 — AI Governance
/api/admin/civilization/*     Phase 19 — Industrial Civilization
/api/admin/interplanetary/*   Phase 20 — Interplanetary Manufacturing
/api/admin/reality/*          Phase 21 — Reality Simulation
/api/admin/singularity/*      Phase 22 — Omniversal Consciousness
/api/admin/telemetry/*        Cross-cutting Observability
```

---

## Authentication

```
Authorization: Bearer <token>

Sources (priority order):
  1. Valid JWT (signed with JWT_SECRET, audience: ppos:control)
  2. PPOS_CONTROL_TOKEN (break-glass admin token)
  3. PPOS_WORKER_CONTROL_TOKEN (worker fleet access)
```

> **Security:** `ENABLE_BREAK_GLASS_TOKEN=true` must NOT be set in production environments.

---

## Data Persistence

- **MySQL**: Primary store for all dispatches, machine profiles, federation state, governance logs, digital twin snapshots, and all Phase 12–22 tables.
- **Schema Migrations**: Managed by `industrialProvisioningService.js` — idempotent, safe to run multiple times.
- **Redis**: Optional queue backend for async job processing.

---

## Deployment

See `DEPLOYMENT_GUIDE.md` for full deployment instructions.

Quick start:
```bash
# Install
npm ci

# Build frontend
npm run build

# Start with PM2
pm2 start ecosystem.config.js

# Verify
node scripts/preflight-production-check.js
node scripts/validate-control-plane-full.js
```
