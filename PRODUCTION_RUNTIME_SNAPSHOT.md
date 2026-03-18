# PRODUCTION_RUNTIME_SNAPSHOT.md

Snapshot of the currently running PrintPrice OS Production Runtime.

## 1. Directory Structure

```text
/opt/printprice-os/
├── ppos-preflight-engine/      # Linked Engine Library
├── ppos-preflight-service/     # Main API Gateway (Node.js)
├── ppos-preflight-worker/      # Async Job Processor (Node.js)
└── runtime-logs/               # Created during PM2 migration
```

## 2. Active Ports & Services

| Service | Port | Endpoint (Health) | Description |
| :--- | :--- | :--- | :--- |
| **Service** | `8001` | `GET /health` | Incoming API and Sync Logic |
| **Worker** | `8002` | `GET /health` | Queue Processing and Monitoring |

## 3. Queue Configuration

- **System**: BullMQ (Redis-backed)
- **Queue Name**: `preflight_async_queue`
- **Job Lifecycle**: `STAGED -> ENQUEUED -> PROCESSING -> COMPLETED/FAILED`
- **Visibility**: Visible in Control Plane via `/api/admin/jobs`.

## 4. Redis Usage

- **Host**: `127.0.0.1` (localhost)
- **Port**: `6379`
- **Purpose**: Key-Value Store for BullMQ job state and coordination.

## 5. Storage Paths

| Role | Path |
| :--- | :--- |
| **Canonical Staging** | `/opt/printprice-os/temp-staging` |
| **Fallback (Service)** | `/opt/printprice-os/ppos-preflight-service/temp-staging` |

## 6. Observed Environment Variables

```bash
NODE_ENV=production
PPOS_UPLOADS_DIR=/opt/printprice-os/temp-staging
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
ADMIN_API_KEY=******** (obtained from server's .env)
PPOS_QUEUE_NAME=preflight_async_queue
```

## 7. Sync vs Async Logic (`POST /preflight/analyze`)

The system differentiates based on file size to balance UI responsiveness and server stability:

- **Small Files (< 5MB)**:
  - Processed Synchronously by the Service via direct Engine call.
  - Result returned in the same HTTP connection.
- **Large Files (>= 5MB)**:
  - Processed Asynchronously.
  - Service stages the file and enqueues a job to `preflight_async_queue`.
  - HTTP 202 response includes a `job_id`.

## 8. API Endpoints (Actual)

- **Service (8001)**:
  - `POST /preflight/analyze`: Direct PDF analysis.
  - `POST /preflight/autofix`: Autofix (Sync for multipart, Async for JSON).
  - `GET /health`: Fastify health state.
- **Worker (8002)**:
  - `GET /health`: Worker process health state.

## 9. Current Execution Model

Currently running under **nohup** on the production server:
- `nohup node server.js > service.log 2>&1 &`
- `nohup node worker.js > worker.log 2>&1 &`
