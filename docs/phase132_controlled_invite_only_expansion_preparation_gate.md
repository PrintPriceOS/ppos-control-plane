# Phase 132: Controlled Invite-Only Expansion Preparation Gate

This phase builds the preparation mechanics to define expansion bounds for an invite-only cohort, drafted entirely based upon an approved Phase 131 Operational Review decision. It drafts scope, assesses safe limits, constructs candidate segments, and provisions draft invites while rigidly blocking the execution of those invites until a later phase.

## Scope
- DB-backed capacity modeling yielding maximum allowed limits for participants and tenants based on Phase 130 metrics.
- Controlled Beta Candidate Segment Drafting.
- Controlled Beta Draft Invite generation mapping to candidates.
- Safe limits enforcement to guarantee the system blocks preparation if a kill switch is active or risk is deemed critical.
- Evidence hashing tying the preparation pipeline definitively to the Phase 131 decision hash.

## Governance and Exit Criteria Model
- **Upstream Evidence Dependency**: Expansion preparation inherently requires:
  - An explicitly `APPROVED` Phase 131 operational review decision that expressly allows expansion.
  - Phase 130 runtime observation evidence connected directly to the current activation.
  - Phase 129 and 128.1 activation/persistence evidence providing foundational context.
- **Safety**: Decisions must be recorded safely (`invite_sending_enabled` defaults to `0`, `active_invite_creation_enabled` defaults to `0`, `scope_auto_broaden_enabled` defaults to `0`).
- **Data Integrity**: Enforces strict `DRAFT` status rules on created expansion bounds and candidates. Uses `INFORMATION_SCHEMA` and `schema_versions` checks natively.
- **Decision Engine**: No decision actually initiates expansion or configuration changes. Approval simply signals "Expansion Bound Prepared", meaning later execution tasks have a strictly calculated roadmap authorized by Phase 131.

## Restrictions
- No automatic execution, automatic invitations, or participant scaling is allowed.
- Invites are purely placeholders and cannot be linked to the runtime access manager.
- Public signup, open marketplace, source mutation, and external payouts remain entirely blocked.
- Cannot be enabled successfully if any active Kill Switches are discovered.

## Fixture Idempotency & Schema Alignment (132.0.2 / 132.0.3)
To ensure the readiness dependency checks can be safely validated against a live database multiple times without collisions or schema drift:
* **Unique Fixture IDs**: Production-like test fixtures never use fixed primary keys. They generate a unique `runId` prefix combining timestamps and random bytes to ensure deterministic uniqueness per test run. Hardcoded scope keys (`gate`, `cohort`, `tenant`) are strictly disallowed.
* **Adaptive Cleanup**: Tests dynamically delete records associated strictly with the active `runId` prefix before and after completion to avoid state leaks. The deletion inspects `INFORMATION_SCHEMA.COLUMNS` to only attempt cleanup using identifier columns that genuinely exist (e.g. `marker`, `drill_id`), never assuming a schema shape. Broad/unscoped deletion is prohibited.
* **Adaptive Schema Inspection**: Upstream readiness tables differ fundamentally in identifiers (`observation_id` vs `pack_id`, presence of `marker`, etc.). The readiness test fixtures invoke `INFORMATION_SCHEMA.COLUMNS` to map required payloads seamlessly to existing columns without hardcoded assumptions, ensuring tests succeed even if downstream evidence tables change shape.

## Schema-Adaptive Evidence Integrity
Phase 132 acts purely as a validator for all predecessor evidence (Phases 128-131). It is strictly schema-adaptive. 
* **Phase 131 Decision Extraction (`132.0.4`)**: Phase 131 operational exit decisions do not strictly store `evidence_integrity_hash` directly inline. The readiness validator intelligently queries the operational decision, verifies its `APPROVED` state, and dynamically locates its associated hash from fallback Phase 131 pack and approval tables.
* **Phase 128.1 Restart Evidence Parsing (`132.0.5`)**: `restart_safe`, `memory_state_detected`, and `recovered_from_db` logic are completely decoupled from native DB columns. They are validated directly or mapped transparently into runtime JSON payload analysis depending on the active production DB schema, removing brittle `SELECT restart_safe FROM limited_beta_runtime_restart_drills` errors.
* **Phase 132 Preparation Gate Integrity (`132.0.6`)**: The readiness validator evaluates the overall Phase 132 preparation gate explicitly. It inspects `INFORMATION_SCHEMA` to dynamically find identifier and status columns on `controlled_beta_expansion_preparation_gates`, properly validating `PREPARATION_NOT_FOUND` while guaranteeing specific predecessor failures (e.g., Phase 130 evidence missing) are correctly localized and not masked by an initial lookup failure.
* **Phase 128.1 Context Isolation (`132.0.7`)**: Phase 128.1 evidence lookups strictly forbid legacy "latest" global fallback in production-like evaluations. Readiness is rigidly isolated and actively blocks execution unless the valid restart evidence concretely binds to the specific evaluating activation/gate/cohort/tenant execution scope.
* **Phase 128.1 Positive Evidence Payload Scanning (`132.0.8`)**: When dedicated table scope columns (`activation_id`, `gate_id`, etc.) are entirely absent from `limited_beta_runtime_restart_drills` schema, Phase 132 dynamically parses JSON payload fields (`evidence_payload`, `evidence_json`, etc.) looking for context matches. Only valid payloads explicitly bound to the preparation context can successfully satisfy Phase 128.1 restart readiness, avoiding false rejections. Debug telemetry (`phase128_1_evidence_resolution_debug`) is directly injected into the failure output to simplify debugging.
* **Phase 128.1 Evidence Resolver/Fixture Contract Alignment (`132.0.10`)**: Upgraded the dynamic JSON parsing inside `normalizeRestartEvidence` to support deeply nested telemetry (`payload.restart`, `payload.evidence`) when flattening the signal back to readiness constraints. Valid positive evidence may be direct-column backed or payload-backed, but the resolver enforces a strict contract matching Phase 132 preparation scopes against `payload.context` explicitly. Latest/global fallback remains completely blocked.
