# PrintPrice OS — Phase 191 Onboarding Redesign Final Architecture

## 1. Complete Printhouse Onboarding Journey

```text
  [ Email / Google Identity ]
              │
              ▼
    [ Email Verification ] (Phase 191A / 191B)
              │
              ▼
   [ Workspace Activation ] (Phase 191B)
              │
              ▼
    [ Printhouse Setup Hub ] (Phase 191C - 191G)
    ├── 1. Company Profile
    ├── 2. Production Sites
    ├── 3. Machinery Fleet (Phase 191D)
    ├── 4. Capabilities (Phase 191D)
    ├── 5. Materials Catalog (Phase 191E)
    ├── 6. Capacity & Lead Times (Phase 191E)
    ├── 7. Pricing Engine & Price Books (Phase 191F)
    └── 8. Shipping Regions & Integrations (Phase 191G)
              │
              ▼
   [ Marketplace Readiness ] (Phase 191H)
              │  (Submit Evidence Snapshot)
              ▼
    [ Governed Admin Review ]
    ├── DRAFT -> READY_FOR_REVIEW -> UNDER_REVIEW
    ├── CHANGES_REQUESTED -> Resubmit
    └── APPROVED (MARKETPLACE_APPROVED: true)
              │
              ▼
 [ Controlled Atomic Activation ]
    ├── Grants MARKETPLACE_VISIBLE
    ├── Grants LIVE_QUOTING_ALLOWED
    ├── Grants JOB_ROUTING_ALLOWED
    └── Grants PRODUCTION_DISPATCH_ALLOWED
              │
              ▼
    [ Production Dispatch Active ]
```

## 2. Security Boundaries Matrix

```text
ACCOUNT ACTIVE
!=
CONFIGURATION COMPLETE
!=
REVIEW APPROVED
!=
MARKETPLACE VISIBLE
!=
LIVE QUOTING ALLOWED
!=
PRODUCTION ROUTING ENABLED
```

- Completing onboarding forms does **NOT** grant live job routing.
- Approving a marketplace review sets `MARKETPLACE_APPROVED: true`, but does **NOT** grant live job routing.
- Live job routing and marketplace visibility are enabled **ONLY** by explicit admin controlled activation (`POST /api/admin/printhouse-reviews/:reviewId/activate`).
- Admin suspension instantly revokes all capability grants while preserving historical transaction data.
