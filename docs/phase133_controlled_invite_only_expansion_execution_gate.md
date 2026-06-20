# Phase 133: Controlled Invite-Only Expansion Execution Gate

This phase implements the controlled invite issuance gate following the approved Phase 132 preparation. It ensures that invite issuance is governed by explicit approvals, strict caps, and auditability.

## Upstream Evidence Dependency
Phase 133 relies on production-validated Phase 132 expansion preparation gate evidence, which in turn verifies:
- Phase 131 operational review approved decision.
- Phase 130 runtime observation monitoring evidence.
- Phase 129 first controlled cohort activation evidence.
- Phase 128.1 runtime restart persistence & recovery evidence.

## Safety and Redaction Constraints
- **Hashed Credentials**: Raw invite codes and tokens are NEVER stored in cleartext. Only cryptographic hashes are persisted.
- **PII Redaction**: Email addresses and identifiers are hashed or redacted before being stored or presented on the UI console.
- **Safety Invariants**: The gate enforces that payment, open marketplace, auto-expansion, public signup, and full public access remain strictly disabled. Any active kill switch blocks execution immediately.

## Exit Criteria
- Phase 133 Acceptance pack runs and passes against the target DB.
- UI warning banners display explicit safety constraints.
- Forbidden patterns scanner confirms no dangerous mutations or external submissions exist in executable paths.
