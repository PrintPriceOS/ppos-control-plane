# RECOVERY-10 — Phase 6 (Part 2): Industrial Spine Calculator & Economic BPE Regression Report

**Mission:** `ORDEN DE MISIÓN — PAPER-MATERIALS-RECOVERY-10 — Despliegue productivo gobernado del sistema de evidencias técnicas`  
**Target Endpoints Verified:**
- `https://control.printprice.pro/api/v1/spine/calculate`
- `https://budget.printprice.pro` (`/api/health` & live browser quote engine)
- `MySQL Control` (`paper_products`, `paper_variants`, `supplier_paper_offers`, `paper_technical_caliper_reference`, `paper_caliper_reconciliation_candidates`)  
**Executed At:** `2026-10-29T13:31:04.622Z`  
**Status:** **`PASS (0.00 € Economic Drift, 0 Caliper Drift)`**

---

## 1. Live Production Spine Calculator Regression Matrix (`POST /api/v1/spine/calculate`)

We executed live authenticated calculations against `https://control.printprice.pro/api/v1/spine/calculate` (`200` pages, `148 x 210 mm`, `SOFTCOVER_STANDARD`) across recovered variants, protected historical conflicts, and missing-caliper variants:

| Test Case | `variantId` | Material Name | Authoritative `caliper_um` (`MySQL Control`) | Processing | Net Block (`mm`) | Spine Width (`mm`) | `canReleaseToManufacturing` | Status |
|---|---|---|---:|---|---:|---:|---|---|
| **1. RECOVERY-06 Reference** | `var_3d45d076a5d30a41` | `Munken Print Cream 15 100 72x102 FSC` | **`150.00 µm`** | `GLUED` | **`15.0 mm`** | **`16.0 mm`** | **`false`** | **PASS** |
| **2. RECOVERY-06 Reference** | `var_245413622bc57123` | `Amber Graphic 150 72x102 FSC` | **`178.00 µm`** | `GLUED` | **`17.8 mm`** | **`18.5 mm`** | **`false`** | **PASS** |
| **3. Protected Conflict #1 (`Amber 100g`)** | `var_2b0314c68f5a97c7` | `Amber Graphic 100 102x72` | **`122.00 µm`** | `SEWN` | **`12.2 mm`** | **`13.5 mm`** | **`false`** | **PASS** |
| **4. Protected Conflict #6 (`Galerie 250g`)** | `var_06e1d1681e4f0989` | `Galerie Art Matt 250 72x102 FSC` | **`225.00 µm`** | `GLUED` | **`22.5 mm`** | **`23.5 mm`** | **`false`** | **PASS** |
| **5. RECOVERY-07W Reference (`Munken 18 115g`)** | `var_e9b970adf34027f1` | `Munken Print White 18 115 72x102 FSC` | **`209.00 µm`** | `GLUED` | **`20.9 mm`** | **`22.0 mm`** | **`false`** | **PASS** |
| **6. Missing-Caliper Variant (Fail-Closed)** | `var_d6440696e5e27b83` | `Antislip pap.100 75x115` | **`NULL`** | `GLUED` | `null` | **`null` (`INVALID_BLOCKED`)** | **`false`** | **PASS** |

---

## 2. Economic BPE Zero-Drift Verification (`https://budget.printprice.pro`)

- **Service Health (`GET https://budget.printprice.pro/api/health`):**
  - `{"ok":true,"service":"printpricepro-bookprice","env":"production"}`
- **Live Browser & Reference Offer Check:**
  - Loaded `https://budget.printprice.pro` in Playwright (`HTTP 200`, screenshot captured).
  - Reference offer remains **`2.169,88 €`** with **`0,00 €` drift**.
  - BPE pricing tables and `supplier_paper_offers` checksum (`3737849396`) remain 100% untouched.

---

## 3. Post-Regression Database & Checksum Invariance (`MySQL Control`)

| Database Invariant / Checksum | Pre-Deployment (Phase 1) | Post-Deployment & Post-Regression (Phase 6) | Drift |
|---|---:|---:|---:|
| **`total_variants`** | `1,524` | **`1,524`** | **`0`** |
| **`with_caliper` (`caliper_um > 0`)** | `1,272` | **`1,272`** | **`0`** |
| **`missing_caliper` (`caliper_um IS NULL`)** | `252` | **`252`** | **`0`** |
| **`amber_graphic_122um_count` (Protected Conflicts 1–5)** | `5` | **`5`** | **`0`** |
| **`galerie_art_matt_225um_count` (Protected Conflicts 6–9)** | `4` | **`4`** | **`0`** |
| **`historical_9_in_missing_252`** | `0` | **`0`** | **`0`** |
| **`CHECKSUM TABLE Control.paper_products`** | `1734492320` | **`1734492320`** | **`0`** |
| **`CHECKSUM TABLE Control.paper_variants`** | `2093607442` | **`2093607442`** | **`0`** |
| **`CHECKSUM TABLE Control.supplier_paper_offers`** | `3737849396` | **`3737849396`** | **`0`** |
| **`CHECKSUM TABLE Control.paper_technical_caliper_reference`** | `2847849606` | **`2847849606`** | **`0`** |
| **`CHECKSUM TABLE Control.paper_caliper_reconciliation_candidates`** | `3402454981` | **`3402454981`** | **`0`** |
