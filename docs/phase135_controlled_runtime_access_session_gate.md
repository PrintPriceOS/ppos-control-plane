# Phase 135 — Controlled Runtime Access Session Gate

This phase controls the creation and lifecycle of runtime sessions for onboarded participants under strict governance rules.

## Dependencies
- Depends on a production-validated **Phase 134 — Controlled Invite Acceptance / Participant Onboarding Gate**.

## Key Concepts and Controls

1. **Not Public Beta / Open Marketplace**:
   - This phase does not introduce public signup, public beta, or an open marketplace.
   - All safety invariants (`FULL_PUBLIC`, `OPEN_MARKETPLACE`, etc.) remain strictly `0` / disabled.

2. **Strict Verification Checkpoints**:
   - Runtime sessions require:
     - Approved onboarding from Phase 134.
     - Valid and recorded terms acceptance.
     - Defined session limits and feature access policies.
     - Cryptographically hashed and redacted session tokens.

3. **Session Lifecycle Enforcement**:
   - **TTL (Time to Live)**: Enforced per session. Expired sessions fail closed.
   - **Concurrent Session Limits**: Restricts the number of simultaneous active sessions.
   - **Closure & Revocation**: Support for individual session closure/revocation, and mass participant revocation.
   - **Kill Switch**: Instantly blocks all session creations and feature-level evaluations.

4. **Auditing**:
   - Write actions, status changes, and evaluations are logged in a dedicated session audit timeline.
   - A redacted, hash-protected evidence pack (version `135.0`) is built to verify execution state.
