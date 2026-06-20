# Phase 132: Controlled Invite-Only Expansion Preparation Gate

This phase builds the preparation mechanics to define expansion bounds for an invite-only cohort, drafted entirely based upon an approved Phase 131 Operational Review decision. It drafts scope, assesses safe limits, constructs candidate segments, and provisions draft invites while rigidly blocking the execution of those invites until a later phase.

## Scope
- DB-backed capacity modeling yielding maximum allowed limits for participants and tenants based on Phase 130 metrics.
- Controlled Beta Candidate Segment Drafting.
- Controlled Beta Draft Invite generation mapping to candidates.
- Safe limits enforcement to guarantee the system blocks preparation if a kill switch is active or risk is deemed critical.
- Evidence hashing tying the preparation pipeline definitively to the Phase 131 decision hash.

## Governance and Exit Criteria Model
- **Safety**: Decisions must be recorded safely (`invite_sending_enabled` defaults to `0`, `active_invite_creation_enabled` defaults to `0`, `scope_auto_broaden_enabled` defaults to `0`).
- **Data Integrity**: Enforces strict `DRAFT` status rules on created expansion bounds and candidates. Uses `INFORMATION_SCHEMA` and `schema_versions` checks natively.
- **Decision Engine**: No decision actually initiates expansion or configuration changes. Approval simply signals "Expansion Bound Prepared", meaning later execution tasks have a strictly calculated roadmap authorized by Phase 131.

## Restrictions
- No automatic execution, automatic invitations, or participant scaling is allowed.
- Invites are purely placeholders and cannot be linked to the runtime access manager.
- Public signup, open marketplace, source mutation, and external payouts remain entirely blocked.
- Cannot be enabled successfully if any active Kill Switches are discovered.
