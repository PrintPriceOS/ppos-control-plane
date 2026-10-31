# Preflight Operations Security Model

This document details the security architecture, authentication mechanisms, and access control policies for Preflight Operations within the PrintPrice OS Control Plane.

## 1. Authentication Layer

### Admin Auth (`requireAdmin`)
All administrative routes are protected by the `requireAdmin` middleware.
- **Mechanism**: Bearer Token validation.
- **Environment Variable**: `PPOS_CONTROL_TOKEN`.
- **Bootstrap Mode**: If the token is set to the default `admin-secret`, the system operates in **Bootstrap Development Mode**, which is clearly logged and intended for initial deployment/dev only.

### Identity Resolution
User identity and tenant context are resolved **strictly from the authenticated session/headers**.
- `req.user.tenantId`: Resolved from the `X-Tenant-Id` header (trusted for SUPER_ADMIN, enforced for others).
- `req.user.role`: Determined by the tenant and token claims.

## 2. Authorization & RBAC

| Role | Access Level | Description |
|------|--------------|-------------|
| `SUPER_ADMIN` | Global | Can access all tenants, modify all quotas, and view global audit logs. |
| `PRINTER_ADMIN`| Tenant-Isolated| Can manage preflight operations, artifacts, and storage ONLY for their own tenant. |
| `USER` / Others | Denied | No access to Control Plane administrative routes. |

## 3. License Enforcement (`requirePrinterLicense`)
Access to Preflight Operations is contingent upon a valid **Printer Operational License**.
- **License Type**: `PRINTER_OPERATIONS`.
- **Check**: Validates that the tenant has an `ACTIVE` license in the OS registry.
- **Failure**: Returns `403 Forbidden` with the code `LICENSE_REQUIRED`.

## 4. Input & Data Integrity
- **Magic Byte Validation**: All PDF uploads are inspected for the `%PDF-` signature.
- **Filename Sanitization**: Uploaded filenames are scrubbed of dangerous characters (`[^a-zA-Z0-9._-]`).
- **Canonical Path Resolution**: Every storage operation MUST use `storage.resolveTenantPath(tenantId, subPath)`.
  - Blocks absolute path injection.
  - Recursively strips `../` traversal attempts.
  - Enforces a strict `startsWith` boundary check against the tenant's root.
- **Relative Storage Keys**: The system has transitioned to storing **relative paths** in the database.
  - `storage.resolveStorageKey(key)` handles the resolution of these keys.
  - Rejects any key (relative or absolute) that points outside the storage root.
  - Supports legacy absolute paths for backward compatibility if they are within the `PPOS_PREFLIGHT_STORAGE_ROOT`.
- **Tenant Boundary Validation**: The `storage.validateTenantPath` helper is used during artifact retrieval to ensure the resolved file path belongs to the requesting tenant's repository.

## 5. Security Auditing
The system implements high-fidelity audit logging for security-critical events:
- `AUTH_DENIED`: Unauthorized access attempts (invalid token/IP).
- `LICENSE_DENIED`: Access attempts from unlicensed tenants.
- `UPLOAD_FAILED`: Rejected files (invalid type/size).
- `ARTIFACT_DOWNLOAD`: Tracking data extraction.
- `QUOTA_EXCEEDED`: Attempts to bypass storage limits.

## 6. Threat Mitigation Matrix

| Threat | Mitigation Strategy |
|--------|---------------------|
| **Tenant Spoofing** | Tenant identity is resolved from auth context, never from request body. |
| **Credential Brute Force**| Audit logging of failures; expected to be behind a WAF/Rate-limiter. |
| **Path Traversal** | Strict path resolution and verification against storage root. |
| **Insecure Defaults** | Bootstrap token warnings and mandatory token configuration for production. |
