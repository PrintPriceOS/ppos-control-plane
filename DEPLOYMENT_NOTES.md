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

## Monitoring
Monitor the `marketplace_events` and `production_file_events` tables for any `FAILED` ingestion or validation events. Admin intervention is required for orders stuck in `FILES_PENDING` due to remote fetch failures.
