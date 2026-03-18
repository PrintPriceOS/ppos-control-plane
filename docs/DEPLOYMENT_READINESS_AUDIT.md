# DEPLOYMENT_READINESS_AUDIT

**Version**: 1.9.3 (Runtime Activation)
**Repos**: `ppos-preflight-service`, `ppos-preflight-worker`

## 🏗️ Technical Specifications

| Component | Preflight Service | Preflight Worker |
| :--- | :--- | :--- |
| **Primary Entry** | `server.js` | `worker.js` |
| **Startup Cmd** | `npm start` | `npm start` |
| **Default Port** | 8001 | 8002 (Health only) |
| **Queue Target** | `preflight_async_queue` | `preflight_async_queue` |
| **Role** | Producer (Orchestrator) | Consumer (Execution) |

## 🔑 Environment Requirements (MANDATORY)

The following must be provisioned in the production environment variables:

### Shared Variables
- `REDIS_HOST`: Production Redis endpoint.
- `REDIS_PORT`: Production Redis port.
- `REDIS_PASSWORD`: Production Redis password.
- `PPOS_QUEUE_NAME`: Must match across Service, Worker, and Control Plane.
- `PPOS_UPLOADS_DIR`: Shared filesystem path (e.g., `/var/www/vhosts/printprice.pro/temp-staging`).

### Service Specific
- `PPOS_SERVICE_PORT`: Defaults to 8001.
- `ADMIN_API_KEY`: X-PPOS-API-KEY for auth (must match incoming product requests).

### Worker Specific
- `HEALTH_PORT`: Defaults to 8002.
- `NODE_ENV`: Set to `production`.

## 📡 Connectivity Contract
- **Service → Redis**: Persistent connection for BullMQ producer.
- **Worker → Redis**: Persistent connection for BullMQ consumer + Heartbeat registry.
- **Worker → Storage**: Must have Read/Write access to `PPOS_UPLOADS_DIR`.
- **Worker ↔ Control Plane**: Discovered via `ppos:workers:active` (Redis).

## 📋 Payload Alignment (v1.9.3)
The worker requires:
- `assetId` or `asset_id`
- `tenantId`
- `filePath` (absolute path in shared volume)
- `policy` (JSON string)
