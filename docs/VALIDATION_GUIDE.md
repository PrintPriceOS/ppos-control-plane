# Validation Guide — PrintPrice OS Control Plane

## Overview

The Control Plane provides multiple levels of validation:

1. **Per-phase validators** — test each autonomous intelligence layer individually
2. **Master validator** — unified report across all phases
3. **Schema verifier** — database integrity check
4. **Pre-flight check** — production readiness audit

---

## Environment Setup

All validators require the following environment variables:

```bash
export PPOS_CONTROL_PLANE_URL="http://127.0.0.1:8081"
export PPOS_CONTROL_TOKEN="<your-admin-token>"
export ENABLE_BREAK_GLASS_TOKEN="true"   # Only for break-glass token mode
```

Or with a `.env` file:
```env
PPOS_CONTROL_PLANE_URL=http://127.0.0.1:8081
PPOS_CONTROL_TOKEN=ppos_live_8f3a2b9d1e4c76a5b0d2f9e8c3a1b7d4
```

---

## Master Validator (Recommended)

Runs all phases in sequence and produces a structured report.

```bash
# Full validation
node scripts/validate-control-plane-full.js

# Quick mode (2 checks per phase)
node scripts/validate-control-plane-full.js --quick

# Single phase
node scripts/validate-control-plane-full.js --phase=15
```

### Expected output:
```
╔══════════════════════════════════════════════════════════╗
║     PPOS CONTROL PLANE — FULL VALIDATION REPORT         ║
╚══════════════════════════════════════════════════════════╝

  ✓  Phase 12   [PASS]  Autonomous MES + SLA Orchestration        (234ms)
  ✓  Phase 13   [PASS]  Predictive Industrial Intelligence         (189ms)
  ...
  ✓  Phase 22   [PASS]  Omniversal Industrial Consciousness        (212ms)

  Global Stability Score  : 100/100
  Validation Duration     : 4.2s
  Critical Failures       : 0
  Warnings                : 0

  ✓ SYSTEM STATUS: PRODUCTION READY
```

---

## Per-Phase Validators

| Phase | Script | Description |
|-------|--------|-------------|
| 12 | `validate-autonomous-mes.js` | Tests live SLA breach, autonomous rerouting, and capacity recovery |
| 13 | `validate-predictive-mes.js` | Tests bottleneck forecasting and risk scoring |
| 14 | `validate-anomaly-mes.js` | Tests digital twin and anomaly detection |
| 15 | `validate-economic-orchestration.js` | Tests economic optimization endpoints |
| 16 | `validate-federation-swarm.js` | Tests federation registry and swarm consensus |
| 17 | `validate-marketplace-orchestration.js` | Tests marketplace listings and trade ledger |
| 18 | `validate-governance-intelligence.js` | Tests AI governance and recursive optimization |
| 19 | `validate-planetary-civilization.js` | Tests planetary coordination and cognition |
| 20 | `validate-interplanetary-civilization.js` | Tests interplanetary manufacturing APIs |
| 21 | `validate-universal-substrate.js` | Tests reality simulation layer |
| 22 | `validate-post-reality-singularity.js` | Tests omniversal consciousness layer |

### Example (Phase 16):
```bash
PPOS_CONTROL_PLANE_URL="http://127.0.0.1:8081" \
PPOS_CONTROL_TOKEN="ppos_live_8f3a2b9d1e4c76a5b0d2f9e8c3a1b7d4" \
node scripts/validate-federation-swarm.js
```

> **Note:** Phases 12–14 validators require a live database with real machine profiles and execute actual state mutations. Always run against a non-production database or restore state afterward.

---

## Schema Verifier

Verifies all Phase 12–22 tables and critical columns exist. **Read-only — safe to run anytime.**

```bash
node scripts/verify-industrial-schema.js
```

### Expected output:
```
  ✓  manufacturing_dispatches
  ✓  federation_registry
  ✓  omniversal_consciousness_snapshots
  ...
  ✓ SCHEMA INTEGRITY: VERIFIED — ALL PHASES 12-22 INTACT
```

---

## Pre-Flight Production Check

Verifies database, Redis, security configuration, API health, and all phase endpoints before deployment.

```bash
node scripts/preflight-production-check.js
```

> Run this before every PM2 restart in production.

---

## Troubleshooting

### `connect ECONNREFUSED 127.0.0.1:8081`
The server is not running. Start it with:
```bash
PORT=8081 node server.js
# or
pm2 start ecosystem.config.js
```

### `Unauthorized: Valid Bearer token required`
The `PPOS_CONTROL_TOKEN` environment variable is not set or mismatched. Verify it matches the token in `.env`.

### Phase 12 validator fails — `NO_VALIDATION_ALTERNATE_NODE_AVAILABLE`
The database needs at least 2 active machines with overlapping capabilities. Seed production data first.
