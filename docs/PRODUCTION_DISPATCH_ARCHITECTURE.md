# Production Dispatch Architecture

This document defines the architectural foundation for transforming certified preflight artifacts into dispatchable print-production jobs within the PrintPrice OS ecosystem, specifically focusing on the role of the **Control Plane** as the operational management layer.

## 1. Vision & Scope
The goal of this architecture is to provide a robust mechanism to manage the lifecycle of print jobs from the moment a document is certified until it is successfully produced at a licensed **PrintHouse Node**.

The **Control Plane** serves as the administrative cockpit for:
- Monitoring and managing **Print Nodes**.
- Governing **Production Packages** and their fulfillment.
- Overseeing the **Dispatch** pipeline and operational audit logs.

## 2. Core Entities (Phase 11 Implementation)

### 2.1 Print Nodes (`print_nodes`)
Represents a licensed physical or logical production facility.
- **Identity**: Unique Node ID, Name, Physical Location.
- **Status**: Online, Offline, Busy, Maintenance.
- **Capabilities**: Supported formats, finishes, substrates, and capacity.
- **Ownership**: Belong to a **Printer Tenant**.

### 2.2 Production Packages (`production_packages`) (Phase 11 Implementation)
The canonical container for a print-ready job.
- **Source**: Created from a `certified.pdf` artifact and a set of production specifications.
- **Composition**: Links to one or more `production_package_artifacts`.
- **Metadata**: Quantity, binding, paper specs, priority, and deadlines.
- **Status**: `DRAFT`, `READY_FOR_DISPATCH`, `DISPATCHED`, `ACCEPTED_BY_PRINTER`, `REJECTED_BY_PRINTER`, `IN_PRODUCTION`, `COMPLETED`, `CANCELLED`.
- **Validation**: Enforces tenant ownership and artifact integrity upon creation.

### 2.3 Production Dispatches (`production_dispatches`) (Phase 11 Implementation)
The transactional record of a package being assigned to a node.
- **Participants**: Links a `sender_tenant_id` (Customer) and a `receiver_tenant_id` (Printer).
- **Lifecycle**: `PENDING`, `SENT`, `VIEWED`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `CANCELLED`.
- **Visibility**: Enforces strict RBAC; senders only see outgoing, printers only see incoming.
- **Timing**: Tracks `accepted_at` and `rejected_at` for SLA monitoring.

### 2.4 Production Package Artifacts (`production_package_artifacts`)
Specific files required for production (e.g., Print PDF, Cover PDF, JDF instructions).
- **Storage**: Anchored to the OS Storage layer but logically grouped under a Production Package.
- **Integrity**: Hash-verified and immutability-locked once the package is `READY`.

### 2.5 Production Events (`production_events`)
The granular audit trail for the entire production lifecycle.
- **Types**: `PACKAGE_CREATED`, `NODE_DISPATCHED`, `NODE_ACCEPTED`, `INK_START`, `FINISHING_COMPLETE`, `PACKAGE_SHIPPED`.

## 3. Lifecycles

### 3.1 Production Package Lifecycle
1.  **Initialization**: Created by the OS Layer (via APP/BPE) when a user requests production for a certified file.
2.  **Staging**: Artifacts are gathered and validated (e.g., ensuring high-res assets are present).
3.  **Ready**: Package is locked and ready for node matching.
4.  **Active**: Package is currently being processed or in the dispatch queue.
5.  **Terminal**: Reaches `COMPLETED` or `CANCELLED` status.

### 3.2 Print Node Lifecycle
1.  **Provisioning**: Node is registered in the Control Plane and assigned a license.
2.  **Activation**: Node authenticates and signals its initial state.
3.  **Operational**: Node heartbeats regularly, reporting capacity and current load.
4.  **Decommissioning**: Node is gracefully removed from the dispatch pool.

### 3.3 Dispatch Lifecycle
1.  **Matching (Phase 11 Implementation)**: Control Plane identifies compatible nodes for a `READY_FOR_DISPATCH` package using a deterministic scoring engine.
2.  **Offer**: A dispatch record is created in `PENDING_ACCEPTANCE` state.
3.  **Response**: The node `ACCEPTS` or `REJECTS` (with reason).
4.  **Execution**: Once accepted, the node pulls artifacts and begins production.
5.  **Completion**: Node reports progress until the dispatch is marked `ACTIVE` -> `DONE`.

## 4. Ownership & Visibility

### 4.1 Ownership Model
- **Tenancy**: All entities are strictly anchored to a **Tenant ID**.
- **Printer Ownership**: Print Nodes and Dispatches are owned by the **Printer Tenant**.
- **Customer Ownership**: Production Packages are owned by the **Customer Tenant** (Author/Publisher) but visible to the assigned Printer.

### 4.2 Visibility Model
- **Control Plane**: System Admins see all dispatches. Printer Operators see only packages dispatched to their own nodes.
- **OS Layer**: Provides the shared data store that both the APP (customer-facing) and Control Plane (operator-facing) consume.

## 5. API & Responsibility Boundaries

### 5.1 OS Layer (Creation & Storage)
- **Responsibility**: Exposes APIs for the **Preflight APP** and **Book Price Engine** to initiate production requests.
- **Endpoint Pattern**: `/api/os/production/create-package`.
- **Function**: Persists the initial `production_package` and links it to the `preflight_artifact`.

### 5.2 Control Plane (Management & Dispatch)
- **Responsibility**: Exposes APIs for **Admin/Printer** users to manage nodes and oversee dispatches.
- **Endpoint Pattern**: `/api/admin/dispatch/*` and `/api/admin/nodes/*`.
- **Function**: Implements the matching logic, manages node health, and provides production telemetry.

## 6. Operational Flow

1.  **Preflight Artifact**: A document is certified in the **Preflight APP**.
2.  **Production Package**: The user selects "Production Mode"; the **OS Layer** creates a package linked to the artifact.
3.  **Node Matching**: The **Control Plane** deterministic matching engine scans for licensed nodes matching the job specifications (Binding, Trim, Color, Paper, Size).
4.  **Dispatch**: The **Control Plane** triggers a dispatch offer to the selected node.
5.  **Accept/Reject**: The Printer Operator (via Control Plane UI) or an Automated Node accepts the job.
6.  **Production Tracking**: The node sends periodic `production_events` to the Control Plane, providing real-time status to both the printer and the customer.

## 7. Security & Governance
- **Licensing**: Dispatching is only possible to nodes with an active **PrintHouse License**.
- **Normalization**: Machine profiles are automatically normalized into structured capabilities upon registration.
- **Encryption**: Artifacts are encrypted at rest; nodes receive temporary SAS tokens for download.
- **Audit**: Every state change in the dispatch lifecycle and node registration is recorded in `production_events` (or `audit_logs`).
