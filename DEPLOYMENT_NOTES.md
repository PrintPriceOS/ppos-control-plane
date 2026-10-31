# Deployment Notes - Hardened Intake (v5.3)

## Infrastructure Requirements
- **Storage**: The application requires a writeable directory at `storage/production_files` relative to the project root.
- **Environment Variables**:
  - `PPOS_PREFLIGHT_AUTO_CERTIFY`: Set to `true` to enable automatic Preflight job creation for validated files.
  - `PPOS_ENABLE_SCHEMA_MUTATION`: Set to `true` to allow `MigrationService` to apply the 010 migration.

## Database Migration
The deployment includes migration `010_hardened_intake_contracts.sql`.
1. Ensure the `MigrationService` is active during startup.
2. If manual application is required, run the SQL script in `migrations/010_hardened_intake_contracts.sql` against the target database.

## Security Considerations
- **File Fetching**: The `productionFileIngestionService` uses a strict allow-list for external URLs. It blocks private IP ranges and non-HTTPS protocols to prevent SSRF.
- **Multipart Uploads**: All uploads are gated by `requireAdminScope` or `requirePrinthouseScope`.

## Operational Verification
After deployment, run the unified verification script to confirm end-to-end functionality:
```bash
node scripts/verify_hardened_intake_full.js
```

## Marketplace Orchestration (v10.0)
The marketplace gateway is now active at `/api/marketplace/offers`.

### Environment Variables
- `PPOS_PRICING_ENGINE_URL`: Base URL of the BPE (e.g., `https://bpe.printprice.pro`). Defaults to `http://127.0.0.1:8004`.
- `PPOS_PRICING_ENGINE_MARKETPLACE_PATH`: Path for native marketplace offers. Defaults to `/api/marketplace/offers`.
- `PPOS_PRICING_ENGINE_ESTIMATES_PATH`: Path for legacy estimates fallback. Defaults to `/api/estimates`.
- `PPOS_PRICING_ENGINE_TIMEOUT_MS`: Timeout for BPE requests. Defaults to `12000`.
- `PUBLIC_BPE_API_ENABLED`: Set to `true` to enable the public endpoint.
- `PPOS_CONTROL_TOKEN`: Mandatory Bearer token for industrial authentication.

### Operational Verification
To verify the public marketplace pricing flow:
```bash
node scripts/verify_marketplace_public_offers.js
```

## Monitoring
Monitor the `marketplace_events` and `production_file_events` tables for any `FAILED` ingestion or validation events. 
Log prefixes for marketplace: `[MARKETPLACE_PUBLIC]`, `[MARKETPLACE][PRICING-REQUEST]`, `[MARKETPLACE][PRICING-FALLBACK-ESTIMATES]`.

## Production Completion & Delivery Handoff (Phase 38.8)
Phase 38.8 implements operational closure from `PRODUCTION_COMPLETION_READY` to `PRODUCTION_COMPLETED` and transition of delivery state to `DELIVERY_HANDOFF_READY` with auditing, idempotency checks, and break-glass overrides.

### Database Migration
The deployment includes migration `012_phase38_8_production_completion.sql` which adds completion/handoff columns to the canonical `marketplace_orders` table. It runs automatically on app startup.

### Operational Verification
To run the automated integration/smoke checks:
```bash
node scripts/smoke_phase_38_8_production_completion.js
```
*Note: To allow mutation of real database rows, set `PHASE_38_8_ALLOW_MUTATION=true` in the environment.*

## Tenant Plan Governance & Grace Period Management (Phase 39.0)
Phase 39.0 implements a unified commercial status, grace period tracking, file/job limit enforcement, module access control, and Founding Printhouse access management.

### Database Migration
The deployment includes migration `013_phase39_0_tenant_plan_governance.sql` which adds plan governance, commercial status, access level, grace timestamps, and limits JSON columns to the `tenants` table. It also creates the `tenant_governance_events` audit table.

### Operational Verification
To run the automated integration and smoke checks:
```bash
node scripts/smoke_phase_39_0_tenant_plan_governance.js
```
