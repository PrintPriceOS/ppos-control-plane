# Phase 125 — Sandbox Commercial / Invoice / Payment Handoff Pilot

## Status

Implemented.

## Goal

Introduce sandbox-only commercial readiness for pilot orders: invoice preview, payment intent simulation, refund/payout scenario simulation, settlement readiness preview, and financial evidence — without moving real money.

## What This Phase Does

- Creates a sandbox commercial pilot run linked to a pilot order.
- Generates invoice previews (preview-only, no real invoice issued).
- Simulates payment intents (simulation-only, no real charge/capture).
- Simulates refund scenarios (simulation-only, no real refund).
- Simulates payout scenarios (simulation-only, no real payout).
- Builds settlement previews (preview-only, no real payout).
- Allows printhouse commercial confirmation.
- Records and resolves commercial findings.
- Generates commercial evidence pack with integrity hash and redaction.
- Provides full audit timeline.

## What This Phase Does NOT Do

- No real payment execution.
- No real refund execution.
- No real payout execution.
- No external tax submission.
- No external accounting submission.
- No provider live capture/charge/refund/payout.
- No mutation of source commercial records outside pilot snapshots.
- No FULL_PUBLIC.
- No open marketplace access.

## Files

| File | Purpose |
|---|---|
| `migrations/069_phase125_sandbox_commercial_invoice_payment_handoff_pilot.sql` | Schema: 8 tables, indexes, foreign keys |
| `src/api/services/sandboxCommercialPilotService.js` | Service: all commercial sandbox operations |
| `src/api/routes/sandboxCommercialPilotAdmin.js` | Admin API: 12 endpoints |
| `src/ui/types/sandboxCommercialPilot.ts` | TypeScript interfaces |
| `src/ui/api/sandboxCommercialPilotClient.ts` | Frontend API client |
| `src/ui/pages/production/SandboxCommercialPilot.tsx` | Admin UI page |

## API Endpoints

All mounted at `/api/admin/production/sandbox-commercial-pilot`.

| Method | Path | Description |
|---|---|---|
| GET | `/readiness` | Check readiness (prior phases, migrations) |
| POST | `/create` | Create sandbox commercial run |
| POST | `/invoice-preview` | Build invoice preview (preview-only) |
| POST | `/simulate-payment` | Simulate payment intent |
| POST | `/simulate-refund` | Simulate refund scenario |
| POST | `/simulate-payout` | Simulate payout scenario |
| POST | `/settlement-preview` | Build settlement preview |
| POST | `/printhouse-confirmation` | Submit printhouse commercial confirmation |
| POST | `/finding` | Record commercial finding |
| POST | `/resolve-finding` | Resolve commercial finding |
| GET | `/audit-timeline` | Get audit timeline |
| GET | `/evidence-pack` | Build commercial evidence pack |

## Safety Invariants

All responses include safety markers confirming:

- `paymentExecutionEnabled: false`
- `refundExecutionEnabled: false`
- `payoutExecutionEnabled: false`
- `invoiceIssued: false`
- `invoicePreviewOnly: true`
- `paymentSimulationOnly: true`
- `payoutPreviewOnly: true`
- `fullPublicEnabled: false`
- `openMarketplaceAccessEnabled: false`
- `providerLiveCaptureEnabled: false`
- `externalTaxSubmissionEnabled: false`
- `externalAccountingSubmissionEnabled: false`
- `sourceMutationOutsidePilotScope: false`

## Smoke Tests

| Script | Focus |
|---|---|
| `smoke_phase125a_sandbox_commercial_pilot_schema.js` | Migration 069 tables, columns, indexes, FKs |
| `smoke_phase125b_sandbox_commercial_pilot_service.js` | Service methods, safety flags, simulation-only |
| `smoke_phase125c_sandbox_commercial_pilot_admin_api_ui.js` | Route mounting, UI integration, client API |
| `smoke_phase125d_sandbox_commercial_pilot_e2e_regression.js` | Full E2E flow, evidence pack validation |
| `smoke_phase125e_sandbox_commercial_pilot_acceptance_pack.js` | Acceptance pack with safety and prior phase checks |

## Validation

```bash
node --check src/api/services/sandboxCommercialPilotService.js
node --check src/api/routes/sandboxCommercialPilotAdmin.js
node scripts/smoke_phase125a_sandbox_commercial_pilot_schema.js
node scripts/smoke_phase125b_sandbox_commercial_pilot_service.js
node scripts/smoke_phase125c_sandbox_commercial_pilot_admin_api_ui.js
node scripts/smoke_phase125d_sandbox_commercial_pilot_e2e_regression.js
node scripts/smoke_phase125e_sandbox_commercial_pilot_acceptance_pack.js
npm run build
```
