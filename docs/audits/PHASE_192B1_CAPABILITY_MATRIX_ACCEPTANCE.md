# Phase 192B.1: Capability Matrix & Double-Grant Acceptance

## 1. Complete Capability Matrix Test Results (`tests/printhouse_activation_adapter_test.js`)
- [x] **No Grants**: All capability flags strictly `false`.
- [x] **`MARKETPLACE_VISIBLE` only**: `MARKETPLACE_VISIBLE` is `true`, `LIVE_QUOTING_ALLOWED` is `false`.
- [x] **`LIVE_QUOTING_ALLOWED` only**: `LIVE_QUOTING_ALLOWED` is `true`, `JOB_ROUTING_ALLOWED` is `false`.
- [x] **`JOB_ROUTING_ALLOWED` only**: `JOB_ROUTING_ALLOWED` is `true`, `PRODUCTION_DISPATCH_ALLOWED` is `false`.
- [x] **`PRODUCTION_DISPATCH_ALLOWED` only**: Isolated cleanly.
- [x] **`MARKETPLACE_VISIBLE` + `LIVE_QUOTING_ALLOWED`**: Discovery and Quoting active; Routing is `false`.
- [x] **All Four Grants**: All capability flags active.
- [x] **Suspended Node**: Evaluates all capabilities to `false` (`status = 'SUSPENDED'`).
- [x] **Direct Revocation**: Immediately evaluates to `false`.
- [x] **Missing Record**: Returns `NOT_ACTIVATED` with `false` capabilities.
- [x] **DB Failure**: Returns `ERROR` and fails closed.
- [x] **Unknown Capability Name**: Rejects with `PRINTHOUSE_CAPABILITY_STATE_INVALID`.

## 2. Double-Grant Requirement Verification (`liveQuoteEligibilityService.js`)
Live quoting strictly requires **BOTH** `MARKETPLACE_VISIBLE = true` **AND** `LIVE_QUOTING_ALLOWED = true`:
- **Case A** (`MARKETPLACE_VISIBLE = true`, `LIVE_QUOTING_ALLOWED = false`): `DISCOVERABLE: TRUE`, `QUOTE_ELIGIBLE: FALSE`.
- **Case B** (`MARKETPLACE_VISIBLE = false`, `LIVE_QUOTING_ALLOWED = true`): `DISCOVERABLE: FALSE`, `QUOTE_ELIGIBLE: FALSE`.
- **Case C** (`MARKETPLACE_VISIBLE = true`, `LIVE_QUOTING_ALLOWED = true`): `DISCOVERABLE: TRUE`, `QUOTE_ELIGIBLE: TRUE`.
