# Phase 191B.1 — Concurrency Acceptance Report

## 1. Concurrency Race Condition Model
When two activation requests for the exact same raw token are submitted simultaneously (e.g. rapid double-clicking or duplicate network packet dispatch), database atomicity must ensure that only one invocation succeeds in provisioning the account, while the secondary request fails gracefully without creating duplicate tenant or user rows.

## 2. Implementation Mechanism
Atomic consumption is enforced at the database level using an atomic UPDATE query prior to opening the account creation transaction:

```sql
UPDATE printhouse_signup_requests 
SET status = 'CONSUMING', activation_consumed_at = NOW() 
WHERE activation_token_hash = ? AND status = 'PENDING' AND activation_expires_at > NOW()
```

If `affectedRows === 0`, `printhouseActivationService` immediately returns:
`{ ok: false, error: { code: 'ACTIVATION_ALREADY_USED', message: 'Token has already been consumed or expired' } }`

## 3. Concurrency Test Script & Findings
* **Test Script:** `scripts/smoke_phase191b_mysql_concurrency.js`
* **Test Method:** Executed two concurrent `activateAccount` calls via `Promise.all([activateAccount(...), activateAccount(...)])`.
* **Results:**
  - Parallel Request A: `HTTP 200 OK` (Account Created, JWT Issued).
  - Parallel Request B: `HTTP 400 Bad Request` (`ACTIVATION_ALREADY_USED`).
  - Total Tenants Created: `1`.
  - Total Printer Nodes Created: `1`.
  - Total Admin Users Created: `1`.
* **Verdict:** `CONCURRENCY_RACE_TEST: PASSED`.
