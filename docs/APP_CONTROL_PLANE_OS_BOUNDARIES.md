# PrintPrice OS: Architectural Boundaries

This document defines the strict separation between the **Preflight APP** and the **Control Plane** within the PrintPrice OS ecosystem.

## 1. Product Responsibilities

### Preflight APP (Universal End-User Product)
- **Scope**: Canonical tool for authors, publishers, and printers to inspect and certify PDF files.
- **Goal**: Facilitate the document preparation workflow.
- **Backend**: Consumes the **PrintPrice OS / Preflight Service** directly.
- **Independence**: Must function regardless of the Control Plane status.

### Control Plane (Licensed Operational Backend)
- **Scope**: Backoffice management and governance tool for **Printer Tenants** and System Operators.
- **Goal**: Manage quotas, monitor worker health, perform job forensics, and oversee system-wide audit logs.
- **Backend**: Consumes shared OS services but exposes its own administrative API surface.
- **Independence**: Must not depend on transient APP state (e.g., UI preferences, draft jobs).

## 2. Role Boundaries

| Role | Responsibility | Primary Interface |
|------|----------------|-------------------|
| **Author / Publisher** | Owns content, initiates preflight, downloads certificates. | Preflight APP |
| **Printer Operator** | Manages production, receives assigned jobs, monitors storage. | Control Plane |
| **System Admin** | Global governance, infrastructure health, system audit. | Control Plane |

## 3. API Ownership

### Control Plane API (`/api/admin/preflight/*`)
- **Owned by**: Control Plane.
- **Accessibility**: Restricted to authenticated Printer/Admin roles only.
- **Purpose**: Operational telemetry, quota enforcement, forensic detail.

### OS / Preflight Service API (`/api/preflight/*`)
- **Owned by**: PrintPrice OS (Upstream Service).
- **Accessibility**: Public/Tenant/User scoped.
- **Purpose**: Core processing, job submission, artifact retrieval for the APP.

## 4. Shared Entities (The OS Layer)
The following entities are **Shared State** belonging to the PrintPrice OS layer. Both products consume these, but neither "owns" them exclusively.

- **Jobs**: Persistent processing records (`preflight_jobs`).
- **Artifacts**: Physical files and metadata (`preflight_artifacts`).
- **Tenants**: Identity and configuration of organizational units.
- **Licenses**: Entitlements determining feature access.
- **Quotas**: Resource limits (e.g., 2GB storage cap).
- **Policies**: Configurable preflight rulesets.
- **Audit Logs**: Governance trace of all system events.

## 5. Visibility & Data Ownership

### Tenant Ownership Model
- Every entity (Job, Artifact, Audit Log) is anchored to a **Tenant ID**.
- Control Plane enforces this at the database level: `WHERE tenant_id = ?`.

### Visibility Rules
- **APP Visibility**: Users see only jobs where `owner_user_id` matches their identity.
- **Control Plane Visibility**: Printers see jobs where `assigned_printer_tenant_id` matches their tenant ID, enabling fulfillment of work submitted via the APP.

## 6. Future Sharing Model: The Handover
1. **Author (APP)** performs a preflight check and generates a `certified.pdf`.
2. **Author (APP)** clicks "Send to Printer".
3. **OS Layer** updates the job's `assigned_printer_tenant_id`.
4. **Printer (Control Plane)** immediately sees the job in their operational dashboard without data duplication.

## 7. Non-Goals
- **Control Plane as Proxy**: The Control Plane should NOT act as a gateway for the APP.
- **APP as Admin**: The APP should NOT expose any `/api/admin` functionality.
- **Merged Identity**: User sessions in the APP should not automatically grant Admin permissions in the Control Plane unless explicitly mapped via Roles.

## 8. Architectural Integrity Rules
- **Rule 1**: The Preflight APP must NEVER call `/api/admin/*` endpoints.
- **Rule 2**: The Control Plane must NEVER depend on client-side state from the APP.
- **Rule 3**: Both must maintain a clean separation of concerns, communicating only through the shared PrintPrice OS data contracts.
