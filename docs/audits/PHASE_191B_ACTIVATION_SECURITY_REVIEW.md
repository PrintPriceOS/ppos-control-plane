# Phase 191B — Activation Security Review

## 1. Anti-Enumeration Protections
* `POST /api/auth/printhouse/start` and `POST /api/auth/printhouse/resend-activation` return an identical blind response regardless of account existence:
  `{ "ok": true, "message": "If this address can be used, activation instructions will be sent shortly." }`
* Responses do not leak whether an account is active, pending activation, or non-existent.

## 2. Token Secrecy & Storage
* Tokens are generated using `crypto.randomBytes(32)` (256 bits of entropy).
* Only the SHA-256 hash (`activation_token_hash`) is stored in `printhouse_signup_requests`. Raw tokens are never logged or exposed in DB dumps.

## 3. Scanner Resistance
* Token inspection (`POST /api/auth/printhouse/activation/inspect`) validates token format, expiration, and masked destination email **without consuming the token**.
* GET requests to `/auth/activate?token=...` render an interactive confirmation page requiring an explicit user click ("Activate Account") before sending `POST /api/auth/printhouse/activate`.

## 4. Atomic Consumption & Session Issuance
* Token consumption uses an atomic SQL UPDATE:
  `UPDATE printhouse_signup_requests SET status = 'CONSUMING', activation_consumed_at = NOW() WHERE activation_token_hash = ? AND status = 'PENDING' AND activation_expires_at > NOW()`
* Replay attempts are rejected with `ACTIVATION_ALREADY_USED`.
* JWT sessions are issued **only** after successful atomic account activation.
