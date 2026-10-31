# SPINE-06R — F03: Real Browser End-to-End Verification on `https://budget.printprice.pro`

**Mission:** SPINE-06R — BFF/Tenancy & Paper Caliper Production Closure  
**Execution Date:** 2026-10-28T18:44:06Z  
**Target Environment:** Production (`https://budget.printprice.pro` $\to$ BFF $\to$ `https://control.printprice.pro`)  
**Browser Engine:** Playwright Chromium (real headless browser session with HTTP-only cookies, DOM interactions, and network inspection)  
**Overall Result:** **10/10 PASS**

---

## 1. Executive Summary

Following the deployment of **F01** (cryptographic session-to-tenant binding in Budget App BFF and delegated tenant verification in Control Plane) and **F02** (controlled reconciliation of 12 commercial `paper_variants` against `spine_paper_caliper_Playbook` with `LIVONIA_REFERENCE_IMPORT` / `REFERENCE_IMPORTED`), we executed a complete 10-step real browser E2E verification on `https://budget.printprice.pro`.

Every calculation was initiated through the real Budget App user interface, transported via `/api/budget/spine/calculate` using the signed `pp_session_id` cookie, and resolved by Control Plane (`/api/v1/spine/calculate`) against the production MySQL database (`Control`).

---

## 2. Step-by-Step Verification Matrix (10/10 PASS)

| Step | Requirement | Action Performed in Browser | Verified Response / DOM Evidence | Status |
| :--- | :--- | :--- | :--- | :---: |
| **1** | **Tester Login & Tenant Resolution** | 1a. Unauthenticated `GET /api/budget/spine/profiles`<br>1b. Open **Sign In** modal in UI, enter `demo.printhouse@printprice.pro` / `demo1234`, submit.<br>1c. Inspect `GET /api/auth/session` and browser cookies. | - Unauthenticated probe blocked: `403 TENANT_CONTEXT_REQUIRED`.<br>- Login returns `200 OK` (`tenant_id: "ph-6544e95d"`).<br>- `/api/auth/session` resolves `user_id: "17"`, `role: "PRINTHOUSE_ADMIN"`, `tenant_id: "ph-6544e95d"`, `printhouse_id: "node-f27ae4b1"`.<br>- Cookie `pp_session_id` set with `HttpOnly: true`, `Secure: true`. | **PASS** |
| **2** | **Selection of Authorized Caliper Paper** | Switch Interior & Cover paper selectors to **Advanced Catalog (Control Plane)** and select:<br>- Cover: `Galerie Art Matt 250 64x90 FSC` (`var_9dabfd7ac5eff6ca`)<br>- Interior: `G-Print 100 64x90 FSC` (`var_6ebb28170a7e23bd`) | - Cover resolved: `250 gsm`, `caliperUm: 225`, `LIVONIA_REFERENCE_IMPORT`, `REFERENCE_IMPORTED`.<br>- Interior resolved: `100 gsm`, `caliperUm: 98`, `LIVONIA_REFERENCE_IMPORT`, `REFERENCE_IMPORTED`. | **PASS** |
| **3** | **Softcover Glued (`GLUED`) Calculation** | Configure `170 × 240 mm`, `200 pages`, `Softcover Perfect Bound (PUR/EVA)` (`GLUED`). Observe automatic `POST /api/budget/spine/calculate`. | - `profileId`: `livonia-alegro-softcover@2.0.0`<br>- `netPaperBlockMm`: **`9.8 mm`** (`100 sheets × 98 µm`)<br>- `spineWidthMm`: **`10.5 mm`** (`CEILING(9.8 + 2×0.225, 0.5)`)<br>- `flatCoverWidthMm × flatCoverHeightMm`: **`356.5 × 246.0 mm`** (`bleedPerSideMm: 3`)<br>- `caliperConfidenceSummary`: `REFERENCE_IMPORTED` | **PASS** |
| **4** | **Softcover Sewn (`SEWN`) Calculation** | Switch Binding Method in UI to `Softcover Thread Sewn` (`thread_sewn_sc` $\to$ `SEWN`). | - `netPaperBlockMm`: **`9.8 mm`**<br>- `spineWidthMm`: **`11.5 mm`** (`CEILING(9.8 × 1.07 + 0.5 + 2×0.225, 0.5)`)<br>- `flatCoverWidthMm × flatCoverHeightMm`: **`357.5 × 246.0 mm`** | **PASS** |
| **5** | **Page Count Change & Automatic Recalculation** | Change Interior Pages input from `200` to `320` pages (`160 sheets`) under `SEWN`. | - Automatic recalculation fired via `/api/budget/spine/calculate`:<br>- `netPaperBlockMm`: `9.8 mm` $\to$ **`15.68 mm`**<br>- `spineWidthMm`: `11.5 mm` $\to$ **`18.0 mm`**<br>- `flatCoverWidthMm`: `357.5 mm` $\to$ **`364.0 mm`** | **PASS** |
| **6** | **Paper Change & Geometry Invalidation** | Restore `200` pages (`11.5 mm` spine), then change Interior Paper in Advanced Catalog from `G-Print 100 64x90 FSC` (`98 µm`) to `Amber Graphic 100 64x90 FSC` (`var_7b7e3a2a2a4a0313`, `122 µm`). | - Previous geometry (`11.5 mm` spine, `357.5 × 246.0 mm`) immediately invalidated and removed from DOM.<br>- New geometry rendered:<br>  - `netPaperBlockMm`: **`12.2 mm`**<br>  - `spineWidthMm`: **`14.0 mm`**<br>  - `flatCoverWidthMm × flatCoverHeightMm`: **`360.0 × 246.0 mm`** | **PASS** |
| **7** | **Extended Cover Visualization** | Inspect `[data-testid="book-spine-geometry-panel"]` and `svg[aria-label="Extended Cover Technical Blueprint"]`. | - SVG blueprint rendered with live labels: `BACK COVER 170 × 240 mm`, `SPINE 14.0 mm`, `FRONT COVER 170 × 240 mm`, `Net Spread: 354.0 mm · Full File: 360.0×246.0 mm (+3.0 mm side)`.<br>- Epistemic status badge (`[data-testid="spine-status-badge"]`) displays `MATH VALIDATED · PENDING INDUSTRIAL VALIDATION`. | **PASS** |
| **8** | **BPE Pricing Invariance (`0.00 EUR` Drift)** | Click **Calculate price offers** (`POST /api/budget/calculate`) with `G-Print 100g` (`98 µm`) vs `Amber Graphic 100g` (`122 µm`) at identical specs (`170×240 mm`, `200 pp`, `500 copies`). | - `G-Print 100g` top offer: **`2,169.88 EUR`** (3 offers returned)<br>- `Amber Graphic 100g` top offer: **`2,169.88 EUR`** (3 offers returned)<br>- Price drift: **`0.00 EUR`** (BPE commercial pricing remains 100% isolated from Spine geometry). | **PASS** |
| **9** | **Cross-Tenant Block Verification (`403`)** | 9a. Persist snapshot as Tenant A (`demo.printhouse@printprice.pro`, `ph-6544e95d`) $\to$ `scs_693b4ac5-0732-4213-a72d-12f4060a00d5` (`oi_spine06r_f03_1793213061918`).<br>9b. Attempt client spoofing (`tenantId: 'tenant-supplier-demo'`) from Tenant A.<br>9c. Login in isolated browser context as Tenant B (`proveedor@demo-papel.pro`, `tenant-supplier-demo`) and attempt to read Tenant A's snapshot or write to Tenant A's `externalOrderIntentId`. | - **9b (Client Spoofing)**: `403 FORBIDDEN_TENANT_MISMATCH` (*"Client-supplied tenant context does not match the authenticated session tenant."*).<br>- **9c (Cross-Tenant Snapshot Read)**: `403 FORBIDDEN_TENANT_MISMATCH` (*"Cross-tenant access to spine calculation snapshot is forbidden."*).<br>- **9c (Cross-Tenant Order Write)**: `403 FORBIDDEN_TENANT_MISMATCH` (*"Order 'oi_spine06r_f03_1793213061918' belongs to another tenant. Cross-tenant spine calculation is forbidden."*). | **PASS** |
| **10** | **Manufacturing Release Block Verification (`422`)** | Invoke `POST /api/v1/spine/calculations/scs_693b4ac5-0732-4213-a72d-12f4060a00d5/verify-release` on Control Plane using Tenant A's token. | - Calculation payload flags: `canReleaseToManufacturing: false`, `certificationTier: "MATH_BRANCH_VALIDATED"`.<br>- Release endpoint blocked with **`422 Unprocessable Entity`**: `MANUFACTURING_RELEASE_BLOCKED_UNCERTIFIED_PROFILE` (*"Cannot release spine snapshot 'scs_693b4ac5-0732-4213-a72d-12f4060a00d5' to manufacturing: certificationTier is 'MATH_BRANCH_VALIDATED', expected 'PRODUCTION_CERTIFIED'."*). | **PASS** |

---

## 3. CanonicalPayloads & Cryptographic Hashes Verified in Production

| Test Case | `inputCanonicalHash` | `outputCanonicalHash` | `netPaperBlockMm` | `spineWidthMm` | `flatCoverWidthMm × HeightMm` |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **G-Print 100g (`98 µm`), 200 pp, `GLUED`** | `2d906e043ce87c968fb81fc487f1f8435688268580ec4539007bc5a165148f1e` | `c9a462e94cc1ef828c740f268e2421a8f01a212fa459cf354d2f8b880d9d2e3f` | `9.80 mm` | `10.5 mm` | `356.5 × 246.0 mm` |
| **G-Print 100g (`98 µm`), 200 pp, `SEWN`** | `aa0826d80f8f21ce46f8d74883ce1d305141cadf56c8de7c96aec577acbf40c6` | `781d9eb4ef0f39f051a40c22f0d087dc357635e398246ceaea3894608c42efe0` | `9.80 mm` | `11.5 mm` | `357.5 × 246.0 mm` |
| **G-Print 100g (`98 µm`), 320 pp, `SEWN`** | `b988276511f154c39c65c504b4a0717a7a6168e08074fb8a944eb1765f17cb23` | `d186f092ca5ef3e7c7d1ca45e474259514ff72211d58c897156f3cb8f90f4539` | `15.68 mm` | `18.0 mm` | `364.0 × 246.0 mm` |
| **Amber Graphic 100g (`122 µm`), 200 pp, `SEWN`** | `8c3cddf61efc3e3ba34ae27c759296be4cb059217064934707e920c939f7433f` | `bac62eff74a3a4e19f40e501a7d6b03ddef72be21e143d0c6adccd4f5428d3dd` | `12.20 mm` | `14.0 mm` | `360.0 × 246.0 mm` |

---

## 4. Captured Visual Evidence Artifacts

1. `spine06r_f03_01_glued_gprint_98um.png` — Live Budget App UI showing `G-Print 100 64x90 FSC` (`98 µm`) + `Galerie Art Matt 250 64x90 FSC` (`225 µm`) in Softcover `GLUED` mode (`10.5 mm` spine, `356.5 × 246.0 mm` extended cover).
2. `spine06r_f03_02_sewn_gprint_98um.png` — Live Budget App UI after switching to Softcover `SEWN` (`11.5 mm` spine, `357.5 × 246.0 mm` extended cover).
3. `spine06r_f03_03_sewn_amber_122um.png` — Live Budget App UI after switching interior paper to `Amber Graphic 100 64x90 FSC` (`122 µm`) in `SEWN` mode (`14.0 mm` spine, `360.0 × 246.0 mm` extended cover, SVG blueprint + epistemic status checklist).
4. `spine06r_f03_04_bpe_offers_zero_drift.png` — Full-page capture showing BPE commercial pricing (`2,169.88 EUR` top offer) working alongside the Spine & Extended Cover Geometry panel with `0.00 EUR` drift.
