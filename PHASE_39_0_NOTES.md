# Phase 39.0 — Tenant Plan Governance / Commercial Entitlements

This document describes the Tenant Plan Governance system implemented in Phase 39.0 of the PrintPrice OS / PPOS Control Plane.

## Overview

The Tenant Plan Governance system provides centralized, commercial status management, grace period tracking, file/job limits enforcement, and module access control for PrintPrice OS print houses and client tenants.

### Supported Plan Codes

1. **FREE**:
   - Limit: 25 MB per file / 50 MB per job.
   - Retention: 7 days.
   - Modules: `budget_app`, `basic_preflight`, `job_history`, `own_order_dashboard`, `tenant_admin` (disabled/limited), `billing_placeholder`.
2. **PRO**:
   - Limit: 150 MB per file / 300 MB per job.
   - Retention: 30 days.
   - Modules: `full_preflight`, `reports`, `marketplace_orders` (limited), `file_repository` (limited).
3. **ENTERPRISE**:
   - Limit: 1 GB (1024 MB) per file / 2 GB (2048 MB) per job (allows the strategic 780 MB inlay files).
   - Retention: 90 days.
   - Modules: Full access to print house handoff, production queue, machine assignment, federation, api access, advanced audit.
4. **FOUNDING_PRINTHOUSE**:
   - Gated operational pilot plan.
   - Identical resource limits to `ENTERPRISE` (supports 780 MB inlay file).
   - Defaults to a 7-day grace period with full operational capabilities.
5. **CUSTOM**:
   - Configurable limits and modules contractually.
6. **SYSTEM**:
   - Internal superadmin bypass plan.

### Commercial Statuses

- `ACTIVE`: Regular operational status.
- `GRACE`: Active pilot grace period (Founding Printhouse).
- `GRACE_EXPIRED`: Pilot grace period has ended. The tenant dashboard remains viewable, but all mutating operational actions are blocked. No data is deleted, and login is not restricted.
- `SUSPENDED`: Access is restricted.
- `CONVERTED`: Transitioned from founding plan.
- `CANCELLED`: Voluntarily terminated.
- `MANUAL_REVIEW`: Gated by superadmin.

---

## Architectural Details

### 1. Database Schema (`013_phase39_0_tenant_plan_governance.sql`)

A defensive schema modification was applied:
- Added columns to `tenants` table to support `plan_code`, `commercial_status`, `access_level`, grace timestamps, limits JSON, and entitlements JSON.
- Created `tenant_governance_events` audit table to log transitions and limit events.

### 2. Services
- `tenantEntitlementMatrix.js`: Defines default plan capabilities and normalizations.
- `tenantPlanGovernanceService.js`: Serves as the single source of truth for checks.

### 3. API Router (`adminTenantGovernance.js`)
Mounted at `/api/admin/tenant-governance` containing:
- `GET /:tenantId/entitlements`
- `POST /:tenantId/plan`
- `POST /:tenantId/grace/extend`
- `POST /:tenantId/evaluate-action`
- `POST /:tenantId/check-file-limit`
- `POST /:tenantId/check-job-limit`
- `POST /:tenantId/grace/freeze-if-expired`

---

## Integrations

- **Preflight uploads (`adminPreflight.js`)**: Gated via `checkFileLimit` right after multer stages the temp file. Returns `TENANT_FILE_LIMIT_EXCEEDED` if exceeded and unlinks the staged file.
- **Remote Ingestions (`productionFileIngestionService.js`)**: Dynamic download max content length checks against resolved tenant limits, falling back to a 5 GB infra ceiling if order context is unavailable.

---

## UI Changes

The WAMP-style dashboard has been extended in `TenantManagement.tsx`:
- Rendered specific color badges for `plan_code` and `commercial_status`.
- Extended edit modal to choose plan codes and commercial statuses.
- Added Grace Extension forms with reasons and manual Enforce Freeze checks for `FOUNDING_PRINTHOUSE` pilots.
