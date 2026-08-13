# Phase 191A — Readiness Model & Domain States

## 1. Multi-Dimensional Readiness Pillars

Instead of a single client-reported progress percentage, readiness is dynamically calculated by `onboardingReadinessService.js` on the backend using authoritative database facts.

```
+-----------------------------------------------------------------------------------+
| ACCOUNT SETUP           | Verified email + Basic identity + Contact information  |
+-----------------------------------------------------------------------------------+
| OPERATIONAL READINESS   | 1+ Active Production Site + 1+ Configured Machine +      |
|                         | Materials Catalog + Machine Capabilities                |
+-----------------------------------------------------------------------------------+
| MARKETPLACE READINESS   | Operational Readiness + Verified Tax/Fiscal ID +        |
|                         | Published Pricing Rules + Delivery Regions + Quality SLA |
+-----------------------------------------------------------------------------------+
```

## 2. Proposed Domain States

### Tenant Domain States (`tenants.status`)
* `PENDING_EMAIL_VERIFICATION`: Initial state prior to activation token consumption.
* `ACTIVE`: Authenticated account, able to access dashboard and explore features.
* `SUSPENDED`: Suspended due to compliance or billing issues.
* `CLOSED`: Terminated account.

### Onboarding Progress States (`printhouse_onboarding_profiles.current_status`)
* `NOT_STARTED`: Email activated, no dashboard modules completed.
* `IN_PROGRESS`: Company profile or production site started.
* `CORE_COMPLETE`: Company profile and primary site set up.
* `OPERATIONALLY_READY`: Machines, capabilities, and materials configured.
* `MARKETPLACE_READY`: Full pricing, tax, and delivery coverage published.

### Printer Node Domain States (`printer_nodes.status`)
* `DRAFT`: Initial creation during activation.
* `CONFIGURING`: Under active setup in dashboard.
* `READY_FOR_REVIEW`: Submitted by user for internal review.
* `APPROVED` / `ACTIVE`: Approved for live order routing.
* `REJECTED`: Review rejected with reason code.
* `SUSPENDED`: Suspended from active dispatch.
