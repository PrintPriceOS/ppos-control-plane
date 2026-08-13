# PHASE_191D2_DATABASE_ACCEPTANCE.md

## Test Database Initializer Safety Report
The database initialization script `scripts/init_test_db.js` has been hardened with strict safety rules:

```text
ALLOW_DISPOSABLE_DB_INIT: REQUIRE_TRUE
NODE_ENV: REJECT_PRODUCTION
HOST: REJECT_NON_LOCAL
DATABASE_NAME: REQUIRE_CONTAIN_TEST
PROD_DB_NAMES: EXPLICIT_BLOCK
```

- **Environment gates**:
  - Requires `ALLOW_DISPOSABLE_DB_INIT=true` to execute.
  - Aborts immediately if `process.env.NODE_ENV` is set to `production`.
- **Database host guards**:
  - Parses host from `DATABASE_URL` (or discrete env vars).
  - Explicitly rejects connection hosts other than `localhost`, `127.0.0.1`, or `::1`.
- **Database name check**:
  - Aborts if the target database name does not contain the word `test`.
  - Blocks standard production names (`ppos_production`, `ppos_prod`, `printpriceos`, `printpriceos_prod`).

---

## Seeding and Schema Versions Baseline Explanation
When initializing the test database, `scripts/init_test_db.js` seeds the `schema_versions` table with baseline rows matching legacy migrations (up to prefix `136`).
- **Baseline checksum verification**: Cheksums are extracted from `migrations/migration-integrity-baseline.json` which is version-controlled.
- **Why they are not executed**: Pre-existing historical schema is restored directly via baseline snapshots (`scripts/phase190_test_fixture_base.sql`, etc.) to prevent slow and fragile migrations execution over a clean DB.
- **Result status**:
  ```text
  FULL_CLEAN_MIGRATION_CHAIN: NOT_SUPPORTED
  BASELINED_DISPOSABLE_SCHEMA: PASS
  ```
  This is a standard testing baseline seed practice and does not claim clean-chain migration acceptance.
