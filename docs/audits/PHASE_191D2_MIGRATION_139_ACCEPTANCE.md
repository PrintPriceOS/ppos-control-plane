# PHASE_191D2_MIGRATION_139_ACCEPTANCE.md

## Invariant Statement
> **A machine cannot reference a printer node belonging to another tenant.**

This invariant is programmatically and database-natively enforced by the foreign key constraints established in Migration 139.

---

## Active Schema DDL

### printer_nodes Table DDL (Partial)
```sql
CREATE TABLE `printer_nodes` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  ...
  UNIQUE KEY `uk_printer_nodes_id_tenant` (`id`,`tenant_id`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### printhouse_machines Table DDL
```sql
CREATE TABLE `printhouse_machines` (
  `id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `printhouse_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  ...
  PRIMARY KEY (`id`),
  KEY `fk_machines_printer_node` (`printhouse_id`,`tenant_id`),
  CONSTRAINT `fk_machines_printer_node` FOREIGN KEY (`printhouse_id`, `tenant_id`) 
    REFERENCES `printer_nodes` (`id`, `tenant_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## Validation Evidence (SQL Execution)

We ran an automated validation test script `scripts/verify_db_isolation.js` to prove that MySQL natively rejects any cross-tenant association.

### Execution Log Output:
```text
=== Database-Level Tenant Isolation Constraint Verification ===
Step 1: Creating Tenant A and Site A...
Step 2: Creating Tenant B...
Step 3: Attempting to insert Machine linked to Site A (Tenant A) but owned by Tenant B...
✅ SUCCESS: MySQL natively rejected the insert due to foreign key constraints!
   Error: Cannot add or update a child row: a foreign key constraint fails (`ppos_test_phase191b`.`printhouse_machines`, CONSTRAINT `fk_machines_printer_node` FOREIGN KEY (`printhouse_id`, `tenant_id`) REFERENCES `printer_nodes` (`id`, `tenant_id`) ON DELETE CASCADE ON UPDATE CASCADE)
Step 4: Cleaning up verification test data...
   Cleanup completed.
```

### Verdict
```text
MIGRATION_139_MUTABILITY: SAFE_TO_AMEND_LOCALLY
```
The database constraint was verified to be fully active and functioning correctly.
No additional corrections or append-only migrations (like Migration 140) are necessary.
