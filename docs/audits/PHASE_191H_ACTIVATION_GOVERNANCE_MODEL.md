# Phase 191H: Controlled Activation Governance Model

## 1. Governance Separation
Approval does **NOT** equal activation:
```text
ONBOARDING_COMPLETE
!=
MARKETPLACE_APPROVED
!=
PRODUCTION_ROUTING_ENABLED
!=
LIVE_QUOTING_ENABLED
```

## 2. Controlled Activation Transaction
- **Endpoint**: `POST /api/admin/printhouse-reviews/:reviewId/activate`
- **Preconditions**:
  1. Review status MUST be `APPROVED`.
  2. Recomputed readiness MUST have 0 blocking issues.
- **Atomicity**: Transactional grant insertion into `printhouse_activation_grants`. Either all capability flags are granted, or the transaction rolls back cleanly (`NO_PARTIAL_ACTIVATION`).
