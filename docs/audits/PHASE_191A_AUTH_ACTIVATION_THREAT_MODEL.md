# Phase 191A — Auth & Activation Threat Model

## 1. Attack Vectors & Mitigation Strategies

### Threat 1: Email Enumeration via Registration / Activation Requests
* **Risk:** Attackers probe `POST /api/auth/printhouse/start` with email lists to discover registered accounts.
* **Mitigation:**
  * Endpoint MUST return an identical blind response regardless of whether the email is new, already pending activation, or already registered:
    `{ "ok": true, "message": "If this email address is valid, an activation link has been sent." }`
  * Strict rate limiting per IP (10 requests per 15 min) and per normalized email address.

### Threat 2: Token Storage & Exposure
* **Risk:** Raw activation tokens stored in the database could be compromised via SQL leaks or backup dumps.
* **Mitigation:**
  * Raw tokens are generated using `crypto.randomBytes(32).toString('hex')` (256 bits of entropy).
  * ONLY the SHA-256 hash (`activation_token_hash`) is persisted in `printhouse_signup_requests`.
  * Tokens expire after 24 hours.

### Threat 3: Automatic Consumption by Email Security Scanners
* **Risk:** Corporate email filters (e.g., Proofpoint, Barracuda, Microsoft Defender) open links automatically to inspect destination pages, which would consume single-use tokens prematurely.
* **Mitigation:**
  * `GET /auth/activate?token=...` must ONLY render an intermediate confirmation landing page with an explicit user action ("Activate Account" button).
  * The actual token consumption and account creation happens via `POST /api/auth/printhouse/activate` initiated by the user's browser session.

### Threat 4: Replay Attacks & Concurrency Race Conditions
* **Risk:** Double-clicking or simultaneous requests redeeming the same token twice to provision duplicate tenants.
* **Mitigation:**
  * Database-level atomic consumption:
    `UPDATE printhouse_signup_requests SET status = 'CONSUMED', activation_consumed_at = NOW() WHERE activation_token_hash = ? AND status = 'PENDING' AND activation_expires_at > NOW()`
  * Affected rows check: If 0 rows updated, reject request with `TOKEN_INVALID_OR_EXPIRED`.

### Threat 5: Google OAuth Identity Hijacking & Account Linking
* **Risk:** Malicious user signing up via Google OAuth using an unverified email address to claim an existing email identity.
* **Mitigation:**
  * Verify Google ID token signature server-side using Google API public keys.
  * Verify `email_verified === true` claim in Google ID token payload.
  * Check `aud` matches configured `GOOGLE_CLIENT_ID` and `iss` is `accounts.google.com` or `https://accounts.google.com`.
