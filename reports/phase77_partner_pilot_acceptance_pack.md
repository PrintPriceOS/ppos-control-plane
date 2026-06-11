# Phase 77 — Partner Pilot Acceptance Pack
**PrintPrice OS Control Plane — Commercial Pilot Readiness**

This acceptance pack documents the governance structure, isolation policies, and pilot limits enforced on selected partner tenants before entering the commercial pilot phase.

---

## 1. Executive Summary

- **Pilot Status Target**: `PARTNER PILOT READY`
- **Expected Final State**: `LIVE_PRODUCTION` is strictly **DISABLED**
- **Commercial Status**: `PILOT_ONLY`
- **Scope**: Control Plane Isolation, Scoped Roles, Usage Limits

Under no circumstances will `commercial_status` change to `LIVE` or `live_production_enabled` be set to `true` without system administration intervention and verified preflight validator certifications.

---

## 2. Readiness Evaluation Domains

All tenants under the pilot phase must pass the following evaluation checks:

| Domain | Required State | Description |
| :--- | :--- | :--- |
| **Printhouse Onboarding** | `READY_FOR_PILOT` | Onboarding profile complete and active. |
| **Capabilities Profile** | `PASSED` | Active machine, media catalog, SLA, and policy profiles binding complete. |
| **User Roles Configuration** | `PASSED` | Scoped roles successfully validated; no internal operator info leaks to customers. |
| **Pilot Limits** | `PASSED` | Pre-defined order, daily job, and storage limits configured. |
| **Workspace Isolation** | `PASSED` | Shared/isolated workspaces mapped; cross-tenant access intercepts validated. |
| **Auditability** | `PASSED` | Event audit logging active for all pilot access transitions. |
| **Live Production Gate** | `BLOCKED_BY_DESIGN` | Strictly locked to prevent accidental commercial launch. |

---

## 3. Scoped User Roles Matrix

| Role | Pilot Management | View Operator Details | View Customer Report | Overrides Approval | Live Gate Override |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `SYSTEM_ADMIN` | **Yes** | Yes | Yes | Yes | Yes (Manual Only) |
| `CONTROL_PLANE_ADMIN` | **Yes** | Yes | Yes | Yes | No |
| `TENANT_ADMIN` | No | No | Yes | No | No |
| `PRINTHOUSE_ADMIN` | No | Yes | Yes | Yes | No |
| `PRINTHOUSE_OPERATOR` | No | Yes | Yes | No | No |
| `CUSTOMER_USER` | No | No | Yes | No | No |

---

## 4. Usage Governance Limits

The default limits for a tenant pilot workspace are:

- **Max Pilot Orders**: 50 orders
- **Max Daily Jobs**: 25 jobs/day
- **Max File Size**: 2048 MB (2 GB)
- **Max Storage Quota**: 50 GB
- **Allowed Order Types**: Standard, Commercial Pilot, Demo
- **Violations Action**: Automatic request blocking, audit log entry write (`TENANT_PILOT_LIMIT_EXCEEDED`).

---

## 5. Acceptance Certification

This pack certifies that all multi-tenant isolation, usage quotas, and administrative gate restrictions are implemented in code and verified by deterministic automated tests.

**Authorized by**: `SYSTEM_ADMIN` (Control Plane Governance Board)
**Date**: 2026-06-11
