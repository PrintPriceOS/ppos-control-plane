# PHASE 193G — PRE-DEPLOY & PRODUCTION READINESS ACCEPTANCE AUDIT

> **Status**: **PASS (GO FOR CONTROLLED DEPLOYMENT)**  
> **Canonical Source SHA**: `bba4578f57f44934a7760688cfb77ff0afea5c85`  
> **Canonical Annotated Tag**: `phase-193f-quick-pricing-calibration-ui`  
> **Canonical BPE Dependency**: `@ppos/pricing-engine` (1.0.0, Git-pinned commit `8d324290d64b5bf17325ff1098db7ebb5f646b5d`)  
> **Production Deployment Status**: **NOT YET AUTHORIZED** (Pending explicit deployment window authorization)

---

## 1. Source Baseline & Provenance Gate (`G0`, `G21`)

- **HEAD Commit**: `bba4578f57f44934a7760688cfb77ff0afea5c85`
- **Peeled Annotated Tag**: `refs/tags/phase-193f-quick-pricing-calibration-ui^{}` $\to$ `bba4578f57f44934a7760688cfb77ff0afea5c85`
- **Remote Branch**: `refs/heads/phase-39.2-tenant-management-console` $\to$ `bba4578f57f44934a7760688cfb77ff0afea5c85`
- **Worktree**: Clean.
- **Full Security Regressions**:
  - `smoke_phase193f_quick_calibration_ui.js`: **23 / 23 PASS**
  - `smoke_phase193e_conversational_assistant.js`: **26 / 26 PASS**
  - `smoke_phase193d_governed_acceptance.js`: **29 / 29 PASS**
  - `smoke_phase193c_inverse_solver.js`: **23 / 23 PASS**
  - `smoke_phase193b_calibration_foundation.js`: **59 / 59 PASS**
  - `smoke_phase183_migration_integrity.js`: **151 SQL files / 0 errors / 0 collisions**
  - Phase 192 RC20 Suites (P1–P35, R1–R18, F1–F12, I1–I10, A1–A6, U1–U13, T1–T20, D1–D30): **ALL PASS**
  - Setup Hub Auth & Icon Integrity: **10 / 10 PASS**
  - Marketplace Tenant Isolation & Adjacent Tabs: **60 / 60 PASS**
  - Production Build (`npm run build`): **PASS** (10.41s, 0 errors)

---

## 2. Production Environment & Runtime Audit (`G1`–`G3`)

- **Production Repository Path**: `/opt/printprice-os/ppos-control-plane`
- **Runtime Manager**: PM2 fork mode, single instance (`ppos-control-plane`), `NODE_ENV=production`.
- **System Prerequisites**: Node.js $\ge$ 20.x, npm $\ge$ 10.x, Git $\ge$ 2.x.
- **Checkout Safety**: No untracked files deleted; existing `.env` and production operational artifacts preserved.

---

## 3. Dependency & Provider Readiness (`G4`, `G5`)

1. **Private Git BPE Dependency (`G4`)**:
   - `package.json` points to immutable git commit:
     `git+https://github.com/PrintPriceOS/ppos-pricing-engine.git#8d324290d64b5bf17325ff1098db7ebb5f646b5d`
   - `.npmrc` configured with `allow-git=all` (no secrets or private tokens committed).
   - Zero local sibling path fallbacks (`file:../`).
2. **Gemini Backend Provider (`G5`)**:
   - Configured via server-side environment variable `GEMINI_API_KEY`.
   - Never exposed to browser client / frontend bundles.
   - Provider failures/timeouts fail-closed into canonical error codes (`AI_PROVIDER_UNAVAILABLE`), keeping manual 193B/C/D flow 100% operational.

---

## 4. Production Database Safety & Migrations Review (`G6`, `G7`, `G12`, `G13`)

- **Migration 146 (`146_phase193b_calibration_session_foundation.sql`)**: **SAFE_TO_APPLY**
  - Additive DDL: Creates `printhouse_pricing_calibration_sessions`.
  - Zero ALTER/DROP on existing tables; zero mutation to `printer_nodes`.
- **Migration 147 (`147_phase193c_calibration_runs.sql`)**: **SAFE_TO_APPLY**
  - Additive DDL: Creates `printhouse_pricing_calibration_runs`.
  - Strict FK cascades to tenants and calibration sessions. Zero mutation to existing active rates.
- **Migration 148 (`148_phase193d_governed_pricing_acceptance.sql`)**: **SAFE_TO_APPLY**
  - Additive DDL: Creates `printhouse_pricing_revisions` and `printhouse_pricing_calibration_acceptances`.
  - Zero automatic activation grants mutation; zero data rewrite.

### Execution Sequence:
```text
Pre-migration fresh mysqldump backup
  ↓
Run 146 -> Verify printhouse_pricing_calibration_sessions
  ↓
Run 147 -> Verify printhouse_pricing_calibration_runs
  ↓
Run 148 -> Verify printhouse_pricing_revisions & acceptances
  ↓
Zero-Data-Mutation Check:
- printer_nodes.rates_json UNCHANGED
- printhouse_activation_grants UNCHANGED
- Zero auto-created session/run/revision rows
```

---

## 5. Deployment, Rollback & Kill Switch Strategy (`G8`–`G10`, `G18`, `G19`)

- **Database Backup Gate (`G8`)**:
  - Fresh backup taken immediately prior to migration execution:
    `mysqldump -u <user> -p <db> --single-transaction --quick > /opt/backups/db_pre_phase193_<timestamp>.sql`
  - SHA-256 verified and recorded.
- **Frontend Deployment Baseline (`G9`)**:
  - Pre-deploy backup of `/var/www/vhosts/printprice.pro/control.printprice.pro/httpdocs`.
  - Atomically copy new `dist/` bundle after successful build.
- **Rollback Strategy (`G18`)**:
  - *Frontend failure*: Restore previous `httpdocs` backup.
  - *Backend startup failure*: `git checkout <previous_SHA>`, `npm ci`, restart PM2.
  - *Database schema rollback (before any accepted revisions)*: Restore pre-193 database backup.
  - *Accepted pricing rollback*: Governed forward-revision via `193D` / manual rate adjustment (never delete audit rows).
- **Kill Switch & Containment (`G19`)**:
  - If AI or solver issues emerge in production:
    1. The manual pricing editor (`CanonicalIndustrialPricingEditor`) remains fully active as a standalone fallback.
    2. Quick calibration panel entry can be hidden via feature flag without affecting running operations.
    3. Zero impact on active production quotes or live marketplace orders.

---

## 6. GO / NO-GO Production Readiness Matrix (`G23`)

| Gate Item | Evaluation Criteria | Status | Verdict |
|---|---|---|---|
| **SOURCE_BASELINE** | Commit `bba4578...` matched to peeled tag and remote branch | CLEAN / RESOLVED | **PASS** |
| **BPE_DEPENDENCY** | Private Git-pinned commit `8d324290...` with `.npmrc allow-git=all` | REPRODUCIBLE | **PASS** |
| **AI_PROVIDER** | Server-side key isolation, 15s hard timeout, fail-closed handling | SAFE / AGNOSTIC | **PASS** |
| **MIGRATION_STATE** | Baseline 151 migrations intact, 146/147/148 additive only | ZERO DRIFT | **PASS** |
| **DB_BACKUP_PLAN** | Fresh pre-193 dump procedure and SHA-256 gate documented | GOVERNED | **PASS** |
| **MIGRATION_SAFETY** | MySQL 8 compatible, zero ALTER/DROP, zero data rewrites | ADDITIVE ONLY | **PASS** |
| **PACKAGE_INSTALL** | `npm ci` with reproducible `package-lock.json` | DETERMINISTIC | **PASS** |
| **BACKEND_BUILD** | Node.js Fastify/Express routes with canonical auth middleware | VERIFIED | **PASS** |
| **FRONTEND_BUILD** | Vite production bundle built with 0 errors | CLEAN (10.41s) | **PASS** |
| **PM2_RUNTIME** | Fork mode, single instance, zero memory leak risks | AUDITED | **PASS** |
| **ROLLBACK_PLAN** | Multi-tier rollback (source, bundle, DB backup) defined | COMPLETE | **PASS** |
| **OBSERVABILITY** | Structured metadata logs in `api_audit_logs`, no secrets leaked | REDACTED | **PASS** |
| **SECURITY_REGRESSIONS** | 193B–193F + RC20 regression suites passing (100%) | 100% GREEN | **PASS** |
| **CONTROLLED_E2E_PLAN** | Step-by-step verification on authorized test/beta node | SAFE / STOP GATES | **PASS** |

---

## 7. Final Recommendation

```text
============================================================
PHASE_193G_PRE_DEPLOY: GO
============================================================
```

> [!IMPORTANT]
> This `GO` classification confirms that all technical, security, and operational gates are satisfied. **It does NOT execute or authorize production deployment automatically.** Deployment requires opening the controlled deployment window (`Phase 193G.2`).
