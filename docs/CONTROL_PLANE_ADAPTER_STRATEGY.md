# CONTROL_PLANE_ADAPTER_STRATEGY.md

## Overview

The Control Plane must not depend on the specific table schemas or implementation details of the monolith's data layer. Instead, it will use **Adapters** to communicate with the shared infrastructure and regional services.

## Adapter Boundaries (`src/api/adapters/`)

### 1. Data Adapter (`DataAdapter.js`)
- **Role**: Replaces the monolith's `db.js`.
- **Target**: `@ppos/shared-infra/db`.
- **Functionality**: Standardizes query execution and connection pooling across regional clusters.

### 2. Queue Operator Adapter (`QueueOperator.js`)
- **Role**: Replaces direct BullMQ manipulation.
- **Action**: Provides methods for `pause`, `resume`, `drain`, and `stats`.
- **Dependency**: Connects to the Redis cluster shared with preflight workers.

### 3. Tenant Intelligence Adapter (`TenantAdapter.js`)
- **Role**: High-level API for tenant management (Quarantine, Rate-limiting).
- **Justification**: Tenants are global entities. This adapter may eventually call a Central Identity Service instead of querying a local DB.

### 4. Network Registry Adapter (`NetworkAdapter.js`)
- **Role**: Interface for printer onboarding and state synchronization.
- **Justification**: Printer state is regional. This adapter abstracts which region the registry lives in.

### 5. Financial Settlement Adapter (`SettlementAdapter.js`)
- **Role**: Handles payouts and ledger updates.
- **Justification**: Financial logic is high-sensitivity and should be isolated from the UI routing logic.

## Allocation Table

| Domain | Action | New Ownership | Note |
| :--- | :--- | :--- | :--- |
| **Audit Logs** | Local Logging | `ppos-shared-infra` | Moves to centralized logging service. |
| **Metrics** | SQL Queries | `DataAdapter` | Abstracted via specific "Getter" methods. |
| **Jobs** | Direct DB update | `QueueOperator` | DB updates should follow queue state changes. |
| **Pricing** | Logic | `src/api/services/` | Logic remains in Control Plane; Data via Adapter. |
| **Connect** | CRUD | `NetworkAdapter` | Full isolation of printer registry. |

## Implementation Plan

1. **Stub Interfaces**: Create empty classes in `src/api/adapters/` that match the current expected API used by the migrated services.
2. **Rewire Imports**: Update all `require('../services/db')` to `require('../adapters/DataAdapter')`.
3. **Bridge Logic**: Implement the bridge to `@ppos/shared-infra`.
