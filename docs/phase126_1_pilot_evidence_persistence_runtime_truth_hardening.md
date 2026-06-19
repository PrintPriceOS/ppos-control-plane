# Phase 126.1 — Pilot Evidence Review & Go/No-Go Persistence & Runtime Truth Hardening

This documentation describes the hardening of the Pilot Evidence Review Board and Go/No-Go decision process.

## Background

Phase 126 originally relied on in-memory Maps and manual evidence aggregation. For production readiness, Phase 126.1 implements:
- Full MySQL database backing for review boards, checks, findings, decisions, audits, and evidence packs.
- Automatic verification of evidence against the real database tables of Phase 122.1, 122.2, 123, 124, 125, and database migration history (`schema_versions`), instead of blindly trusting input payloads.
- Strict fail-closed database query behavior in production mode.
- Advanced safety locks ensuring that live provider connectivity, payments, payouts, and beta enablement are not auto-triggered.

## Database Schema updates

The table structures added in migration `071` are:
1. `pilot_evidence_review_checks`: Added `evidence_source_type`, `evidence_source_reference`, `evidence_integrity_hash`, `verified_from_db`, `verified_from_acceptance_pack`, `verified_from_schema_versions`, and `runtime_truth_status`.
2. `pilot_evidence_review_boards`: Added `runtime_truth_status`.
3. `pilot_evidence_go_no_go_decisions`: Added `runtime_truth_status`.
4. `pilot_evidence_review_packs`: Added `runtime_truth_status` and `persistence_status`.

## Verification Rules

1. `aggregatePilotEvidence`: Queries `schema_versions` and checks for matching `evidence_status = 'GENERATED'` or `status = 'PASSED'` records in the respective tables.
2. `submitGoNoGoDecision`: Blocks decisions of type `GO_FOR_LIMITED_BETA_PREPARATION` if any check fails or is missing, or if any blocker is unresolved.
3. `buildPilotReviewEvidencePack`: Packs evidence, calculates hashes, redactions, and records.
