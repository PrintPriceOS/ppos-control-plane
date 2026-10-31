# RECOVERY-10 — Phase 1: Production Preflight & Deployment Verification Report

**Mission:** `ORDEN DE MISIÓN — PAPER-MATERIALS-RECOVERY-10 — Despliegue productivo gobernado del sistema de evidencias técnicas`  
**Target Server:** `212.227.79.67` (`cool-shtern.212-227-79-67.plesk.page`)  
**Target Application:** `https://control.printprice.pro` (`/opt/printprice-os/ppos-control-plane`)  
**Target Database:** MySQL `Control` (`8.0.46-0ubuntu0.24.04.4`)  
**Authorized Target Commit:** `c99c5fbc6839e3817bddd6f9faf65ecf1a398d6a` (`RECOVERY_09H_FINAL_PREFLIGHT_PASS`)  
**Preflight Executed At:** `2026-10-29T12:10:11.502Z`  
**Phase 1 Status:** **`PASS`**

---

## 1. Server Working Tree & Active PM2 Runtime Inspection

Prior to modifying any file or schema on `212.227.79.67`, the production state of `/opt/printprice-os/ppos-control-plane` and all PM2 processes was inspected:

| Check Item | Observed Pre-Deployment Value | Status |
|---|---|---|
| **Server Repository Path** | `/opt/printprice-os/ppos-control-plane` | **VERIFIED** |
| **Pre-Deployment `HEAD` SHA** | `3874c42b180d7ac03ec2974bc746be8b9657a001` (`RECOVERY-07W` baseline) | **VERIFIED** |
| **Working Tree Status (`git status --short`)** | Clean (`""`, `gitStatusClean: true`) | **PASS** |
| **Active Control Plane PM2 Process** | `ppos-control-plane` (`pm_id: 0`, `pid: 3058442`, `status: online`, `username: root`, `node_version: 20.20.2`, `exec_path: /opt/printprice-os/ppos-control-plane/server.js`) | **ONLINE (`root`)** |
| **Vhost PM2 Processes (`/var/www/vhosts/printprice.pro/.pm2`)** | `preflight-app` (`id: 10`, `online`), `printprice-web` (`id: 18, 19`, `online`), `budget-app` (`id: 21`, `online`) | **ALL ONLINE** |

---

## 2. Migration Integrity & Current Schema State (`MySQL Control`)

- **MySQL Version:** `8.0.46-0ubuntu0.24.04.4` (`DATABASE() = 'Control'`)
- **Concurrent DDL/DML / Active Transactions:** `activeDdlOrDmlCount = 0`, `activeInnoTrxCount = 0` (`0` concurrent migrations or active writes).
- **Schema Ledger (`schema_versions`) Pre-Deployment State:**
  - Latest applied migration: `173_phase197b_spine_binding_profiles_and_snapshots` (`state: APPLIED`, `checksum: 29275551c2fc770880a4dfa66121f29859852e97bf3ec055a1118f1261b7a9ae`, `applied_at: 2026-10-28T17:03:53.000Z`).
  - Migration `174` tables present prior to Phase 3: **`0`** (`paper_variant_caliper_evidence`, `paper_variant_caliper_audit_log`, and `paper_variant_classification_evidence` did not exist yet).

---

## 3. Catalog Counts (`1,524 / 1,272 / 252`) & Pre-Deployment Table Checksums

| Metric / Checksum | Pre-Deployment Value | Expected Baseline | Status |
|---|---:|---:|---|
| **`total_variants` (`paper_variants`)** | **`1,524`** | `1,524` | **EXACT MATCH** |
| **`with_caliper` (`caliper_um > 0`)** | **`1,272`** (`83.46%`) | `1,272` | **EXACT MATCH** |
| **`missing_caliper` (`caliper_um IS NULL`)** | **`252`** (`16.54%`) | `252` | **EXACT MATCH** |
| **`historical_9_with_caliper`** | **`9`** | `9` | **EXACT MATCH** |
| **`historical_9_in_missing_252`** | **`0`** | `0` | **EXACT MATCH** |
| **`amber_graphic_122um_count`** | **`5`** | `5` | **EXACT MATCH** |
| **`galerie_art_matt_225um_count`** | **`4`** | `4` | **EXACT MATCH** |
| **`CHECKSUM TABLE Control.paper_products`** | **`1734492320`** | `1734492320` | **EXACT MATCH** |
| **`CHECKSUM TABLE Control.paper_variants`** | **`2093607442`** | `2093607442` | **EXACT MATCH** |
| **`CHECKSUM TABLE Control.supplier_paper_offers`** | **`3737849396`** | `3737849396` | **EXACT MATCH** |
| **`CHECKSUM TABLE Control.paper_technical_caliper_reference`** | **`2847849606`** | `2847849606` | **EXACT MATCH** |
| **`CHECKSUM TABLE Control.paper_caliper_reconciliation_candidates`** | **`3402454981`** | `3402454981` | **EXACT MATCH** |

---

## 4. Individual Verification of the 9 Protected Historical Conflicts

All `9` historical conflicts were individually verified in `MySQL Control` (`paper_variants` joined with `paper_caliper_reconciliation_candidates`). All `9` are included within the `1,272` variants with caliper (`0` counted in the `252` missing calipers):

| # | `variant_id` | `product_name` | `gsm` | Format (`mm`) | `caliper_um` | `caliper_source` | `caliper_confidence_status` | Conflict Traceability Note (`paper_caliper_reconciliation_candidates.notes`) |
|---:|---|---|---:|---|---:|---|---|---|
| 1 | `var_2b0314c68f5a97c7` | `Amber Graphic 100 102x72` | 100 | `1020x720` | **`122.00`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 15 has 119.00 um vs existing Livonia 122.00 um; existing preserved]` |
| 2 | `var_4178aecbfa53dcf8` | `Amber Graphic 100 72x102 FSC` | 100 | `720x1020` | **`122.00`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 17 has 119.00 um vs existing Livonia 122.00 um; existing preserved]` |
| 3 | `var_5f5cae75e6f45671` | `Amber Graphic 100 90x64 FSC` | 100 | `900x640` | **`122.00`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 19 has 119.00 um vs existing Livonia 122.00 um; existing preserved]` |
| 4 | `var_7b7e3a2a2a4a0313` | `Amber Graphic 100 64x90 FSC` | 100 | `640x900` | **`122.00`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 16 has 119.00 um vs existing Livonia 122.00 um; existing preserved]` |
| 5 | `var_c699e6a51cd6b41f` | `Amber Graphic 100 88x63` | 100 | `880x630` | **`122.00`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 18 has 119.00 um vs existing Livonia 122.00 um; existing preserved]` |
| 6 | `var_06e1d1681e4f0989` | `Galerie Art Matt 250 72x102 FSC` | 250 | `720x1020` | **`225.00`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 464 has 257.00 um vs existing Livonia 225.00 um; existing preserved]` |
| 7 | `var_9dabfd7ac5eff6ca` | `Galerie Art Matt 250 64x90 FSC` | 250 | `640x900` | **`225.00`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 463 has 257.00 um vs existing Livonia 225.00 um; existing preserved]` |
| 8 | `var_ae7dbf443ceab19a` | `Galerie Art Matt 250 46x64 FSC` | 250 | `460x640` | **`225.00`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 462 has 257.00 um vs existing Livonia 225.00 um; existing preserved]` |
| 9 | `var_e2f2e68304e9d4a1` | `Galerie Art Matt 250 90x64 FSC` | 250 | `900x640` | **`225.00`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 465 has 257.00 um vs existing Livonia 225.00 um; existing preserved]` |

---

## 5. System Resources, Health Endpoints & Private PDF Store Verification

- **Disk Capacity (`/dev/vda1`):** `232G` total, `170G` used, **`62G` available (`74%` used)**.
- **Control Plane Health (`127.0.0.1:8081`):**
  - `GET /live` -> `{"status":"UP"}`
  - `GET /ready` -> `{"status":"READY","service":"ppos-control-plane","schema":{"status":"READY","manifestVersion":1}}`
- **BPE Health (`https://budget.printprice.pro/api/health`):**
  - `{"ok":true,"service":"printpricepro-bookprice","env":"production"}`
- **Private PDF Store (`/var/lib/ppos/private_evidence_store`):**
  - Mode: **`0700`**, Owner: `0:0` (`root:root`, matching the effective PM2 user `root`), Write probe: **`canWrite: true`**.
  - Web server exposure check (`/etc/nginx`, `/etc/apache2`, `/var/www/vhosts/system`): **`0` references** (`webServerConfigReferencesCount: 0`). The directory is strictly outside all public document roots.
