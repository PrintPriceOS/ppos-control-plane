# Phase 191F: Price Book Lifecycle

## 1. Lifecycle State Machine Transitions

Price books follow structured governed lifecycles to prevent active pricing corruption:

```mermaid
stateDiagram-v2
    [*] --> DRAFT : Operator creates
    DRAFT --> VALIDATING : Run coverage check
    VALIDATING --> DRAFT : Issues found
    VALIDATING --> READY_FOR_REVIEW : Coverage checks pass
    READY_FOR_REVIEW --> APPROVED : Admin reviews & signs
    APPROVED --> PUBLISHED : Effective date reached
    PUBLISHED --> RETIRED : Superseded or manually deactivated
    DRAFT --> RETIRED : Operator discards draft
```

---

## 2. Transition Governance Rules

- **`DRAFT`**:
  - Operators can freely add, modify, or archive pricing rules.
  - Not visible to quoting pipelines.
- **`VALIDATING`**:
  - Backend runs quantity tier coverage, currency consistency, and material matching validation checks.
- **`READY_FOR_REVIEW`**:
  - Read-only state submitted for Control Plane administrator review.
- **`APPROVED`**:
  - Signed off by administrator. Blocked from further self-service updates.
- **`PUBLISHED`**:
  - Live in the network. Read-only and immutable. Historical quoting snapshot engines query this state.
- **`RETIRED`**:
  - Deactivated. Preserved in database history for audit and order reconciliation lookup.
