# Phase 191B.1 — Final Acceptance & Runtime Evidence Report

## 1. Canonical Repository Identity & Metadata
* **Absolute Path:** `c:\Users\KIKE\Downloads\ppos-control-plane-phase-10-intelligence-layer`
* **Git Remote URL:** `https://github.com/PrintPriceOS/ppos-control-plane.git`
* **Git Active Branch:** `phase-39.2-tenant-management-console`
* **Git Commit SHA:** `aefbdf8acbc72d7bb81dd3ca22013e784d23a0b6`
* **Folder Name Discrepancy Note:** The folder name `ppos-control-plane-phase-10-intelligence-layer` is historical on the local filesystem. Canonical repository identity is strictly established by the Git remote (`PrintPriceOS/ppos-control-plane.git`), commit history, and active branch `phase-39.2-tenant-management-console`.
* **Runtime Versions:** Node.js `v24.18.0`, npm `12.0.1`.
* **Latest Migration Before Phase 191B:** `136_phase190_order_pricing_snapshot_sealing.sql`.

## 2. Acceptance Verdict Summary

```text
PHASE_191B_ACCEPTANCE: PARTIAL (QUALIFIED FOR PHASE 191C INFRASTRUCTURE)
PRODUCTION_EMAIL_DELIVERY: NOT VERIFIED (DEV LOGGER ADAPTER ACTIVE)
HORIZONTAL_RATE_LIMIT_GUARANTEE: NOT PROVEN (IN-MEMORY PROCESS-LOCAL LIMITER)
```

## 3. Evidence Matrix

| Category | Verification Method | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Migration 137 Schema DDL** | Additive SQL script check & test | `VERIFIED` | `migrations/137_phase191b_printhouse_signup_requests.sql` |
| **Email Normalization** | Unit & Integration Test | `VERIFIED` | Case-insensitive lowercasing & trimming |
| **Anti-Enumeration** | API & Unit Test | `VERIFIED` | Identical blind response for valid syntactical emails |
| **Token Secrecy & Entropy** | Code & Unit Test | `VERIFIED` | 256-bit entropy (`crypto.randomBytes(32)`), SHA-256 hash stored |
| **Non-Consuming Inspection** | API & Unit Test | `VERIFIED` | Pre-validates token without changing DB status |
| **Referrer Leakage Prevention**| Browser URL history check | `VERIFIED` | `history.replaceState` strips token after URL inspection |
| **Atomic Activation** | Unit & Concurrency Test | `VERIFIED` | Atomic DB update & transaction rollback on failure |
| **Concurrency Race Condition**| Parallel `Promise.all` test | `VERIFIED` | Exactly 1 success, 1 rejected with `ACTIVATION_ALREADY_USED` |
| **No Pre-Activation Account** | Code & Integration Test | `VERIFIED` | No tenant, node, or user created before token consumption |
| **Account Takeover Defense** | Integration Test | `VERIFIED` | Rejects activation for existing user emails cleanly |
| **Middleware Gating** | Express middleware test | `VERIFIED` | `requirePrinthouseSetupAccess` allows `DRAFT`/`CONFIGURING`, `requireApprovedPrinthouse` blocks live routes with 403 |
| **Frontend Production Build** | `npm run build` (Vite 6.4.2) | `VERIFIED` | Build succeeded in 11.65s with 0 errors |
| **Production Email Provider**| Code inspection | `NOT VERIFIED` | `EMAIL_PROVIDER=DEV_LOGGER` fallback active |
| **Distributed Rate Limiting**| Code inspection | `NOT PROVEN` | Process-local Map in-memory rate limiter |
