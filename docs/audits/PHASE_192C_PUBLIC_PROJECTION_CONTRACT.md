# Phase 192C: Public Projection Contract

## 1. Safe Public Fields Exposed
- `printhouseId`, `siteId`, `displayName`, `country`, `city`
- `qualitySummary`: `score`, `slaTier`
- `capabilities`: `marketplaceVisible`, `liveQuotingAllowed`, `supportedProcessTypes`

## 2. Protected Internal Fields Excluded
- Internal unit cost models and pricing rules
- API credentials, key hashes, webhook secrets
- Admin notes, risk scores, internal audit logs
- Live machine queue state or dispatch metrics
