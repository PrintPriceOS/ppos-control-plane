# Technical Note: Governed Schema Reconciliation for Migration 161 (OP-02B.2B)

- **Date:** 2026-10-18
- **Context:** Production & Staging Migration 161 (`migrations/161_phase184g_industrial_persistence_ledger.sql`)
- **Scope:** Column compatibility evaluation in `src/api/services/migration161ReconciliationService.js`

## 1. Root Cause Analysis
During pre-deployment diagnostic execution (`node -r dotenv/config scripts/run_control_plane_migrations.js --dry-run`), migration 161 was identified as the sole pending migration in production. Upon dry-run execution, the migration runner aborted with:
```
INCOMPATIBLE_COLUMN_DEFINITION: Column 'capacity_utilization_pct' in table 'printer_nodes' has data type 'decimal', expected 'int'
```

Database introspection of active production verified:
- **Table:** `printer_nodes`
- **Column:** `capacity_utilization_pct`
- **COLUMN_TYPE:** `decimal(5,2)`
- **IS_NULLABLE:** `YES`
- **COLUMN_DEFAULT:** `NULL`

In historical schema evolutions, `capacity_utilization_pct` in `printer_nodes` stored percentage metrics as a fractional decimal (e.g. `74.85%`), whereas greenfield migration 161 specified `capacity_utilization_pct INT DEFAULT 0`. The reconciliation service strictly checked `actualType === expectedDataType`, lacking an `alternateDataType` mapping for this specific column.

## 2. Governed Compatibility Criterion
- **Semantic Compatibility:** `DECIMAL(5,2)` is a superset of percentage values [0.00, 100.00], offering higher precision than `INT` without truncating integer values and safely accommodating fractional loads.
- **Strictly Scoped Exception:** Rather than broadening integer acceptance to decimals globally, `alternateDataType: 'decimal'` is explicitly and strictly configured on `RECONCILIATION_COLUMNS.printer_nodes.capacity_utilization_pct`.
- **Invariants Preserved:**
  - Zero lossy conversion from `DECIMAL` to `INT`.
  - Zero rounding or truncation of fractional values.
  - Zero modification of production data.
  - Zero modification of migration checksums or historical migrations.
  - Greenfield installs continue provisioning standard `INT DEFAULT 0`.
  - Incompatible types (e.g. `VARCHAR`) remain strictly rejected.
  - Other integer columns (`active_jobs`, `queue_depth`, etc.) remain strictly validated as integer.

## 3. Verification & Evidence
- **Unit & Property Tests:** `tests/migration_161_persistent_reconciliation.test.js` extended with 4 focused test cases:
  1. Accepts existing `DECIMAL` for `printer_nodes.capacity_utilization_pct` without executing DDL alterations.
  2. Accepts standard `INT` for greenfield installs.
  3. Rejects invalid types (`VARCHAR`) for `printer_nodes.capacity_utilization_pct`.
  4. Enforces strict integer validation on sibling columns (`queue_depth`, `active_jobs`) rejecting `DECIMAL`.
- **Real MySQL Integration Test:** `tests/integration_mysql_migration_161_decimal_reconciliation.js`
  - Recreates legacy schema with `printer_nodes.capacity_utilization_pct DECIMAL(5,2) NULL`.
  - Inserts fractional fixture (`74.85`) and `NULL`.
  - Runs `runMigration161PreRemediation(connection)`.
  - Asserts fractional and NULL value preservation.
  - Executes all migration 161 statements and asserts 51/51 postcondition checks pass.
  - Tests idempotency over a second execution pass (zero alters).
