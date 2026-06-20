# Phase 129 — First Controlled Invite-Only Beta Cohort Activation

This document defines the schema, service operations, routing endpoints, user interface, and safety bounds governing the first controlled invite-only beta cohort activation.

## Safety Boundaries & Governance
This phase enforces strict security protocols:
- **No Unscoped Beta runtime activation**: Runtime access is strictly gated by approved cohorts, tenants, and active session limits.
- **Safety Invariants**: The following flags remain hardcoded to `false` (or `0` in DB) across all evaluations:
  - `FULL_PUBLIC`
  - `OPEN_MARKETPLACE`
  - `PAYMENT_EXECUTION`
  - `REFUND_EXECUTION`
  - `PAYOUT_EXECUTION`
  - `PROVIDER_EXTERNAL_SUBMISSION`
  - `TAX_SUBMISSION`
  - `ACCOUNTING_SUBMISSION`
- **Redaction of sensitive details**: Connection URLs, passwords, invite codes, and session tokens are redacted in all logs and response structures.

## Database Schema (Migration 076)
Migration 076 defines 11 tables backing the controlled activation state:
1. `controlled_beta_cohort_activations` - Holds the primary draft/active/paused/terminated cohort status.
2. `controlled_beta_activation_participants` - Governance boundary enforcing role boundary definitions and terms acceptance.
3. `controlled_beta_activation_invites` - Tracks issued cohort invites with cryptographically hashed codes.
4. `controlled_beta_activation_scope_bindings` - Defines allowed feature lists.
5. `controlled_beta_activation_session_limits` - Restricts total active sessions and actions per hour.
6. `controlled_beta_activation_monitoring_events` - Internal audit logging.
7. `controlled_beta_activation_support_events` - Support ticket logs.
8. `controlled_beta_activation_incident_events` - Operational incident logs. Blocker/critical severities trigger automatic system pausing.
9. `controlled_beta_activation_kill_switch_events` - Kill switch logs.
10. `controlled_beta_activation_findings` - Unresolved findings that block readiness.
11. `controlled_beta_activation_evidence_packs` - Signed integrity verification packs (Schema `129.0`).

## Service Layer (`ControlledBetaCohortActivationService`)
The service layer exposes 25 governance methods, including:
- `evaluateControlledCohortActivationReadiness()`: Performs a rigorous 19-point check before allowing activation. This includes verifying Phase 128.1 and 127.1 production evidence, binding status (gate, cohort, tenant), approved participants, scoped allowed features, defined session limits, configured monitoring, provisions for support/rollback, active kill switches, and enforcing all safety invariants. Returns `BLOCKED` with detailed reasons if any prerequisite is unmet.
- `activateControlledCohort()`: Enables scoped runtime access if readiness is `READY`.
- `pauseControlledCohort()`: Pauses cohort activation.
- `recordActivationIncidentEvent()`: Auto-pauses on critical/blocker incidents.
- `triggerActivationKillSwitch()`: Admin kill-switch trigger that pauses cohort execution.
- `buildControlledActivationEvidencePack()`: Signs the current activation evidence with SHA-256.

## Verification & Acceptance Smoke Tests
Nine automated smoke tests validate this module:
1. `smoke_phase129a_controlled_beta_activation_schema.js` (Checks schema/tables/columns)
2. `smoke_phase129b_controlled_beta_activation_service.js` (Checks service methods)
3. `smoke_phase129c_controlled_beta_activation_readiness.js` (Checks readiness block/go criteria)
4. `smoke_phase129d_controlled_beta_activation_access_limits.js` (Checks boundaries and terms)
5. `smoke_phase129e_controlled_beta_activation_kill_switch_incident.js` (Checks kill-switch and auto-pausing)
6. `smoke_phase129f_controlled_beta_activation_admin_api_ui.js` (Checks router endpoints)
7. `smoke_phase129g_controlled_beta_activation_evidence_pack.js` (Checks evidence pack integrity)
8. `smoke_phase129_0_1_controlled_beta_readiness_repair.js` (Regression checks for full 19-point readiness structure repair)
9. `smoke_phase129_0_2_fixture_schema_alignment.js` (Checks fixture idempotency and schema alignment)
10. `smoke_phase129_0_3_evidence_fixture_schema_alignment.js` (Checks evidence schema adaptivity)
11. `smoke_phase128_1_5_acceptance_real_db_no_fallback.js` (Checks 128.1g regression in DB mode)
12. `smoke_phase128_1g_runtime_restart_acceptance_pack.js` (Regression of Phase 128.1 acceptance)
13. `smoke_phase129h_controlled_beta_activation_acceptance_pack.js` (Aggregator pack verifying build and secrets hygiene)

## Test Fixture Guidelines
- All test fixtures must be idempotent (using generated UUIDs or timestamps) to prevent duplicate key errors during repeated smoke runs.
- Synthetic Phase 128.1 evidence is strictly disabled by default to force validation against actual production resilience metrics. It requires `ALLOW_PHASE129_SYNTHETIC_EVIDENCE=true` to be explicitly set.
- All fixtures must read `INFORMATION_SCHEMA.COLUMNS` to adapt dynamically to real DB structures and avoid fatal unknown column errors during inserts.
- The `limited_beta_evidence_packs` schema may vary across environments; the evidence fixture must be strictly schema-adaptive and gracefully fallback if `evidence_integrity_hash` or other late-phase columns are missing.
- Phase 128.1 acceptance (`128.1g`) must be demonstrably clean without fallback bypasses before Phase 129 validation can close.
