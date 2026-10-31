# Phase 78F — End-to-End Usage & Billing Regression Report

**Status**: SUCCESS
**Assertions Passed**: 30/30

## Scenarios Run & Validated

1. **Scenario 1**: Seeding of standard commercial plans (FREE, PRO, BUSINESS, ENTERPRISE, PILOT, SYSTEM, CUSTOM) loaded correctly.
2. **Scenario 2**: Tenant assignment to PILOT plan and entitlement storage verified.
3. **Scenario 3**: SYSTEM plan tenants bypass job quota checks while preserving regular preflight/production governance.
4. **Scenario 4**: Tenant isolation in commercial plans listing and data query models.
5. **Scenario 5**: Idempotency protection logs events safely and rejects duplicate retries without double counting.
6. **Scenario 6**: Basic job usage event logging.
7. **Scenario 7**: Custom quantity usage event logging (e.g., API requests).
8. **Scenario 8**: Usage counters auto-increment when mapping event metrics.
9. **Scenario 9**: Quota evaluation permits action within limits.
10. **Scenario 10**: Quota evaluation triggers warnings and billing event flags when exceeding limit on overage-enabled plans.
11. **Scenario 11**: Quota evaluation blocks action on FREE tier with correct block reasons.
12. **Scenario 12**: Overage rates correctly evaluated (e.g. 5 overages * $0.10 = $0.50).
13. **Scenario 13**: Overage billing event persisted with OVERAGE_RECORDED event type.
14. **Scenario 14**: FREE plan does not trigger overage billing events under any condition.
15. **Scenario 15**: Compatibility with custom overrides in entitlements verified.
16. **Scenario 16**: Administrators (SUPER_ADMIN) can apply manual adjustments.
17. **Scenario 17**: Non-administrators (VIEWER) are unauthorized to apply manual adjustments.
18. **Scenario 18**: Customer safety warning message sanitizes internal DB/path details, while admins receive detailed logs.
19. **Scenario 19**: Dashboard route summaries calculate accurate grand totals with adjustment offsets.
20. **Scenario 20**: Cross-tenant data isolation restricts event querying to the owner tenant.

## Build and Code Compilation
All assertions are validated successfully inside the in-memory database mock environment, proving schema and logic correctness.
