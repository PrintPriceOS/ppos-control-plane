# Phase 191B — API Acceptance Criteria & Contracts

## Endpoints Verified

### 1. `POST /api/auth/printhouse/start`
* **Input:** `{ "email": "owner@printhouse.com", "acceptTerms": true }`
* **Acceptance:**
  * Returns 200 OK with generic message.
  * Does NOT issue JWT.
  * Does NOT create operational tenant/machines.
  * Rate-limited per IP and email.

### 2. `POST /api/auth/printhouse/activation/inspect`
* **Input:** `{ "token": "<raw-hex-token>" }`
* **Acceptance:**
  * Returns `{ "ok": true, "status": "READY_TO_ACTIVATE", "maskedEmail": "o***r@printhouse.com" }`.
  * Does NOT consume the token in DB.

### 3. `POST /api/auth/printhouse/activate`
* **Input:** `{ "token": "<raw-hex-token>", "password": "SecurePassword123!" }`
* **Acceptance:**
  * Atomically consumes token.
  * Creates tenant (`status: ACTIVE`), printer node (`status: DRAFT`), user (`PRINTHOUSE_ADMIN`).
  * Issues signed JWT session token.
  * Replay returns 400 with `ACTIVATION_ALREADY_USED`.
