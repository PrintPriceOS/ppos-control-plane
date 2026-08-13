# Phase 191G: Implementation Report

## 1. Subsystem Architecture
Phase 191G introduces governed shipping regions & delivery configuration along with integration readiness:

1. **Shipping Domain**:
   - `printhouseShippingRegionService.js` & `printhouseDeliveryEstimateService.js`
   - Scoped to `tenant_id` and `site_id`.
   - Production lead time + handling time + transit time = non-binding estimated delivery window.

2. **Integration Domain**:
   - `printhouseIntegrationService.js`, `printhouseIntegrationCredentialService.js`, & `printhouseWebhookService.js`
   - Lifecycle management (`DRAFT` -> `CONFIGURING` -> `VALIDATING` -> `READY`).
   - Server-side API key generation with single-reveal secrets, bcrypt/SHA256 hashes, and AES-256-GCM encryption at rest.
   - Strict SSRF URL validation guardrail blocking loopbacks, RFC1918, link-local, cloud metadata, and unsafe schemes.

## 2. File Inventory

### Migrations
- `migrations/142_phase191g_shipping_and_integration_readiness.sql`

### Services
- `src/api/services/printhouseShippingRegionService.js`
- `src/api/services/printhouseDeliveryEstimateService.js`
- `src/api/services/printhouseIntegrationService.js`
- `src/api/services/printhouseIntegrationCredentialService.js`
- `src/api/services/printhouseWebhookService.js`
- `src/api/services/printhouseReadinessService.js` (extended)

### API Routes
- `src/api/routes/printhouseShippingRoutes.js`
- `src/api/routes/printhouseIntegrationRoutes.js`

### UI Components
- `src/ui/components/printhouse/setup/ShippingPanel.tsx`
- `src/ui/components/printhouse/setup/IntegrationsPanel.tsx`
- `src/ui/pages/printhouse/PrinthouseSetupHub.tsx` (updated)

### Test Suites
- `scripts/smoke_phase191g_shipping_integrations.js`
- `tests/smoke_phase191g_http_routes.js`
- `tests/shipping_ssrf_secret_security_test.js`
