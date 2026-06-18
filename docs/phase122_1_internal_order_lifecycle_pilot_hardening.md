# Phase 122.1 — Internal Order Lifecycle Pilot Operational Hardening

## Scope

Phase 122.1 hardens the Phase 122 internal order lifecycle pilot for production reliability. It does not add new product surface. It makes the existing internal pilot reliable, persistent, fail-closed, auditable, and recoverable.

## Prerequisites

- Phase 120.1 — Migration Integrity & Acceptance Env Repair: VALIDATED
- Phase 121 — Controlled Production Pilot Activation Gate: VALIDATED
- Phase 122 — Internal Order Lifecycle Pilot: VALIDATED

## Safety Constraints

The following remain disabled at all times:

- FULL_PUBLIC
- OPEN_MARKETPLACE_ACCESS
- UNRESTRICTED_LIVE_PROVIDER_CONNECTIVITY
- PAYMENT_EXECUTION
- REFUND_EXECUTION
- PAYOUT_EXECUTION
- EXTERNAL_TAX_SUBMISSION
- EXTERNAL_ACCOUNTING_SUBMISSION
- PROVIDER_EXTERNAL_SUBMISSION
- SOURCE_RECORD_MUTATION_OUTSIDE_PILOT_SCOPE

## Changes

### Migration 065 — Operational Indexes & Foreign Keys

Added indexes on all 7 Phase 122 tables for operational query performance:
- `internal_order_lifecycle_pilot_runs`: tenant_id, status, created_at
- `internal_order_lifecycle_pilot_orders`: pilot_run_id, tenant_id, order_status, created_at
- `internal_order_lifecycle_pilot_steps`: pilot_run_id, pilot_order_id, step_key, step_status, created_at
- `internal_order_lifecycle_pilot_findings`: pilot_run_id, pilot_order_id, finding_status, blocks_lifecycle, severity
- `internal_order_lifecycle_pilot_audits`: pilot_run_id, pilot_order_id, event_type, created_at
- `internal_order_lifecycle_pilot_rollback_points`: pilot_run_id, pilot_order_id, rollback_point_status, created_at
- `internal_order_lifecycle_pilot_evidence_packs`: pilot_run_id, pilot_order_id, evidence_status, generated_at

Added foreign keys from all child tables to `internal_order_lifecycle_pilot_runs` (ON DELETE RESTRICT, ON UPDATE CASCADE).

### Tenant Allowlist Fail-Closed

- Empty `PILOT_TENANT_ALLOWLIST` now fails closed in production-like environments.
- Open allowlist only allowed in explicit test mode: `NODE_ENV=test` or `ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS=true`.
- API responses include `tenantAllowlistFailClosed` marker.

### DB Read-Through

Service now reads from DB when in-memory Maps are empty:
- `getPilotRunById()` — reads run from DB if not in memory
- `getPilotOrderById()` — reads order from DB if not in memory
- `listFindingsFromDb()` — reads findings from DB
- `listStepsFromDb()` — reads steps from DB
- `listAuditTimelineFromDb()` — reads audit timeline from DB
- `listRollbackPointsFromDb()` — reads rollback points from DB
- `getEvidencePackFromDb()` — reads evidence pack from DB

### No Silent DB Failures

- All `catch (_) {}` blocks replaced with controlled error handling via `_dbWrite()`.
- Critical writes throw errors in production mode when DB fails.
- Fallback only allowed when `ALLOW_DB_FALLBACK_FOR_SMOKE=true` or `NODE_ENV=test`.
- Responses include `persistenceMode` (DB | MEMORY_FALLBACK) and `persistenceStatus` (PERSISTED | FALLBACK_ONLY | FAILED).

### Pilot Run Existence Enforcement

- `createInternalPilotOrder()` fails if `pilot_run_id` does not exist in memory or DB.
- `executeInternalOrderLifecycle()` fails if `pilot_run_id` does not exist.
- `buildInternalOrderLifecycleEvidencePack()` fails if `pilot_run_id` does not exist (unless explicit smoke fallback).

### Blocker Findings Enforcement

- `executeInternalOrderLifecycle()` checks unresolved findings with `blocks_lifecycle = true`.
- If blockers exist, returns `lifecycle_status: BLOCKED_BY_FINDINGS`.
- No lifecycle steps are executed when blocked.
- Audit event `INTERNAL_ORDER_LIFECYCLE_BLOCKED_BY_FINDINGS` is recorded.

### Prior Phase Evidence Verification

- `evaluatePilotLifecycleReadiness()` no longer hardcodes Phase 120.1 and Phase 121 as validated.
- Checks `schema_versions` table for migration 063 (Phase 121) and migration 064 (Phase 122).
- Returns `priorPhaseEvidenceStatus: VERIFIED` or `PRIOR_PHASE_EVIDENCE_UNVERIFIED`.

### Evidence Pack Hardening

- Evidence packs include `evidence_integrity_hash` (SHA-256).
- Evidence packs include `evidence_schema_version` ('122.1').
- Redacted preview includes `redaction_classification` (INTERNAL_ONLY).
- Sensitive fields are redacted: internal_customer_reference, raw customer data, raw file package URLs, raw preflight artifact paths, raw invoice data, secrets, passwords, tokens, API keys, credentials.

### UI Hardening

- UI shows persistence mode and status.
- UI shows tenant allowlist fail-closed status.
- UI shows prior phase evidence status (VERIFIED or degraded warning).
- UI includes blocks_lifecycle checkbox for findings.

## Smoke Tests

| Script | Description |
|---|---|
| `smoke_phase122_1a_internal_order_lifecycle_hardening_schema.js` | Migration 065 indexes and foreign keys |
| `smoke_phase122_1b_internal_order_lifecycle_persistence_and_allowlist.js` | DB persistence and tenant allowlist fail-closed |
| `smoke_phase122_1c_internal_order_lifecycle_blocker_enforcement.js` | Blocker findings block lifecycle execution |
| `smoke_phase122_1d_internal_order_lifecycle_prior_phase_evidence.js` | Prior phase evidence not hardcoded |
| `smoke_phase122_1e_internal_order_lifecycle_evidence_redaction.js` | Evidence integrity hash and redaction |
| `smoke_phase122_1f_internal_order_lifecycle_hardening_acceptance_pack.js` | Full acceptance pack |

## Validation Commands

```bash
node --check src/api/services/internalOrderLifecyclePilotService.js
node --check src/api/routes/internalOrderLifecyclePilotAdmin.js
node scripts/smoke_phase122_1a_internal_order_lifecycle_hardening_schema.js
node scripts/smoke_phase122_1b_internal_order_lifecycle_persistence_and_allowlist.js
node scripts/smoke_phase122_1c_internal_order_lifecycle_blocker_enforcement.js
node scripts/smoke_phase122_1d_internal_order_lifecycle_prior_phase_evidence.js
node scripts/smoke_phase122_1e_internal_order_lifecycle_evidence_redaction.js
node scripts/smoke_phase122_1f_internal_order_lifecycle_hardening_acceptance_pack.js
npm run build
```
