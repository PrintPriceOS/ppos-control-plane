# Phase 183 — Migration Integrity & Schema Baseline Documentation

## 1. Context and Rationale
To ensure the auditability and reproducibility of the `ppos-control-plane` production environments, we must baseline all SQL migrations and eliminate runtime schema modification vectors. 

### Why Historical Migrations Are Not Renamed
Renaming existing migration files (such as those with duplicate prefixes `013`, `014`, `015`) in active production systems introduces severe deployment risks:
- Out-of-sync tracking schemas where applied migrations are marked as pending.
- Drift between database state schemas across environments.
- Potential runtime lockouts during deployment operations.

Therefore, the three known prefix-collisions are grandfathered into the baseline definition and explicitly approved for verification.

---

## 2. Integrity Verification Protocol
Migration verification runs completely offline, requiring no database connectivity, to prevent schema corruption.

### Migration Identity
Identity is determined by the **literal relative file path** (e.g. `migrations/013_paywall_tenant_subscriptions.sql`) rather than the prefix number alone.

### Checksum Verification
- The validation matches every migration file's SHA-256 hash against the committed baseline file: `migrations/migration-integrity-baseline.json`.
- Any mismatch, missing file, or untracked new file triggers a non-zero exit validation error.

---

## 3. Workflow Procedures

### How to Add a New Migration
1. Write the new migration file in `migrations/` following numbering conventions.
2. Update the baseline by running:
   ```bash
   npm run migration:baseline:generate -- --replace-existing
   ```
3. Commit both the SQL migration and the updated baseline file together.

### How to Handle intentional Checksum Exceptions
Any intentional modification to an existing migration (strictly discouraged) must require manual verification and regeneration of the baseline with:
```bash
npm run migration:baseline:generate -- --replace-existing
```

---

## 4. Current Findings & Future Separation Plan
The audit identified:
- **Main Import-Time Initialization**: Disabled.
- **Runtime Schema Mutation**: Still present.
- **DDL/Application Separation**: Incomplete.

The findings from the scan have been cataloged in `reports/phase183_runtime_ddl_inventory.json` for future refactoring (Phase 184 onwards) to strip DDL queries entirely from the application source.
