# Phase 191D: Database Acceptance

## 1. Goal
Validate database schema integrity, ensure foreign key constraints strictly protect tenant data boundary, and check migration ledger states.

---

## 2. Table Schemas and Indices

The following indices and foreign key relationships are checked and active in the database:

### 2.1 table: `printhouse_machines`
- **Columns**: `id`, `printhouse_id`, `tenant_id`, `machine_name`, `machine_type`, `manufacturer`, `model`, `status`, etc.
- **Constraints**:
  - `PRIMARY KEY (id)`
  - `CONSTRAINT fk_machines_printer_node` FOREIGN KEY (`printhouse_id`, `tenant_id`) REFERENCES `printer_nodes` (`id`, `tenant_id`) ON DELETE CASCADE ON UPDATE CASCADE.
- **Verification**: This multi-column constraint guarantees that a machine cannot be associated with a production site belonging to a foreign tenant.

---

## 3. Migration Ledger Baseline
- **Verification**: The metadata of migrations `137`, `138`, and `139` are recorded in `migrations/migration-integrity-baseline.json`.
- **Integrity**: Legacy migration files (001-136) are unmodified and match their canonical hashes.
