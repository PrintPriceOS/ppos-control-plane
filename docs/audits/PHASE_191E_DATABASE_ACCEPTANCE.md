# Phase 191E: Database Acceptance

## 1. Schema Tables and Constraints

Migration `140_phase191e_materials_capacity_leadtimes.sql` created the following tables and constraints:

### 1.1 `printhouse_machine_materials` (Junction Table)
- **Columns**: `machine_id`, `material_catalog_id`, `tenant_id`, `compatibility_provenance`, `created_at`.
- **Primary Key**: `(machine_id, material_catalog_id)`
- **Constraints**:
  - `fk_mm_machine` references `printhouse_machines (id, tenant_id)`
  - `fk_mm_material` references `materials_catalog (id, tenant_id)`
- **Tenant Isolation**: Guarantees that compatibility connections can only link machines and materials belonging to the same tenant.

### 1.2 `printhouse_site_capacities`
- **Columns**: `id`, `printhouse_id`, `tenant_id`, `daily_jobs_limit`, `daily_sheets_limit`, `working_days_per_week`, `operating_hours_per_day`, `notes`.
- **Primary Key**: `id`
- **Constraints**:
  - UNIQUE KEY `uk_site_capacities_site_tenant` `(printhouse_id, tenant_id)`
  - `fk_site_capacities_site` references `printer_nodes (id, tenant_id)`

### 1.3 `printhouse_site_lead_times`
- **Columns**: `id`, `printhouse_id`, `tenant_id`, `timezone`, `workdays_json`, `daily_cutoff_time`, `base_lead_time_days`, `custom_rules_json`.
- **Primary Key**: `id`
- **Constraints**:
  - UNIQUE KEY `uk_site_lead_times_site_tenant` `(printhouse_id, tenant_id)`
  - `fk_site_lead_times_site` references `printer_nodes (id, tenant_id)`

### 1.4 `printhouse_machines` Table Alterations
- Added `indicative_daily_capacity` INT NULL
- Added `capacity_unit_name` VARCHAR(32) DEFAULT 'impressions'

---

## 2. Integrity and Baseline Precision
- Legacy migration files (001-139) are clean and match the repository baseline checksums in `migrations/migration-integrity-baseline.json`.
- Newly added Migration 140 is baselined cleanly in the manifest record.

```text
FULL_CLEAN_MIGRATION_CHAIN: NOT_SUPPORTED
BASELINED_DISPOSABLE_SCHEMA: PASS
```
Legacy database schemas are loaded via baseline snapshots in testing environments rather than full clean-chain execution.
