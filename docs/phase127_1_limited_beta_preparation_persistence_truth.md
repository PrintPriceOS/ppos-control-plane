# Phase 127.1 — Limited Beta Preparation Persistence & Production Truth Hardening

This phase hardens the Limited Beta Preparation Gate to ensure that cohort, participant, role boundaries, terms acceptances, and audit trails are DB-backed, restart-safe, fail-closed, and production-truth verified.

## Key Hardening Details

1. **Database Schema (Migration 073)**
   - Hardened `limited_beta_%` tables with proper indexes.
   - Added metadata and status flags (`persistence_status`, `runtime_truth_status`, `evidence_integrity_hash`, etc.) to track data integrity.
   - Restrict database operations to production-truth verified conditions.

2. **Service Layer Validation & Fail-Closed Behavior**
   - Corrected helper reads to avoid double-destructuring, resolving a potential database client integration bug.
   - Hashed all invite codes internally inside `issueInviteCode()` to secure code exposure in databases or query dumps.
   - Implemented strict database write validation `_validateDbWriteResult(dbResult)` on all mutative service methods. In production environments (`NODE_ENV === 'production'` or when db fallback is disabled), any write failures throw an error immediately, causing the operation to fail-closed.
   - Hardened `evaluateLimitedBetaPreparationReadiness` to strictly verify database-backed Phase 126.1 and 126.1.3 evidence. Memory fallback is disabled in production environments.

3. **Admin API & UI Updates**
   - The Admin API responses and endpoints now map and return safety invariants (`persistenceMode`, `persistenceStatus`, `runtimeTruthStatus`) while asserting that beta runtime and financial capabilities remain completely inactive.
   - The React UI displays the hardened status registry, showing the DB state and safety levels along with the required warning message.

## Verification
Verification was done via 6 custom smoke tests and regression tests:
- `smoke_phase127_1a_limited_beta_persistence_schema.js` (Verify migration 073 structure, columns, indexes, and safety defaults).
- `smoke_phase127_1b_limited_beta_db_persistence_service.js` (Verify DB helpers, creation persistence, and invite redaction).
- `smoke_phase127_1c_limited_beta_runtime_truth_verification.js` (Verify Phase 126.1 evidence requirement and truth status).
- `smoke_phase127_1d_limited_beta_fail_closed_rules.js` (Verify fail-closed DB locks, invite expiry/revocation, support/rollback requirements, and blockers).
- `smoke_phase127_1e_limited_beta_admin_api_ui_hardening.js` (Verify route payloads, UI page labels, and secret redaction warnings).
- `smoke_phase127_1f_limited_beta_persistence_acceptance_pack.js` (Validate all smokes, build success, and assert evidence version is `127.1`).

> [!IMPORTANT]
> Phase 127.1 is not production-valid unless smoke_phase127_1a verifies migration 073, columns, indexes and tables against the real DB.

