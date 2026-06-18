# Phase 120.1 — Migration Integrity & Acceptance Env Repair

## Purpose

Repair production deployment integrity before controlled pilot activation. No new commercial functionality — only repair and hardening.

## Problem

Production migration runner failed with:
```
CHECKSUM MISMATCH for migration 015_stripe_webhook_events_idempotency.sql. Database integrity compromised.
```

Root cause: historical checksum drift for migration `015_stripe_webhook_events_idempotency` after file normalization. The `schema_versions` table also contained both `015_stripe_webhook_events_idempotency` and `015 / 015_phase76_printhouse_capabilities.sql`, revealing a version collision risk for same-prefix migrations.

## Artifacts

### Diagnostic Script
- `scripts/diagnose_migration_integrity_drift.js` — Read-only diagnostic that compares stored vs current checksums for migration 015. Never mutates DB or prints secrets.

### Guarded Repair Script
- `scripts/repair_phase120_1_migration_015_checksum.js` — Updates only the checksum column for `015_stripe_webhook_events_idempotency`. Requires `ALLOW_MIGRATION_CHECKSUM_REPAIR=true`. Refuses to run if git working tree is dirty. Does not re-run the migration.

### Migration Version Collision Guard
- `scripts/smoke_phase120_1_migration_version_collision_guard.js` — Verifies no two migration files resolve to the same version. Confirms `015_phase76_printhouse_capabilities.sql` and `015_stripe_webhook_events_idempotency.sql` are treated as distinct.

### Env Bootstrap
- `scripts/smoke_bootstrap_env.js` — Shared helper that loads dotenv and validates required env vars (JWT_SECRET, DATABASE_URL) without printing values.
- `scripts/smoke_phase120_1_acceptance_env_bootstrap.js` — Verifies bootstrap exists, Phase 113G uses it, and missing env produces controlled errors.

### Final Acceptance
- `scripts/smoke_phase120_1_migration_integrity_acceptance.js` — Full acceptance pack for Phase 120.1.

## Safety

- Production activation: NOT_ENABLED
- FULL_PUBLIC: NOT_ENABLED
- Live provider connectivity: NOT_ENABLED
- Payment/refund/payout execution: NOT_ENABLED
- External submission: NOT_ENABLED
- Source record mutation: NOT_ENABLED

## Validation Commands

```bash
node --check scripts/diagnose_migration_integrity_drift.js
node --check scripts/repair_phase120_1_migration_015_checksum.js
node --check scripts/smoke_phase120_1_migration_version_collision_guard.js
node --check scripts/smoke_phase120_1_acceptance_env_bootstrap.js
node --check scripts/smoke_phase120_1_migration_integrity_acceptance.js

node scripts/smoke_phase120_1_migration_version_collision_guard.js
node scripts/smoke_phase120_1_acceptance_env_bootstrap.js
node scripts/smoke_phase120_1_migration_integrity_acceptance.js
npm run build
```

## Manual Production Repair

Only after diagnosis confirms expected drift:
```bash
ALLOW_MIGRATION_CHECKSUM_REPAIR=true node scripts/repair_phase120_1_migration_015_checksum.js
```
