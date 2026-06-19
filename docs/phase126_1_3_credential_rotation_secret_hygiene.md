# Phase 126.1.3 — Credential Rotation & Secret Hygiene Before Beta

This document details the operational checklist and security requirements for rotating the controlplane MySQL credential and auditing environmental secrets prior to launching the Phase 127 Limited Beta Preparation Gate.

## Production Action Steps

1. **MySQL Credential Rotation**:
   - Change the password of the database user `controlplane` on the hosting MySQL instance.
   - Update `DATABASE_URL` or `MYSQL_PASSWORD` in the production environment configurations (e.g. `.env`).

2. **Secrets Hygiene Verification**:
   - Confirm that no log outputs, stdout buffers, or PM2 process output streams expose raw credentials.
   - Verify that all active scripts mask the database password and JWT secret.

3. **Process Restart**:
   - Reload processes via PM2 to apply updated credentials:
     ```bash
     pm2 reload all --update-env
     ```

4. **Schema Verification & Smoke Testing**:
   - Run migrations to ensure connectivity is intact:
     ```bash
     node -r dotenv/config scripts/run-migrations-manual.js
     ```
   - Execute the validation smoke scripts.

## Safety Controls

- Payment, refund, payout, external provider API submission, open marketplace access, and auto limited beta activation remain completely locked in memory and inside the database checks.
