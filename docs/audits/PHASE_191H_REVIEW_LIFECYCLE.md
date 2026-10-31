# Phase 191H: Governed Review Lifecycle

```text
       [ Printhouse Submit ]
                 │
                 ▼
          READY_FOR_REVIEW
                 │
           [ Admin Start ]
                 │
                 ▼
            UNDER_REVIEW ─────────────────┐
            │          │                  │
    [ Approve ]   [ Request Changes ]  [ Reject ]
        │              │                  │
        ▼              ▼                  ▼
     APPROVED   CHANGES_REQUESTED      REJECTED
        │
 [ Controlled Activate ]
        │
        ▼
     ACTIVATED
        │
   [ Suspend ]
        │
        ▼
     SUSPENDED
```

## 1. Lifecycle Rules
- **Printhouse Operator**: Can submit setup for review when 0 blockers remain. Cannot perform self-approval or self-activation.
- **Platform Admin**: Controls all status transitions (`UNDER_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, `REJECTED`, `ACTIVATED`, `SUSPENDED`).
- **Audit Logging**: Every transition logs structured audit records with reviewer actor details and reason codes.
