# Preflight Operations Roadmap

This document outlines the strategic plan for the **Preflight Operations** module within the PPOS Control Plane. It serves as the source of truth for architecture, security, and the iterative release of administrative capabilities.

## 1. Current Scope
The Control Plane acts as the **Administrative & Governance Layer** for the Preflight ecosystem.
- **Job Orchestration**: Creating and tracking jobs in the upstream Preflight Service.
- **Persistence**: Permanent storage of job history and artifact metadata in MySQL.
- **Storage Management**: Multi-tenant file repository with enforced quotas.
- **Forensics**: Monitoring large documents and processing anomalies.
- **Auditability**: Structured logging of all administrative actions.

## 2. Non-Goals
- **PDF Processing**: The Control Plane **must not** perform PDF analysis, repair, or rendering. This is reserved for the `ppos-preflight-engine`.
- **Worker Management**: Control Plane does not manage worker scaling directly (handled by infra/K8s).
- **Public API**: The `/api/admin/preflight` surface is for internal operators/admins only.

## 3. Architecture Boundaries
- **Control Plane**: Registry, Auth, Quotas, Persistence, UI.
- **Preflight Service**: API Gateway for workers, BullMQ producer.
- **Preflight Worker**: Execution environment (Node.js).
- **Preflight Engine**: Core logic (pdf-lib, Ghostscript).

## 4. Required Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `PPOS_PREFLIGHT_STORAGE_ROOT` | `/opt/printprice-os/storage/preflight` | Root path for tenant files. |
| `PPOS_PREFLIGHT_MAX_UPLOAD_MB` | `2048` | Max size for PDF uploads (MB). |
| `PPOS_PREFLIGHT_SERVICE_URL` | `http://localhost:8001` | Upstream Service endpoint. |
| `PPOS_CONTROL_TOKEN` | `admin-secret` | Bearer token for admin auth. |
| `PPOS_PREFLIGHT_STALLED_MINUTES` | `30` | Threshold for detecting stuck jobs. |
| `PPOS_PREFLIGHT_AUTO_RETRY` | `false` | Enable automatic recovery of stalled jobs. |
| `PPOS_PREFLIGHT_RETENTION_DAYS` | `90` | Artifact persistence window before GC. |

## 5. API Surface (`/api/admin/preflight`)
- `GET /health`: Infrastructure health and worker availability.
- `GET /jobs`: Filterable registry of persistent job records.
- `POST /upload`: Secure PDF ingestion with magic-byte validation.
- `POST /jobs`: Trigger new processing workflows from staged uploads.
- `GET /artifacts`: Global and tenant-specific artifact registry.
- `GET /artifacts/:id/download`: Secure streaming of PDF/Report artifacts.
- `DELETE /artifacts/:id`: Soft-delete governance.
- `GET /storage`: Global and per-tenant utilization metrics.

## 6. Storage Model
Tenant-isolated directory structure under `PPOS_PREFLIGHT_STORAGE_ROOT`:
- **Storage Keys**: All artifact storage keys are relative to the storage root.
- **Example**: `tenants/<tenantId>/uploads/<uploadId>/file.pdf`
- **Backward Compatibility**: Legacy absolute paths are safely resolved if they reside within the storage root.

```txt
tenants/
  <tenantId>/
    uploads/   <-- Staged PDF files
    jobs/
      <jobId>/
        input/ <-- Source file link
        output/ <-- Final PDFs
        reports/ <-- JSON/PDF reports
    tmp/       <-- Multer staging
```

## 7. Tenant Quota Model
- **Default Quota**: 2GB (`2147483648` bytes) per tenant.
- **Enforcement**: Hard check before `UPLOAD` and `JOB_CREATE` (output projection).
- **Grace Period**: 0% (Strict enforcement).
- **Future**: Dynamic quotas via tenant plans.

## 8. Job Lifecycle
The Control Plane maintains a persistent state that synchronizes with the upstream Preflight Service.

**Canonical States:**
- `CREATED`: Local record initialized.
- `QUEUED`: Enqueued in upstream worker queue (BullMQ).
- `PROCESSING`: Active processing by Preflight Engine.
- `COMPLETED`: Success, artifacts generated.
- `FAILED`: Fatal error in engine or worker.
- `STALLED`: Worker lost contact or job timed out (default 30 min).
- `RETRYING`: Automatic recovery attempt in progress.
- `CANCELLED`: Manually terminated by operator.

**Recovery & Resilience:**
- **Retry**: Manual retry allowed for `FAILED`, `STALLED`, and `CANCELLED` jobs.
- **Cancel**: Termination allowed for `CREATED`, `QUEUED`, and `PROCESSING` jobs.
- **Stalled Recovery**: Maintenance route scans for `PROCESSING` jobs with stale heartbeats and transitions them to `STALLED`.
- **Auto-Retry**: Configuration `PPOS_PREFLIGHT_AUTO_RETRY` enables automatic requeueing of stalled jobs.
- **Tracking**: `retry_count` and `last_heartbeat_at` are persisted for forensics.

## 9. Artifact Lifecycle
Artifacts follow a structured lifecycle to ensure storage efficiency and governance.

**States:**
- `ACTIVE`: Available for download/viewing.
- `ARCHIVED`: Compressed or moved to cold storage (Phase 8).
- `EXPIRED`: Exceeded retention period (default 90 days).
- `DELETED`: Physical file removed from disk.
- `CORRUPTED`: Integrity check failed.

**Retention & GC:**
- **Policy**: `PPOS_PREFLIGHT_RETENTION_DAYS` (Default: 90).
- **Soft-Delete**: `DELETE` API marks record as deleted but keeps file for safety window.
- **Garbage Collector**: `POST /artifacts/gc` performs physical deletion of soft-deleted and expired files.
- **Security**: GC resolver validates every file against tenant boundaries before physical `unlink`.
- **Audit**: Every GC run and artifact expiration is logged for compliance.

## 10. Security Model
- **Authentication**: Mandatory Bearer token validation matching `PPOS_CONTROL_TOKEN`.
- **RBAC**: 
  - `SUPER_ADMIN`: Access to all tenants and global metrics.
  - `TENANT_ADMIN`: Restricted to `req.user.tenantId`.
- **Input Validation**: Magic byte check (`%PDF-`) for all uploads.
- **Path Protection**: Strict path resolution with traversal guards.
- **Audit**: Every write/download action recorded in `audit_logs`.

## 11. Admin UI Checklist
- [x] Jobs Dashboard (Real-time tracking).
- [x] Storage Quota Visualization.
- [x] Artifact Registry & Download.
- [x] Large Documents Forensics (PDFs > 500MB).
- [x] PDF Upload Modal.
- [ ] Worker Health Detail (Queue depth, active workers).
- [ ] Manual Job Retry/Kill controls.

## 12. Release Checklist
- [x] Verify MySQL Migrations (`preflight_jobs`, `preflight_artifacts`, `audit_logs`).
- [x] Ensure `PPOS_PREFLIGHT_STORAGE_ROOT` exists and has write permissions.
- [x] Secure `server.js` by removing auth bypasses.
- [ ] Configure log rotation for `audit_logs`.
- [ ] Load testing for concurrent artifact streaming.

## 13. Known Risks
- **Storage Drift**: Files deleted from disk manually but persisting in DB.
- **Upstream Latency**: Timeouts when the Preflight Service is under heavy load.
- **Memory Pressure**: Streaming very large (2GB+) artifacts through the Node.js proxy.

## 14. Future Integration Points
- **Billing**: Automatic invoicing based on GB-hours or job count.
- **Licensing**: Restricting `AUTOFIX` or `CERTIFY` based on tenant tier.
- **Intelligent Routing**: Forwarding large jobs to dedicated "Heavy" workers.
- **Webhooks**: Notifying external systems on job completion.
