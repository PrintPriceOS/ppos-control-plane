# Phase 192B: Canonical Activation Adapter Contract

## 1. Adapter Interface (`src/api/services/printhouseActivationAdapter.js`)

```javascript
// Get all capability flags for tenant
const caps = await activationAdapter.getCapabilities({ tenantId, siteId });

// Check boolean capability presence
const isQuotable = await activationAdapter.hasCapability({ tenantId, siteId, capability: 'LIVE_QUOTING_ALLOWED' });

// Enforce capability presence (Fails Closed if missing or suspended)
const verified = await activationAdapter.requireCapability({ tenantId, siteId, capability: 'LIVE_QUOTING_ALLOWED' });
```

## 2. Fail-Closed Error Mapping
- Missing Grant: `PRINTHOUSE_CAPABILITY_NOT_GRANTED` (HTTP 403)
- Suspended Activation: `PRINTHOUSE_SUSPENDED` (HTTP 403)
- Invalid Capability: `PRINTHOUSE_CAPABILITY_STATE_INVALID` (HTTP 400)
- Database Failure: `PRINTHOUSE_CAPABILITY_CHECK_FAILED` (HTTP 400)
