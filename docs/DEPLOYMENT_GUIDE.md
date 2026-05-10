# Deployment Guide — PrintPrice OS Control Plane

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | ≥ 18.x |
| npm | ≥ 9.x |
| MySQL | ≥ 8.0 |
| Redis | ≥ 6.x (optional) |
| PM2 | ≥ 5.x |

---

## Environment Configuration

Copy `.env.example` to `.env` and configure:

```env
# Core
NODE_ENV=production
PORT=8081
PPOS_CONTROL_MODE=LIVE
PPOS_LOG_LEVEL=info

# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=ppos_user
DB_PASSWORD=<strong-password>
DB_NAME=ppos_control

# Security
JWT_SECRET=<strong-random-secret-min-32-chars>
JWT_AUDIENCE=ppos:control
PPOS_CONTROL_TOKEN=<strong-admin-token>
PPOS_WORKER_CONTROL_TOKEN=<worker-token>

# Break-glass (disable in production)
# ENABLE_BREAK_GLASS_TOKEN=true

# Optional Redis
REDIS_URL=redis://localhost:6379
```

> **Security:** Never commit `.env` to version control. Never set `ENABLE_BREAK_GLASS_TOKEN=true` in production.

---

## Installation

```bash
# 1. Clone
git clone https://github.com/PrintPriceOS/ppos-control-plane.git
cd ppos-control-plane
git checkout phase-10-intelligence-layer

# 2. Install dependencies
npm ci

# 3. Build frontend
npm run build

# 4. Create log directory
mkdir -p logs
```

---

## Database Setup

The Control Plane provisions its own schema on startup via `industrialProvisioningService.js`.

On first run, all tables are created automatically. Migrations are **idempotent** — safe to run repeatedly.

To verify schema integrity:
```bash
node scripts/verify-industrial-schema.js
```

---

## Starting the Server

### Development
```bash
PORT=8081 node server.js
```

### Production (PM2)
```bash
# Start
pm2 start ecosystem.config.js

# Monitor
pm2 status
pm2 logs ppos-control-plane

# Reload (zero-downtime)
pm2 reload ppos-control-plane

# Stop
pm2 stop ppos-control-plane
```

---

## Pre-Deployment Checklist

Run before every production deployment:

```bash
# 1. Build
npm run build

# 2. Schema check
node scripts/verify-industrial-schema.js

# 3. Full pre-flight
node scripts/preflight-production-check.js

# 4. Full validation
PPOS_CONTROL_PLANE_URL=http://127.0.0.1:8081 \
PPOS_CONTROL_TOKEN=<token> \
node scripts/validate-control-plane-full.js
```

All checks must pass before a production deployment.

---

## Health Endpoints

```bash
# Server health
GET /health

# Telemetry snapshot
GET /api/admin/telemetry/snapshot
Authorization: Bearer <token>

# Phase-specific health
GET /api/admin/federation/health
GET /api/admin/governance/health
GET /api/admin/interplanetary/health
```

---

## Graceful Shutdown

The PM2 `kill_timeout: 10000` allows 10 seconds for in-flight requests to complete. To trigger graceful shutdown:

```bash
pm2 stop ppos-control-plane
```

The server will stop accepting new connections and drain existing ones.

---

## Troubleshooting

### Port already in use
```bash
# Find PID using port 8081
netstat -ano | findstr :8081
# Kill
taskkill /PID <pid> /F
```

### PM2 process not starting
```bash
pm2 logs ppos-control-plane --lines 50
```

### Database connection refused
Verify `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` in `.env`. Ensure MySQL is running and the user has `CREATE TABLE` privileges.
