# Phase 136 — Runtime Activity Observation / Participant Usage Audit Gate

Phase 136 introduces governed observation of runtime activity and participant usage for ppos-control-plane, strictly validating predecessor session dependencies from Phase 135 while enforcing safety invariants.

## Design and Safety Guardrails

- **Observational Nature**: Activity event ingestion, feature counters, daily actions, anomaly signals, and health telemetry are strictly observational. They **never** automatically grant access, revoke participant eligibility, broaden cohort scope, enable public signups, or execute transactions.
- **Dependency Binding**: All observed events must bind back to a valid Phase 135 runtime session and session gate, which in turn require Phase 134 terms acceptance and onboarding.
- **Redaction and Privacy**: IP addresses, session tokens, invite codes, and emails are hashed/redacted. No raw secrets or tokens are stored in the database or exposed in UI views.
- **Forbidden Patterns**: Safety rules are statically validated to verify that no public signups, payments, or out-of-scope source mutations are triggered.

## Database Tables

The following idempotent tables were created:
- `controlled_beta_runtime_activity_observation_gates`
- `controlled_beta_runtime_activity_events`
- `controlled_beta_runtime_activity_feature_usage`
- `controlled_beta_runtime_activity_daily_counters`
- `controlled_beta_runtime_activity_blocked_attempts`
- `controlled_beta_runtime_activity_anomaly_signals`
- `controlled_beta_runtime_activity_health_signals`
- `controlled_beta_runtime_activity_participant_summaries`
- `controlled_beta_runtime_activity_cohort_summaries`
- `controlled_beta_runtime_activity_guardrail_checks`
- `controlled_beta_runtime_activity_findings`
- `controlled_beta_runtime_activity_evidence_packs`
- `controlled_beta_runtime_activity_audits`

---

## Verification Plan

### Automated Smokes
- `smoke_phase136a_runtime_activity_observation_schema.js` verifies schema migration completeness.
- `smoke_phase136b_runtime_activity_observation_service.js` validates service lifecycle methods.
- `smoke_phase136c_runtime_activity_observation_readiness.js` checks readiness gates and blockers.
- `smoke_phase136d_runtime_activity_counters_summaries.js` verifies counters and redacted summaries.
- `smoke_phase136e_runtime_activity_observation_guardrails.js` enforces security and isolation.
- `smoke_phase136f_runtime_activity_admin_api_ui.js` verifies API mounting and UI configurations.
- `smoke_phase136g_runtime_activity_evidence_pack.js` validates version 136.0 evidence pack.
- `smoke_phase136h_runtime_activity_observation_acceptance_pack.js` executes all sub-smokes.
