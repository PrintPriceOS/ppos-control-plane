# Phase 123 — Founding Printhouse Pilot Gate

## Overview

Phase 123 creates a controlled external pilot layer for founding printhouses. This is not a public marketplace launch. It is a restricted, allowlisted, audited pilot where a selected printhouse can view and respond to controlled pilot handoff packages.

## Strategic Intent

This phase answers: **Can a founding printhouse safely participate in a governed pilot without opening the marketplace publicly?**

It does NOT answer:
- Can any customer place real orders publicly? **No.**
- Can real money move? **No.**
- Can live providers receive external execution instructions? **No.**
- Can production be fully activated? **No.**

## Safety Guarantees

| Flag | Status |
|---|---|
| FULL_PUBLIC | NOT_ENABLED |
| OPEN_MARKETPLACE_ACCESS | NOT_ENABLED |
| LIVE_PROVIDER_CONNECTIVITY | NOT_ENABLED |
| PAYMENT_EXECUTION | NOT_ENABLED |
| REFUND_EXECUTION | NOT_ENABLED |
| PAYOUT_EXECUTION | NOT_ENABLED |
| EXTERNAL_TAX_SUBMISSION | NOT_ENABLED |
| EXTERNAL_ACCOUNTING_SUBMISSION | NOT_ENABLED |
| PROVIDER_EXTERNAL_SUBMISSION | NOT_ENABLED |
| SOURCE_MUTATION_OUTSIDE_PILOT_SCOPE | NOT_ENABLED |
| PRODUCTION_ACTIVATION | NOT_ENABLED |
| AUTOMATIC_PRODUCTION_DISPATCH | NOT_ENABLED |

## Architecture

### Migration
`migrations/067_phase123_founding_printhouse_pilot_gate.sql`

7 tables:
- `founding_printhouse_pilot_programs` — pilot program records
- `founding_printhouse_pilot_participants` — registered printhouse participants
- `founding_printhouse_pilot_order_links` — links between participants and internal pilot orders
- `founding_printhouse_pilot_reviews` — review records
- `founding_printhouse_pilot_findings` — findings with blocker enforcement
- `founding_printhouse_pilot_audits` — audit trail
- `founding_printhouse_pilot_evidence_packs` — evidence packs with integrity hash

### Service
`src/api/services/foundingPrinthousePilotGateService.js`

Methods:
- `createPilotProgram()` — creates a new pilot program (allowlist-enforced)
- `registerFoundingPrinthouse()` — registers a printhouse participant (allowlist-enforced)
- `evaluateParticipantReadiness()` — checks Phase 122.1/122.2 evidence, allowlist, approval, findings
- `approveParticipantForPilot()` — approves participant (blocked by unresolved blocker findings)
- `suspendParticipant()` — suspends a participant
- `linkInternalPilotOrder()` — links an internal pilot order (requires approved participant)
- `evaluateOrderHandoffReadiness()` — evaluates handoff readiness (blocked by findings)
- `submitPrinthouseReview()` — records a review
- `recordPilotFinding()` — records a finding (can block handoff)
- `resolvePilotFinding()` — resolves a finding
- `buildPrinthousePilotEvidencePack()` — builds evidence pack with integrity hash and redaction
- `getPrinthousePilotAuditTimeline()` — retrieves audit timeline
- `getReadiness()` — checks overall readiness including prior phase evidence

### Participant Statuses
DRAFT → REGISTERED → IN_REVIEW → CHANGES_REQUIRED → APPROVED_FOR_CONTROLLED_PILOT → SUSPENDED → REJECTED → COMPLETED

### Admin API
`src/api/routes/foundingPrinthousePilotGateAdmin.js`

Mounted at: `/api/admin/production/founding-printhouse-pilot`

Endpoints:
- `GET /readiness`
- `POST /program/create`
- `POST /participant/register`
- `POST /participant/approve`
- `POST /participant/suspend`
- `POST /order/link`
- `GET /order-handoff-readiness`
- `POST /review`
- `POST /finding`
- `POST /resolve-finding`
- `GET /audit-timeline`
- `GET /evidence-pack`

### UI
- Types: `src/ui/types/foundingPrinthousePilotGate.ts`
- Client: `src/ui/api/foundingPrinthousePilotGateClient.ts`
- Page: `src/ui/pages/production/FoundingPrinthousePilotGate.tsx`
- Route: `/admin/production/founding-printhouse-pilot`

## Key Safety Behaviors

1. **Tenant allowlist fail-closed**: In production, empty `PILOT_TENANT_ALLOWLIST` blocks all operations.
2. **Blocker finding enforcement**: Unresolved blocker findings prevent participant approval and order handoff readiness.
3. **Approved-only order linking**: Orders can only be linked to participants with `APPROVED_FOR_CONTROLLED_PILOT` status.
4. **Prior phase evidence verification**: Readiness checks Phase 122.1 and 122.2 evidence from DB.
5. **Evidence pack integrity**: SHA-256 hash, schema version, redaction classification.
6. **Full audit trail**: Every operation generates an audit event with safety snapshot.
7. **No automatic dispatch**: All execution flags remain disabled.

## Smoke Tests

- `scripts/smoke_phase123a_founding_printhouse_pilot_schema.js` — schema validation
- `scripts/smoke_phase123b_founding_printhouse_pilot_service.js` — service methods and safety
- `scripts/smoke_phase123c_founding_printhouse_pilot_admin_api_ui.js` — API/UI file validation
- `scripts/smoke_phase123d_founding_printhouse_pilot_e2e_regression.js` — E2E flow + regression
- `scripts/smoke_phase123e_founding_printhouse_pilot_acceptance_pack.js` — acceptance pack

## Prerequisites

- Phase 122.1 VALIDATED
- Phase 122.2 VALIDATED
- Migrations 065, 066, 067 applied
- `PILOT_TENANT_ALLOWLIST` configured with approved tenant IDs
