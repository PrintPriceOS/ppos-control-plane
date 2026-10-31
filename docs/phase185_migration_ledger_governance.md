# Phase 185: Migration Ledger Governance & Database-State Verification

## Overview
Phase 185 establishes strict database-state checking and ledger governance for migration execution. It validates that the active database state is perfectly aligned with the repository migration truth, protecting the runtime environments from partially applied side-effects, corrupted schemas, or concurrent migration runs.

---

## Architectural Rules
1. **Source Truth**: Expected migrations and their canonical SHA-256 hashes are defined by the local repository baseline.
2. **Database Truth**: The database ledger (`schema_versions` table) keeps an audit log of applied executions.
3. **Execution Locks**: Database migrations must obtain a database advisory lock (`GET_LOCK`) to prevent concurrent updates from multiple servers or processes.
4. **Read-Only Gate**: The application gateway (`/ready` endpoint) evaluates table and column compatibility via a read-only database service. The runtime process must never attempt automatic schema mutations.

---

## Evolved Schema Schema
The `schema_versions` database table contains:
* `migration_path`: Canonical SQL path (e.g. `migrations/001_create_schema_version.sql`).
* `state`: Transition states `STARTED` -> `APPLIED` or `FAILED`.
* `execution_id`: Unique execution UUID to correlate runs.
* `runner_id`: Process ID and hostname trace.
* `started_at`, `heartbeat_at`, `applied_at`, `failed_at`: Full temporal resolution metrics.
* `failure_code`, `failure_message`: Sanitized error metrics.
* `failed_statement_index`, `description`: Fingerprints and statement coordinates.

---

## Failure Recovery Policy
If a migration fails during deployment:
1. The execution state in `schema_versions` is marked as `FAILED`.
2. All subsequent migration executions or application starts will fail-fast at the `/ready` gate (HTTP 503).
3. The migration runner CLI dry-run returns exit code `3` (Failed/Stale migration exists), blocking CI/CD pipelines.
4. **Manual Intervention Requirement**: Changing a `FAILED` state to `APPLIED` requires manual database resolution or explicitly resolving the partial statement side-effects. The engine will never retry corrupted runs automatically.
