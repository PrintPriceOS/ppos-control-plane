# Phase 39.2 — Tenant Management Console Notes

This document describes the design and behavior of the Control Plane Tenant Management Console implemented in Phase 39.2.

## Purpose of the Module
The Tenant Management Console allows PrintPrice OS administrators and operators to monitor and manage tenant entitlements, limits, and grace periods directly from the Control Plane UI.

## Integration with Phase 39.0 Backend Governance
The module consumes the administrative governance endpoints mounted under `/api/admin/tenant-governance/*`:
- `GET  /api/admin/tenant-governance` - Summarized listing of all tenants.
- `GET  /api/admin/tenant-governance/:tenantId/entitlements` - Full entitlements breakdown.
- `POST /api/admin/tenant-governance/:tenantId/plan` - Assign plans.
- `POST /api/admin/tenant-governance/:tenantId/grace/extend` - Grace period extension.
- `POST /api/admin/tenant-governance/:tenantId/grace/freeze-if-expired` - Expired grace freeze.
- `POST /api/admin/tenant-governance/:tenantId/check-file-limit` - File limit evaluation path.
- `POST /api/admin/tenant-governance/:tenantId/check-job-limit` - Job limit evaluation path.

## Operational Actions

### Assigning FOUNDING_PRINTHOUSE
Assigning a tenant to `FOUNDING_PRINTHOUSE` initializes the grace period.
- **Default Payload**:
  ```json
  {
    "planCode": "FOUNDING_PRINTHOUSE",
    "commercialStatus": "GRACE",
    "graceDays": 7,
    "reason": "Founding print house pilot onboarding"
  }
  ```
- **Access Level**: Full.
- **Limits**: 1024 MB maximum file size limit; 2048 MB maximum job size limit.

### Grace Period and Freezes
- When a grace period is active, the tenant has full access.
- Upon expiration, operators can enforce a freeze which updates the commercial status to `GRACE_EXPIRED` (operational actions are frozen, but LOGIN, VIEW_CONTROL_PLANE, and VIEW_HISTORY remain allowed).
- Operators can extend the grace period by providing a numeric count of grace days and a required audit reason.

### Limits Simulation
Operators can perform limit evaluations directly from the drawer:
- **File Limit**: Evaluate size options (25 MB, 150 MB, 780 MB, 1024 MB).
- **Job Limit**: Evaluate size options (300 MB, 2048 MB).
- Testing 780 MB for `ph-demo-123` returns ALLOWED because its limit is set to 1024 MB.

## Out of Scope
- Integration with external billing networks (Stripe, Redsys, checkout flows).
- Public pricing page creation.
- Data deletion or hard login blocking on grace expiration.
