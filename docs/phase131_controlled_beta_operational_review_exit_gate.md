# Phase 131: Controlled Beta Operational Review & Exit Gate

This phase governs the transition out of the initial controlled beta cohort, allowing us to observationally verify readiness before any controlled expansion happens.

## Scope
- DB-backed evaluation of exit criteria based on observational findings.
- Recommendation pipelines to draft Expansion, Pause, Block, or Remain options.
- Manual approval gating workflows.
- Extensively tracked and audited evidence pack generation explicitly tying expansion decisions to runtime observation history.

## Governance and Exit Criteria Model
- **Safety**: Decisions must be recorded safely (`auto_expansion_enabled` defaults to `0`, `full_public_enabled` defaults to `0`).
- **Data Integrity**: Uses `INFORMATION_SCHEMA` and `schema_versions` checks natively.
- **Decision Engine**: No decision actually initiates expansion or configuration changes. Approval simply signals "Observational Readiness Verified," meaning later expansion tasks have documented authorization.

## Restrictions
- No automatic execution, automatic invitations, or participant scaling is allowed.
- Public signup, open marketplace, source mutation, and external payouts remain entirely blocked.
- Cannot be enabled successfully if any active Kill Switches are discovered.

## Environment Loading
- DB-backed smokes must self-load dotenv (`require('dotenv').config()`).
- `131H` aggregator must run DB-backed sub-smokes with dotenv preloaded via `-r dotenv/config`.
- Production-like mode fails closed when DB config is missing.
- No memory-only review state may pass production validation.
- Approval remains recommendation/decision-only and does not execute expansion.
