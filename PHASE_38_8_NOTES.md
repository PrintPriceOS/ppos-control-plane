# Phase 38.8 Operational Documentation

This document provides deployment guidelines, API details, and operational protocols for the **Production Completion Execution & Delivery Handoff** flow implemented in Phase 38.8.

---

## 1. Database Schema Lifecycle
The migration script is stored in [012_phase38_8_production_completion.sql](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/012_phase38_8_production_completion.sql). It is applied automatically on application startup via `MigrationService`.

The migration appends the following columns to `marketplace_orders`:
- `production_completed_at` (TIMESTAMP NULL)
- `production_completed_by` (VARCHAR(128) NULL)
- `production_completion_status` (VARCHAR(64) NULL)
- `delivery_handoff_status` (VARCHAR(64) NULL)
- `delivery_handoff_ready_at` (TIMESTAMP NULL)
- `delivery_handoff_ready_by` (VARCHAR(128) NULL)
- `final_production_audit_json` (JSON NULL)

---

## 2. API Reference & Payloads

### A. GET `/api/admin/marketplace/orders/:id/production/completion-eligibility`
Evaluates whether the order satisfies completion requirements.
- **Returns**:
  ```json
  {
    "ok": true,
    "eligible": true,
    "orderId": "ord_1",
    "currentStatus": "PRODUCTION_COMPLETION_READY",
    "targetStatus": "PRODUCTION_COMPLETED",
    "blockers": [],
    "warnings": [],
    "evidence": {
      "dispatchPackageStatus": "PRODUCTION_IN_PROGRESS",
      "invoiceStatus": "ISSUED",
      "paymentStatus": "PAYMENT_CONFIRMED",
      "productionUnlockStatus": "PRODUCTION_UNLOCKED",
      "machineAssignmentStatus": "ASSIGNED",
      "hasDownloadCompleted": true
    }
  }
  ```

### B. POST `/api/admin/marketplace/orders/:id/production/complete`
Executes production completion.
- **Payload Schema**:
  ```json
  {
    "overrideEligibility": false,
    "operatorReason": "Bypass reason (Only required if overrideEligibility: true)",
    "note": "Optional completion notes"
  }
  ```
- **Returns**:
  ```json
  {
    "ok": true,
    "orderId": "ord_1",
    "previousStatus": "PRODUCTION_COMPLETION_READY",
    "status": "PRODUCTION_COMPLETED",
    "deliveryHandoffStatus": null,
    "blockers": [],
    "warnings": [],
    "events": ["PRODUCTION_COMPLETED", "PRODUCTION_COMPLETION_EXECUTED"],
    "audit": {
      "orderId": "ord_1",
      "completedAt": "2026-05-26T12:00:00.000Z",
      "completedBy": "break-glass-session",
      "previousStatus": "PRODUCTION_COMPLETION_READY",
      "newStatus": "PRODUCTION_COMPLETED",
      "filesVerified": true,
      "paymentVerified": true,
      "preflightStatus": "PASSED",
      "dispatchPackageStatus": "PRODUCTION_IN_PROGRESS",
      "machineAssignmentStatus": "ASSIGNED",
      "blockers": [],
      "warnings": [],
      "overrideUsed": false
    },
    "idempotent": false
  }
  ```

### C. GET `/api/admin/marketplace/orders/:id/delivery/handoff-readiness`
Evaluates delivery handoff readiness.
- **Returns**:
  ```json
  {
    "ok": true,
    "eligible": true,
    "orderId": "ord_1",
    "currentStatus": "PRODUCTION_COMPLETED",
    "deliveryHandoffStatus": "PENDING",
    "blockers": [],
    "warnings": [],
    "evidence": {
      "deliveryMode": "STANDARD",
      "hasDestination": true,
      "paymentStatus": "PAYMENT_CONFIRMED"
    }
  }
  ```

### D. POST `/api/admin/marketplace/orders/:id/delivery/prepare-handoff`
Triggers the state transition to `DELIVERY_HANDOFF_READY`.
- **Returns**:
  ```json
  {
    "ok": true,
    "orderId": "ord_1",
    "previousStatus": "PRODUCTION_COMPLETED",
    "status": "DELIVERY_HANDOFF_READY",
    "deliveryHandoffStatus": "DELIVERY_HANDOFF_READY",
    "blockers": [],
    "warnings": [],
    "events": ["DELIVERY_HANDOFF_EVALUATED", "DELIVERY_HANDOFF_READY"],
    "audit": {
      "handoffAt": "2026-05-26T12:05:00.000Z",
      "readyBy": "break-glass-session"
    },
    "idempotent": false
  }
  ```

---

## 3. Governance Protocols

### A. Safe Override Execution (Break-Glass)
When completing an ineligible order (e.g. file audit checks failed but physical printing has been completed and verified manually), the operator can perform a break-glass action.
- **Condition**: Must supply `"overrideEligibility": true` and a non-empty string in `"operatorReason"`.
- **Audit**: Logged as a `PRODUCTION_COMPLETION_ELIGIBILITY_OVERRIDDEN` event in `marketplace_order_events` with the operator ID and justification, ensuring high accountability.

### B. Safe Test Mutation Mode
The smoke test script [smoke_phase_38_8_production_completion.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/scripts/smoke_phase_38_8_production_completion.js) runs in mock mode by default. Mutation of live/real orders is prevented unless `PHASE_38_8_ALLOW_MUTATION=true` is set.
