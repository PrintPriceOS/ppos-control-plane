# Phase 191H: Legacy Compatibility

## 1. Backwards Compatibility Policy
- **Existing Active Accounts**: Historical active partners (`status === 'ACTIVE'`) remain active without breaking existing integrations or order fulfillment.
- **Graceful Degradation**: Fallback defaults return `NOT_ACTIVATED` for unreviewed nodes while keeping historical order queries intact.
- **No Disruptive Deactivation**: Automated readiness calculations do not deactivate existing active accounts.
