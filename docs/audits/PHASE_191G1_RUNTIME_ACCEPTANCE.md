# Phase 191G.1: Runtime & Service Execution Acceptance

## 1. Execution Evidence Log

### Service-Level Smoke Test (`scripts/smoke_phase191g_shipping_integrations.js`)
```text
=== Starting Phase 191G Shipping & Integration Smoke Tests ===

✓ Shipping region created successfully
✓ Delivery method added to region
✓ Non-binding delivery window calculated cleanly
✓ Integration profile created in DRAFT status
✓ API credential issued with one-time secret and masked listing
✓ Webhook target configured & SSRF loopback injection rejected
✓ Webhook connectivity test completed without enabling production dispatch
✓ Shipping and Integration completeness audit gates verified

All Phase 191G Shipping & Integration Smoke Tests Passed Successfully!
```

### HTTP Route & Tenant Isolation Test (`tests/smoke_phase191g_http_routes.js`)
```text
=== Starting Phase 191G HTTP Routes Smoke Tests ===

✓ Cross-tenant access to foreign shipping region blocked (404)
✓ Protected field injection on shipping region rejected
✓ Cross-tenant access to foreign integration profile blocked (404)

All Phase 191G HTTP Route & Multi-Tenant Smoke Tests Passed Successfully!
```

### SSRF & Secret Security Test (`tests/shipping_ssrf_secret_security_test.js`)
```text
=== Starting Phase 191G SSRF & Secret Security Tests ===

✓ All 9 SSRF vector URLs correctly rejected by SSRF guardrail
✓ Valid HTTPS external URL accepted
✓ AES-256-GCM secret encryption at rest verified with clean decryption
✓ Protected field injection strictly rejected with FIELD_NOT_EDITABLE

All Phase 191G SSRF & Secret Security Tests Passed Successfully!
```

### Frontend Production Build (`npm run build`)
```text
vite v6.4.2 building for production...
✓ 3518 modules transformed.
rendering chunks...
dist/index.html                            1.11 kB │ gzip:   0.51 kB
dist/assets/index-CF46vhlf.css           279.47 kB │ gzip:  39.60 kB
dist/assets/index-DaFsP7V7.js          2,799.61 kB │ gzip: 518.23 kB
✓ built in 10.34s
```

## 2. Invariant Verification
- `INTEGRATION_READY != PRODUCTION_ROUTING_ENABLED`: PASS. Setting an integration status to `READY` or testing webhooks does **NOT** grant live production job dispatch.
- `NON_BINDING_ESTIMATE_ONLY`: PASS. Delivery estimate calculation generates no orders, shipments, or carrier labels.
