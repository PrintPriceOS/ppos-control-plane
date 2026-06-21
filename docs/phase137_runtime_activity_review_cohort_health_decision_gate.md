# Phase 137 — Runtime Activity Review / Cohort Health Decision Gate

Phase 137 introduces a governed, review-only cohort health decision recommendation layer in `ppos-control-plane`. It packages observed Phase 136 runtime logs for a cohort inside a window, evaluates operational risk levels, lists structured health findings, and presents a non-mutation safety attestation proof.

## Core Design and Rules

- **Observational Recommendations**: All generated decisions (such as `CONTINUE_COHORT`, `PAUSE_COHORT`) are recommendations. Under Phase 137 rules, no decision is executed or enforced on runtime access, cohort status, marketplace availability, billing records, or external payment gateways.
- **Attestation Tracking**: Reviews store a strict `non_mutation_attestation_json` proof affirming that no accesses or systems were mutated.
- **Exigent Supersede Reason**: Old review drafts must explicitly document the reason (`superseded_reason`) and active Replacement ID when superseded.
- **Double Hashing Evidence**: Snapshots and evaluation states compute individual cryptographically strong hashes (`input_snapshot_hash`, `evaluation_result_hash`), which are packaged inside the finalized evidence pack hash.
- **State-Locked Finalization**: A review cannot be finalized without a valid health evaluation.

## Database Tables

The following idempotent tables are created:
- `controlled_beta_runtime_activity_reviews`
- `controlled_beta_runtime_activity_review_decisions`
- `controlled_beta_runtime_activity_review_findings`
- `controlled_beta_runtime_activity_review_evidence`
- `controlled_beta_runtime_activity_review_audit_events`

## Automated Smoke Verification Suite

- `smoke_phase137a_runtime_activity_review_schema.js` validates SQL schema migration.
- `smoke_phase137b_review_aggregation_from_phase136.js` verifies cohort snapshots aggregation.
- `smoke_phase137c_cohort_health_evaluator.js` checks risk classification rules.
- `smoke_phase137d_review_decision_governance.js` checks lifecycle transitions (finalization blocks, superseding reasons).
- `smoke_phase137e_evidence_pack_builder.js` verifies hashes and redaction controls.
- `smoke_phase137f_admin_api_ui_contract.js` validates REST routes and navigation entries.
- `smoke_phase137g_forbidden_scanner.js` validates that no dangerous mutation functions or parameters exist.
- `smoke_phase137h_acceptance_pack_real_db.js` executes all sub-smokes in mock or real DB mode.
