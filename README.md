# 🌌 PrintPrice OS — Control Plane Core Hardening
> **Industrial Platform for Intelligent Coordination, Multi-regional Governance, and Autonomous Inference**

[![Software Version](https://img.shields.io/badge/Version-v1.9.5--Phase--193H-blueviolet?style=for-the-badge)](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/README.md)
[![Build Status](https://img.shields.io/badge/Build-STABLE-success?style=for-the-badge)](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/README.md)
[![Database Migration](https://img.shields.io/badge/Schema-IDEMPOTENT-orange?style=for-the-badge)](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/CONTROL_PLANE_OS_AUDIT.md)
[![Audited Status](https://img.shields.io/badge/Security-HARDENED-success?style=for-the-badge)](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/CONTROL_PLANE_OS_AUDIT.md)

---

## 📖 1. Repository Role

The **PrintPrice OS Control Plane** (`ppos-control-plane`) is the **Core for Governance, Multi-regional Coordination, and Forensic Visibility** of our distributed federated printing infrastructure. It acts as the nerve center that receives telemetry from all operational services (preflight engines and workers) and proactively coordinates anomaly remediation, financial reconciliation, auction allocation, shipping/delivery governance, printhouse onboarding, and intelligent routing.

```text
                      ┌──────────────────────────────┐
                      │    COCKPIT FRONTEND (Vite)   │
                      └──────────────┬───────────────┘
                                     │ (Bearer JWT / HTTPS)
                      ┌──────────────▼───────────────┐
                      │    FASTIFY API GATEWAY       │
                      │         (Port :8080)         │
                      └──────────────┬───────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
┌────────▼────────┐         ┌────────▼────────┐         ┌────────▼────────┐
│  CORE MES LAYER │         │ PRINTHOUSE HUB  │         │ FEDERATION AND  │
│  (SLA & Alerts) │         │ (Phases 191–193)│         │   GEOLOCATION   │
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
* **Relational Persistence**: Optimized MySQL storage using the InnoDB engine with automated provisioning and initialization via `IndustrialProvisioningService.js`.

---

## 🧬 3. Capacity and Intelligence Auditing (Phases 12–193H)

Through the development phases of the **Intelligence Layer** and **Printhouse Onboarding Engine**, the Control Plane implements next-generation autonomy, onboarding, and simulation engines:

| Phase | Title | Core Service / Module | Real Operations Equivalent |
| :--- | :--- | :--- | :--- |
| **Phase 12** | Autonomous MES & SLA | `slaMonitoringService` | Queue redirection in case of SLA failures. |
| **Phase 13** | Predictive Intelligence | `riskScoringService` | Future stock and paper jam detection. |
| **Phase 14** | Digital Twin & Anomaly | `digitalTwinService` | Physical wear & IoT modeling and press MTBF. |
| **Phase 15** | Economic Swarm | `economicOptimizationService` | Optimized routing by commercial margin and energy. |
| **Phase 16** | Factory Federation | `federationRegistryService` | Multi-regional inter-cluster distributed consensus. |
| **Phase 17** | Market Capacity | `industrialAuctionService` | Dynamic auction of excess printing capacity. |
| **Phase 18** | AI Governance | `globalConstitutionService` | Ethical governance reinforced by AI Constitution. |
| **Phase 19** | Industrial Civilization | `planetaryCoordinationService` | Global logistics, stock balancing, and tariff mitigation. |
| **Phase 20** | Interplanetary Intel | `interplanetaryFederationService` | Extreme network latency and orbital queue mitigation. |
| **Phase 21** | Reality Simulation | `realitySimulationService` | Multi-path probabilistic routing (Monte Carlo). |
| **Phase 22** | Omniversal Consciousness | `omniversalConsciousnessService` | Global holographic telemetry coherence with circuit breakers. |
| **Phase 191G** | Shipping Governance | `printhouseShippingRegionService` | Tenant/site-scoped shipping regions & delivery methods. |
| **Phase 191H** | Onboarding & Review | `printhouseMarketplaceReviewService` | Self-service marketplace review submission & readiness gates. |
| **Phase 192** | Onboarding Hub & Setup | `PrinthouseSetupHub` UI & REST | Progressive Printhouse setup (Sites, Machines, Materials, Capacity, Lead Times). |
| **Phase 193H** | Hawkeye Pricing Engine | `GovernedQuoteSmokeTest` & Calibration | Governed live pricing calibration, inverse solver, and dynamic signature verification. |

---

## 🔒 4. Security Standards and Multi-Tenant Isolation

The Control Plane operates under strict cryptographic and industrial regulations to prevent data leaks and unauthorized access:

1. **Row-Level Multi-Tenant Isolation**: The database applies recursive filtering using the `tenantId` provided in the operator's corporate JWT token in all queries (Row-Level Isolation).
2. **Fastify onRequest Hook**: Registers a security interception directive on all administrative routes (`/api/admin/*`, `/api/marketplace/*`), validating the Bearer JWT Token signature.
3. **Master Break-Glass Token (Emergency Deployment)**: If the environment variable `ENABLE_BREAK_GLASS_TOKEN=true` is active, it allows access with a secure static token (`PPOS_CONTROL_TOKEN`) in the event of a central identity server failure. *Warning: Disable in production.*
4. **Storage Quota Control**: Implements `PreflightQuotaService` to ensure no Tenant exceeds the strict physical storage limit of 2GB for PDF files.

---

## 📁 5. Database, Shipping & Quoting Architecture (Phases 191-193H)

The Control Plane's relational MySQL database contains over **50 tables** structured and idempotently initialized by the `IndustrialProvisioningService`:

* **Printhouse Onboarding & Shipping Layer (Phase 191G/191H)**:
  * `printhouse_shipping_regions`: Stores regional shipping definitions, transit days, pickup options, and supported country lists.
  * `printhouse_delivery_methods`: Defines site-specific delivery methods, carrier mappings, and cost structures.
  * `printhouse_integration_profiles` & `printhouse_integration_credentials`: Secure store for API webhooks and carrier integration credentials.

* **Marketplace Quoting & Hawkeye Pricing Engine (Phase 193H)**:
  * `job_marketplace_sessions`, `manufacturing_offers`, and `marketplace_events` tables guarantee the persistence of industrial offers generated by the integrated quoting engines (BPE).
  * Hawkeye Pricing Engine calibration adapter supports inverse solving, tolerance validation, and dynamic calculation signatures.

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

# 4. Start the Fastify Server (Port 8080 by default)
npm start
```

### Execute Validation Suite
To certify the proper functioning of all Control Plane modules and shipping/onboarding HTTP routes, execute:

```bash
# Shipping HTTP routes & multi-tenant security suite
node tests/smoke_phase191g_http_routes.js

# Setup hub authentication & icon integrity test suite
node tests/smoke_phase192_9_rc20_3_2_setup_auth_and_icon_integrity.js

# Complete and idempotent core validation
node scripts/validate-control-plane-full.js
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