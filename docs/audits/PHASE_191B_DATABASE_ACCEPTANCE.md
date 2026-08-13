# Phase 191B.1 — Database Acceptance Report

## 1. Schema DDL Inspection & Migration Safety
* **Migration File:** `migrations/137_phase191b_printhouse_signup_requests.sql`
* **Target Table:** `printhouse_signup_requests`
* **Structure:**
  ```sql
  CREATE TABLE IF NOT EXISTS printhouse_signup_requests (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      email_normalized VARCHAR(255) NOT NULL,
      provider VARCHAR(50) NOT NULL DEFAULT 'EMAIL',
      status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
      activation_token_hash VARCHAR(64) NOT NULL,
      activation_expires_at DATETIME NOT NULL,
      activation_consumed_at DATETIME NULL,
      activation_requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      send_count INT NOT NULL DEFAULT 1,
      failed_attempt_count INT NOT NULL DEFAULT 0,
      tenant_id VARCHAR(64) NULL,
      printhouse_id VARCHAR(64) NULL,
      control_user_id VARCHAR(64) NULL,
      metadata_json LONGTEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ph_signup_email_norm (email_normalized),
      INDEX idx_ph_signup_token_hash (activation_token_hash)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  ```
* **Classification:** `SAFE_TO_APPLY` (Strictly additive, non-destructive, zero changes to existing production tables).

## 2. Docker Compose Isolation Environment
* **File:** `docker-compose.phase191b-test.yml`
* **Engine:** MySQL 8.0 isolated container with disposable tmpfs storage for reproducible acceptance testing.

## 3. Data Integrity & Verification Evidence
1. **Email Normalization:** Inputs trimmed & lowercased (`Owner@Example.COM` -> `owner@example.com`).
2. **Token Secrecy:** Only 64-character SHA-256 hashes stored in `activation_token_hash`. Raw 256-bit entropy tokens are never persisted in any column.
3. **Pre-Activation Guarantee:** Zero records inserted into `tenants`, `printer_nodes`, or `control_users` during initial signup submission (`POST /start`).
4. **Post-Activation Graph:** Activation creates exactly 1 tenant (`status: ACTIVE`), 1 printer node (`status: DRAFT`), 1 user (`PRINTHOUSE_ADMIN`).
5. **Rollback Safety:** Failures during account creation trigger a connection rollback and reset request status to `PENDING`.
