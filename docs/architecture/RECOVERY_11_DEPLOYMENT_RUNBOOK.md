# PAPER-MATERIALS-RECOVERY-11 — Production Deployment Runbook (Pre-Deployment Authorization Gate)

**Project:** PrintPrice OS Control Plane  
**Repository:** `PrintPriceOS/ppos-control-plane`  
**Target Branch:** `feat/paper-materials-recovery-11`  
**Base Reference:** `08eec541b56ccc42204ec157db0d2e28ee6d39e1` (`RECOVERY_10V_PRODUCTION_CERTIFIED`)  
**Target Server (when authorized in future mission):** `212.227.79.67` (`https://control.printprice.pro`)

> [!IMPORTANT]
> **NO PRODUCTION EXECUTION IN RECOVERY-11:**  
> `PAPER-MATERIALS-RECOVERY-11` is strictly a pre-deployment implementation and certification mission. No code deployment or catalog promotions have been executed against `212.227.79.67`. This runbook defines the exact preflight, deployment, verification, and rollback procedures for the subsequent authorized production deployment.

---

## 1. Schema Compatibility (Zero DDL Migration Required)

`PAPER-MATERIALS-RECOVERY-11` requires **zero new database migrations**. All columns, enums, and foreign keys used by the Governed Promotion workflow were provisioned and verified in production by Migration `174_phase197c_paper_evidence_and_technical_accreditation.sql` (`RECOVERY-10` / `RECOVERY-10V`):
- `paper_variant_caliper_evidence.applied_to_catalog_variant` (`TINYINT(1) NOT NULL DEFAULT 0`)
- `paper_variant_caliper_evidence.review_status` (`ENUM(..., 'APPROVED_FOR_TECHNICAL_USE', 'CERTIFIED_MEASURED', 'SUPERSEDED')`)
- `paper_variant_caliper_audit_log.action_type` (`ENUM(..., 'CATALOG_CALIPER_PROMOTED', 'EVIDENCE_SUPERSEDED')`)
- `paper_variant_caliper_audit_log.metadata_json` (`JSON NULL`)
- `paper_variants.caliper_revision` (`INT NOT NULL DEFAULT 0`)

---

## 2. Phase 1 — Read-Only Production Preflight Checklist

Before deploying `feat/paper-materials-recovery-11` to `212.227.79.67`:

1. **Verify Schema Version 174 & Catalog Invariants**:
   ```sql
   SELECT version, status, checksum FROM schema_versions WHERE version = '174';
   SELECT
     COUNT(*) AS total_variants,
     SUM(CASE WHEN caliper_um IS NOT NULL THEN 1 ELSE 0 END) AS with_caliper,
     SUM(CASE WHEN caliper_um IS NULL THEN 1 ELSE 0 END) AS without_caliper
   FROM paper_variants;
   ```
   - Expected pre-promotion baseline: `total_variants = 1524`, `with_caliper = 1272`, `without_caliper = 252`.

2. **Verify the 9 Protected Historical Conflicts**:
   - Confirm the 5 Amber Graphic (`122.00 µm`) and 4 Galerie Art Matt (`225.00 µm`) variants retain `caliper_source = 'LIVONIA_REFERENCE_IMPORT'` and `caliper_confidence_status = 'REFERENCE_IMPORTED'`.

3. **Logical Backup Before Code Rollout**:
   - Capture mysqldump of `paper_variants`, `paper_variant_caliper_evidence`, `paper_variant_caliper_audit_log`, and `spine_calculation_snapshots` into `/root/backups/recovery11_pre_deploy_<timestamp>.sql.gz` using a temporary root-owned `--defaults-extra-file` (`chmod 600`).

---

## 3. Phase 2 — Controlled Deployment Procedure

1. Fetch and checkout the certified commit of `feat/paper-materials-recovery-11` on `/var/www/ppos-control-plane`.
2. Build production frontend assets:
   ```bash
   npm run build
   ```
3. Reload PM2 worker cleanly:
   ```bash
   pm2 reload ppos-control-plane-api --update-env
   ```
4. Verify health and feature flag:
   ```bash
   curl -fsS http://127.0.0.1:3005/health
   ```

---

## 4. Phase 3 — Post-Deploy Smoke Verification & Rollback Plan

1. **Read-Only Promotion Preview Smoke Test**:
   - Call `GET /api/v1/paper-suppliers/accreditation/variants/:variantId/promotions` as `VIEWER` and confirm `200 OK` with `total_variants = 1524` untouched.
2. **Per-Variant Promotion Rollback (`revokeAndRevertPromotion`)**:
   - Any individual catalog promotion can be reverted transactionally via `POST /api/v1/paper-suppliers/accreditation/variants/:variantId/evidences/:evidenceId/promotions/revert` (`ADMIN` / `CATALOG_GOVERNANCE_ADMIN`), which restores `caliper_um = NULL`, increments `caliper_revision`, marks the evidence `SUPERSEDED`, and invalidates dependent Spine snapshots.
3. **Full Application Rollback**:
   - Checkout `08eec541b56ccc42204ec157db0d2e28ee6d39e1` (`feat/paper-materials-recovery-09`), run `npm run build`, and `pm2 reload ppos-control-plane-api`.

