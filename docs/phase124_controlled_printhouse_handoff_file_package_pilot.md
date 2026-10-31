# Phase 124 — Controlled Printhouse Handoff / File Package Pilot

## Overview

Phase 124 introduces a governed handoff package workflow for approved founding printhouse pilot participants. An approved founding printhouse can receive a controlled, redacted, audited handoff package for an internal pilot order.

This phase is about package readiness, file access governance, acceptance/rejection workflow, and auditability. It is **not** about real machine dispatch or automatic external provider submission.

## Safety Invariants

All of the following remain **NOT_ENABLED**:

- FULL_PUBLIC
- OPEN_MARKETPLACE_ACCESS
- LIVE_PROVIDER_CONNECTIVITY
- PAYMENT_EXECUTION
- REFUND_EXECUTION
- PAYOUT_EXECUTION
- PRODUCTION_DISPATCH
- AUTOMATIC_PRODUCTION_DISPATCH
- UNRESTRICTED_FILE_ACCESS
- PERMANENT_PUBLIC_URL
- EXTERNAL_TAX_SUBMISSION
- EXTERNAL_ACCOUNTING_SUBMISSION
- PROVIDER_EXTERNAL_SUBMISSION
- SOURCE_MUTATION_OUTSIDE_PILOT_SCOPE

## Migration

`068_phase124_controlled_printhouse_handoff_file_package_pilot.sql`

### Tables

| Table | Purpose |
|---|---|
| `controlled_printhouse_handoff_packages` | Main handoff package records |
| `controlled_printhouse_handoff_package_files` | File metadata for package contents |
| `controlled_printhouse_handoff_reviews` | Review records for handoff packages |
| `controlled_printhouse_handoff_access_grants` | Scoped, expiring file access grants |
| `controlled_printhouse_handoff_findings` | Issues/observations with blocking capability |
| `controlled_printhouse_handoff_audits` | Complete audit trail |
| `controlled_printhouse_handoff_evidence_packs` | Evidence artifacts with integrity hashing |

## Service

`src/api/services/controlledPrinthouseHandoffPackageService.js`

### Methods

| Method | Purpose |
|---|---|
| `createHandoffPackage()` | Create a new handoff package for an approved participant |
| `evaluateHandoffReadiness()` | Check if package is ready for handoff |
| `addPackageFileMetadata()` | Add file metadata to a package |
| `createScopedFileAccessGrant()` | Create scoped, expiring access grant |
| `revokeFileAccessGrant()` | Revoke an access grant |
| `submitPrinthouseHandoffReview()` | Submit review for a package |
| `acceptHandoffPackage()` | Printhouse accepts the package |
| `rejectHandoffPackage()` | Printhouse rejects the package |
| `recordHandoffFinding()` | Record a finding (with optional handoff blocking) |
| `resolveHandoffFinding()` | Resolve a finding |
| `buildHandoffEvidencePack()` | Build evidence pack with integrity hash |
| `getHandoffAuditTimeline()` | Get audit timeline for a package |
| `getReadiness()` | Get overall Phase 124 readiness |

### Package Statuses

`DRAFT` → `READY_FOR_REVIEW` → `IN_REVIEW` → `ACCEPTED_BY_PRINTHOUSE` / `REJECTED_BY_PRINTHOUSE` / `CHANGES_REQUIRED` / `SUSPENDED` / `COMPLETED`

## File Access Rules

- No raw internal file paths exposed in UI
- No permanent public URLs
- File grants must be scoped to: participant_id, printhouse_tenant_id, pilot_order_id, handoff_package_id
- File grants must have expiration (`expires_at` is required)
- Access grant creation is audited
- Access revocation is supported
- Download audit requirement is always enabled

## Admin API

Mounted at `/api/admin/production/printhouse-handoff-package`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/readiness` | Check Phase 124 readiness |
| POST | `/create` | Create handoff package |
| POST | `/file-metadata` | Add file metadata |
| POST | `/access-grant` | Create scoped access grant |
| POST | `/revoke-access` | Revoke access grant |
| POST | `/review` | Submit review |
| POST | `/accept` | Accept package |
| POST | `/reject` | Reject package |
| POST | `/finding` | Record finding |
| POST | `/resolve-finding` | Resolve finding |
| GET | `/audit-timeline` | Get audit timeline |
| GET | `/evidence-pack` | Build evidence pack |

## UI

- **Types**: `src/ui/types/controlledPrinthouseHandoffPackage.ts`
- **Client**: `src/ui/api/controlledPrinthouseHandoffPackageClient.ts`
- **Page**: `src/ui/pages/production/ControlledPrinthouseHandoffPackage.tsx`
- **Route**: `/admin/production/printhouse-handoff-package`

## Smoke Tests

| Script | Purpose |
|---|---|
| `smoke_phase124a_printhouse_handoff_package_schema.js` | Schema/migration validation |
| `smoke_phase124b_printhouse_handoff_package_service.js` | Service method validation |
| `smoke_phase124c_printhouse_handoff_package_admin_api_ui.js` | API/UI validation |
| `smoke_phase124d_printhouse_handoff_package_e2e_regression.js` | E2E flow + prior phase regression |
| `smoke_phase124e_printhouse_handoff_package_acceptance_pack.js` | Acceptance criteria validation |

## Dependencies

- Phase 122.1 — Internal Order Lifecycle Pilot Hardening
- Phase 122.2 — Runtime Verification / Restart Recovery Drill
- Phase 123 — Founding Printhouse Pilot Gate (participant must be approved)
