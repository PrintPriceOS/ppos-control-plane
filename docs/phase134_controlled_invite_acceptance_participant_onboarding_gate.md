# Phase 134 — Controlled Invite Acceptance / Participant Onboarding Gate

## Overview

Phase 134 introduces a governed invite acceptance and participant onboarding gate in `ppos-control-plane`. It establishes a secure method for converting an issued invite (Phase 133) into an active, bounded participant with defined session limits and runtime access policies, ensuring complete safety control.

## Dependencies

- **Phase 132** — Controlled Invite-Only Expansion Preparation Gate (production-validated)
- **Phase 133** — Controlled Invite-Only Expansion Execution / Invite Issuance Gate (production-validated)

## Key Technical Decisions & Features

1. **idempotent SQL Migration (`082`)**
   - Implements 10 tables governing acceptance gates, claims, onboarding participants, terms acceptance, session limits, access policies, guardrails, findings, approvals, evidence packs, and audits.
   
2. **Cryptographic Redaction & PII Safety**
   - Invite codes and tokens are never printed or logged in plain text. Claims are matched strictly via SHA-256 cryptographic hashes.
   - User agent details, IP addresses, and recipient emails are stored as cryptographic hashes to protect user privacy.
   - Evidence packs (schema `134.0`) contain integrity hashes and redaction proofs, ensuring no database secrets (`DATABASE_URL`, `JWT_SECRET`, etc.) or raw credentials are leaked.

3. **Strict Policy & Scope Bounding**
   - Runtime access policies are bounded by the approved tenant and cohort. Any attempt to define features/scopes outside the approved boundary is safely overridden to the gate's approved scope, preventing unauthorized escalation.
   - All public or auto-expansion flags remain strictly disabled (`0` or `false`).

4. **Readiness Evaluation & Kill Switch Integration**
   - The onboarding process evaluates 33 readiness checks, blocking onboarding or runtime access if the kill switch is active, there are unresolved blocker findings, or safety invariants are violated.
   - Onboarding status undergoes a clear lifecycle: Draft -> Pending Approval -> Approved/Rejected.
   
5. **Revocation & Rollback Support**
   - Operators can revoke active participant onboarding or runtime access at any point, instantly setting status to `REVOKED` and resetting runtime access eligibility.

## Service Layer Interface

```javascript
evaluateInviteAcceptanceReadiness(acceptanceGateId)
createInviteAcceptanceGate(data)
verifyInviteClaim(acceptanceGateId, code, token, claimAttemptHash, ip, userAgent)
bindParticipantIdentity(acceptanceGateId, externalRef, email, label)
recordTermsAcceptance(acceptanceGateId, participantId, termsVersion, termsHash, acceptedBy, method)
defineOnboardingSessionLimits(acceptanceGateId, participantId, limits)
defineOnboardingAccessPolicy(acceptanceGateId, participantId, policy)
runOnboardingGuardrailChecks(acceptanceGateId)
submitOnboardingForApproval(acceptanceGateId, actorId)
approveOnboarding(acceptanceGateId, actorId)
rejectOnboarding(acceptanceGateId, actorId, reason)
blockOnboarding(acceptanceGateId, actorId, reasons)
grantControlledRuntimeAccess(acceptanceGateId, actorId)
revokeParticipantOnboarding(acceptanceGateId, actorId, reason)
recordOnboardingFinding(acceptanceGateId, severity, findingKey, detailsJson)
resolveOnboardingFinding(findingId, actorId)
buildOnboardingEvidencePack(acceptanceGateId)
getOnboardingAuditTimeline(acceptanceGateId)
getOnboardingDashboardState()
```

## Admin API Routes

- `GET /api/admin/beta/invite-acceptance/readiness/:acceptanceGateId`
- `POST /api/admin/beta/invite-acceptance/gates`
- `POST /api/admin/beta/invite-acceptance/gates/:acceptanceGateId/claim`
- `POST /api/admin/beta/invite-acceptance/gates/:acceptanceGateId/bind-identity`
- `POST /api/admin/beta/invite-acceptance/gates/:acceptanceGateId/terms`
- `POST /api/admin/beta/invite-acceptance/gates/:acceptanceGateId/session-limits`
- `POST /api/admin/beta/invite-acceptance/gates/:acceptanceGateId/access-policy`
- `POST /api/admin/beta/invite-acceptance/gates/:acceptanceGateId/guardrails`
- `POST /api/admin/beta/invite-acceptance/gates/:acceptanceGateId/submit`
- `POST /api/admin/beta/invite-acceptance/gates/:acceptanceGateId/approve`
- `POST /api/admin/beta/invite-acceptance/gates/:acceptanceGateId/reject`
- `POST /api/admin/beta/invite-acceptance/gates/:acceptanceGateId/block`
- `POST /api/admin/beta/invite-acceptance/gates/:acceptanceGateId/grant-runtime-access`
- `POST /api/admin/beta/invite-acceptance/gates/:acceptanceGateId/revoke`
- `GET /api/admin/beta/invite-acceptance/gates/:acceptanceGateId/evidence-pack`
- `GET /api/admin/beta/invite-acceptance/gates/:acceptanceGateId/audit-timeline`
- `GET /api/admin/beta/invite-acceptance/dashboard`
