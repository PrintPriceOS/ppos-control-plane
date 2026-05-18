# 🌌 PrintPrice OS — Control Plane Core Hardening
> **Industrial Platform for Intelligent Coordination, Multi-regional Governance, and Autonomous Inference**

[![Software Version](https://img.shields.io/badge/Version-v1.9.3--Phase--34-blueviolet?style=for-the-badge)](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/ppos-control-plane-phase-10-intelligence-layer/README.md)
[![Build Status](https://img.shields.io/badge/Build-STABLE-success?style=for-the-badge)](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/ppos-control-plane-phase-10-intelligence-layer/README.md)
[![Database Migration](https://img.shields.io/badge/Schema-IDEMPOTENT-orange?style=for-the-badge)](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/ppos-control-plane-phase-10-intelligence-layer/docs/CONTROL_PLANE_OS_AUDIT.md)
[![Audited Status](https://img.shields.io/badge/Security-HARDENED-success?style=for-the-badge)](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/ppos-control-plane-phase-10-intelligence-layer/docs/CONTROL_PLANE_OS_AUDIT.md)

---

## 📖 1. Repository Role

The **PrintPrice OS Control Plane** (`ppos-control-plane`) is the **Core for Governance, Multi-regional Coordination, and Forensic Visibility** of our distributed federated printing infrastructure. It acts as the nerve center that receives telemetry from all operational services (preflight engines and workers) and proactively coordinates anomaly remediation, financial reconciliation, auction allocation, and intelligent routing.

```text
                      ┌──────────────────────────────┐
                      │    COCKPIT FRONTEND (Vite)   │
                      └──────────────┬───────────────┘
                                     │ (Bearer JWT / HTTPS)
                      ┌──────────────▼───────────────┐
                      │    FASTIFY API GATEWAY       │
                      │         (Port :8081)         │
                      └──────────────┬───────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
┌────────▼────────┐         ┌────────▼────────┐         ┌────────▼────────┐
│  CORE MES LAYER │         │   AI MODULES    │         │ FEDERATION AND  │
│  (SLA & Alerts) │         │ (Phases 12–22)  │         │   GEOLOCATION   │
└────────┬────────┘         └────────┬────────┘         └────────┬────────┘
         │                           │                           │
         └───────────────────────────┼───────────────────────────┘
                                     │
                      ┌──────────────▼───────────────┐
                      │    RELATIONAL MYSQL DB       │
                      │         (50+ Tables)         │
                      └──────────────────────────────┘
```

---

## ⚙️ 2. Network Topology and Physical Architecture

The Control Plane is divided into a React SPA (built with Vite and styled with Vanilla CSS + TailwindCSS) statically served by a **Fastify** server that also exposes robust REST endpoints, protected by JWT.

* **Frontend**: Located under `src/ui/`. Compiles to `/dist`.
* **BFF & API Gateway**: Located under `server.js` and `src/api/`.
* **File Proxy (Uploads/Preflight)**: Routes massive PDF flows directly to `ppos-preflight-service` on port `8001` with strict storage capacity control (2GB Quota per Tenant).
* **Relational Persistence**: Optimized MySQL storage using the InnoDB engine with automated provisioning and initialization via the `IndustrialProvisioningService.js`.

---

## 🧬 3. Capacity and Intelligence Auditing (Phases 12–22)

Through the development phases of the **Intelligence Layer**, the Control Plane has implemented next-generation autonomy and simulation engines, evaluated through dedicated diagnostic scripts:

| Phase | Intelligence Title | Core Service Implemented | Real Operations Equivalent | Validator |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 12** | Autonomous MES & SLA | `slaMonitoringService` | Queue redirection in case of SLA failures. | `validate-autonomous-mes.js` |
| **Phase 13** | Predictive Intelligence | `riskScoringService` | Future stock and paper jam detection. | `validate-predictive-mes.js` |
| **Phase 14** | Digital Twin & Anomaly | `digitalTwinService` | Physical wear & IoT modeling and press MTBF. | `validate-anomaly-mes.js` |
| **Phase 15** | Economic Swarm | `economicOptimizationService` | Optimized routing by commercial margin and energy. | `validate-economic-orchestration.js` |
| **Phase 16** | Factory Federation | `federationRegistryService` | Multi-regional inter-cluster distributed consensus. | `validate-federation-swarm.js` |
| **Phase 17** | Market Capacity | `industrialAuctionService` | Dynamic auction of excess printing capacity. | `validate-marketplace-orchestration.js` |
| **Phase 18** | AI Governance | `globalConstitutionService` | Ethical governance reinforced by AI Constitution. | `validate-governance-intelligence.js` |
| **Phase 19** | Industrial Civilization | `planetaryCoordinationService` | Global logistics, stock balancing, and tariff mitigation. | `validate-planetary-civilization.js` |
| **Phase 20** | Interplanetary Intel | `interplanetaryFederationService` | Extreme network latency and orbital queue mitigation. | `validate-interplanetary-civilization.js` |
| **Phase 21** | Reality Simulation | `realitySimulationService` | Multi-path probabilistic routing (Monte Carlo). | `validate-universal-substrate.js` |
| **Phase 22** | Omniversal Consciousness | `omniversalConsciousnessService` | Global holographic telemetry coherence with circuit breakers. | `validate-post-reality-singularity.js` |

---

## 🔒 4. Security Standards and Multi-Tenant Isolation

The Control Plane operates under strict cryptographic and industrial regulations to prevent data leaks and unauthorized access:

1. **Row-Level Multi-Tenant Isolation**: The database applies recursive filtering using the `tenantId` provided in the operator's corporate JWT token in all queries (Row-Level Isolation).
2. **Fastify onRequest Hook**: Registers a security interception directive on all administrative routes (`/api/admin/*`, `/api/marketplace/*`), validating the Bearer JWT Token signature.
3. **Master Break-Glass Token (Emergency Deployment)**: If the environment variable `ENABLE_BREAK_GLASS_TOKEN=true` is active, it allows access with a secure static token (`PPOS_CONTROL_TOKEN`) in the event of a central identity server failure. *Warning: Disable in production.*
4. **Storage Quota Control**: Implements `PreflightQuotaService` to ensure no Tenant exceeds the strict physical storage limit of 2GB for PDF files.

---

## 📁 5. Database and Geolocation Guide (Phase 34)

The Control Plane's relational MySQL database contains over **50 tables** structured and idempotently initialized by the `IndustrialProvisioningService`. During the audit it was validated that:

* **Printing Network Schema (Geolocation)**:
  * The `printer_nodes` and `print_nodes` tables have high-precision `latitude` (`DECIMAL(10,8)`) and `longitude` (`DECIMAL(11,8)`) columns for live geopositioning within the Cockpit UI (using Leaflet/React-Leaflet).
  * Regional governance columns such as `region`, `timezone`, `federation_id`, and `cluster_id` are properly indexed for optimized geographical searches.

* **Marketplace Transaction Layer**:
  * The `job_marketplace_sessions`, `manufacturing_offers`, and `marketplace_events` tables guarantee the persistence of industrial offers generated by the integrated quoting engines (BPE).
  * Offer records support complete cost structures (`production_cost`, `suggested_price`, `estimated_margin`) with high precision (`DECIMAL(14,4)`) and disaggregated production/shipping deadlines.

* **Evidence and SLA Layer (Immutable Evidence Ledger)**:
  * `production_evidence_ledger` table: Stores chained hashes (`hash`, `previous_hash`) that shield the physical traceability of industrial dispatches.
  * `sla_evidence_snapshots` table: Meticulously tracks the "SLA Drift" (promised vs. estimated time deviation) to trigger proactive alerts.

---

## 🛠️ 6. Initialization and Local Development

### Prerequisites
* **Node.js**: Version 18 or higher.
* **MySQL**: Relational engine running on port 3306 (InnoDB).
* **Redis**: Queue synchronizer running on port 6379 (Optional).

### Installation and Server Startup
```bash
# 1. Install clean production dependencies
npm ci

# 2. Compile the Frontend cockpit (React/Vite)
npm run build

# 3. Configure environment variables
cp .env.example .env  # Edit according to your local database variables

# 4. Start the Fastify Server (Port 8081 by default)
npm start
```

### Execute Intelligence Validation Suite (Phases 12–22)
To certify the proper functioning of all Control Plane modules, execute:

```bash
# Complete and idempotent core validation
node scripts/validate-control-plane-full.js

# MySQL schema integrity verification
node scripts/verify-industrial-schema.js

# Production and infrastructure preflight check
node scripts/preflight-production-check.js
```

---

## 📦 7. Production Deployment (PM2)

For high-availability enterprise environments, process management via **PM2** is recommended using the provided `ecosystem.config.js` file:

```bash
# Start Control Plane managed by PM2
pm2 start ecosystem.config.js

# View real-time logs
pm2 logs ppos-control-plane

# Check the general process status
pm2 status
```

### Critical Deployment Directives
* Ensure `NODE_ENV=production` is configured in the environment.
* Keep the `ENABLE_BREAK_GLASS_TOKEN=false` directive to protect the API.
* Enable write permissions on the `/logs` folder for the persistence of the rotating error trace file.

---
© 2026 PrintPrice OS. All rights reserved. Distributed Production Infrastructure and Autonomous Governance.