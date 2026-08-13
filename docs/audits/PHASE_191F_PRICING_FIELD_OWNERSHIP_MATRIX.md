# Phase 191F: Pricing Field Ownership Matrix

## 1. Field Scope and Ownership Breakdown

| Field | Owner | Mutability Scope | Security Enforcement |
| --- | --- | --- | --- |
| **`currency`** | Printhouse Operator | Editable in Draft mode | Enforced at Price Book creation |
| **`base_cost`** | Printhouse Operator | Editable in Draft mode | Restricted to positive decimal values |
| **`setup_fee`** | Printhouse Operator | Editable in Draft mode | Restricted to positive decimal values |
| **`minimum_order_value`** | Printhouse Operator | Editable in Draft mode | Restricted to positive decimal values |
| **`expedite_surcharge`** | Printhouse Operator | Editable in Draft mode | Percentage or flat adjustment bounds |
| **`effective_from` / `effective_to`** | Printhouse Operator | Editable in Draft | Range overlap checks on publish |
| **`status` (DRAFT/RETIRED)** | Printhouse Operator | Editable by self-service | Lifecycle transition validator |
| **`approved`** | Control Plane Admin | Read-only for self-service | Blocked via `FIELD_NOT_EDITABLE` |
| **`published`** | Control Plane Admin | Read-only for self-service | Blocked via `FIELD_NOT_EDITABLE` |
| **`platform_commission`** | System/Global Admin | Read-only for self-service | Blocked via `FIELD_NOT_EDITABLE` |
| **`admin_adjustment`** | Control Plane Admin | Read-only for self-service | Blocked via `FIELD_NOT_EDITABLE` |
| **`reconciliation_status`** | Ledger / System | Read-only for self-service | Blocked via `FIELD_NOT_EDITABLE` |
| **`snapshot_sealed`** | Order Pipeline | Immutable | Trigger-blocked at DB level |
| **`customer_contract_id`**| Global Admin | Read-only for self-service | Blocked via `FIELD_NOT_EDITABLE` |
