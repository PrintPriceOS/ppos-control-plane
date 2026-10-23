# Paper Supplier Hub — Operational Status & Readiness

## Current Status (2026-10-23)
* **Active Branch**: `feat/paper-supplier-hub`
* **Baseline Remote Commit**: `ca7acf044e88313da82f43c619c457a1a906885d` (includes importer remediation, contextual GSM, and strict safe warnings).
* **Environment**: Local Workspace + Ephemeral MySQL (127.0.0.1:3307). Production deployment strictly deferred until after full review.
* **Target Delivery Scope**: Operational Management Pre-I4 (Iterations A, B, C, D).

---

## Tracking Matrix

| Iteration | Component | Description | Status |
| :--- | :--- | :--- | :--- |
| **Audit** | Root Cause Findings | Audit findings 1–5 documented in `PLAN.md` | **COMPLETED** |
| **Iter A** | Offer Contract | Hydrate top-level and variantDetails product name, gsm, dimensions | **COMPLETED** |
| **Iter A** | Canonical Categories | Expose CARTON, DESIGN, OFFSET, etc. in filter | **COMPLETED** |
| **Iter A** | Multi-state Metrics | Active variants vs Active/Inactive/Archived offers | **COMPLETED** |
| **Iter B** | Selection Engine | Page, row, and all-matching scope selection | **COMPLETED** |
| **Iter B** | Archive / Restore | Bulk & individual archive and restore with SKU check | **COMPLETED** |
| **Iter C** | Safe Offer Deletion | Delete offer when unreferenced, block with audit reason | **COMPLETED** |
| **Iter C** | Variant Deletion | Protected deletion only if unshared & unreferenced | **COMPLETED** |
| **Iter D** | Batch History | Staged batch history and pending review resume | **COMPLETED** |
| **Iter D** | Issues CSV & Template | Download unconfirmed issues and import template | **COMPLETED** |
| **Iter D** | Batch Retraction | Rollback batch if unreferenced | **COMPLETED** |
| **Iter D** | Technical Edit | Controlled variant editing with fingerprint recompute | **COMPLETED** |
| **Iter E** | Modal Viewport Fix | Portal to body, viewport fixed centering, scroll lock, focus trap | **COMPLETED** |
| **Closure** | Ephemeral MySQL Suite | 74/74 unit and integration tests passing | **COMPLETED** |
| **Closure** | TSC Diagnostics | 0 newly introduced TypeScript errors | **COMPLETED** |
| **Closure** | Browser E2E Geometry | 5/5 Playwright tests passed across desktop, mobile, 200% zoom | **COMPLETED** |
| **Closure** | Git Push & Report | Commit and push to `feat/paper-supplier-hub` | **IN PROGRESS** |

---

## Known Deficiencies & Diagnostic Notes
1. **DEMO-OFFER-01 & 02 missing specifications**: Confirmed mapping mismatch in `paperOfferService.js` vs `SupplierCatalogOffersPage.tsx`. Being remediated in Iteration A.
2. **Category filter gap**: UI dropdown missed canonical categories (`CARTON`, `DESIGN`, `OFFSET`, `OTHER`). Being remediated in Iteration A.
3. **AllyKing Cream GC2 325 72x104 dimension discrepancy**: Confirmed that the source ODS row contains name `72x104`, FORMAT `B1 720 x 1040`, but dimension columns `72` and `102` (720x1020 mm). The importer correctly flagged `DIMENSION_CONTRADICTION` and stored the column dimensions. Controlled technical edit workflow in Iteration D will provide operator tools to review and adjust with evidence without automatic unverified mutation.
4. **Dashboard & Settings loading loops**: Fixed and verified stable in commit `ccfecbf4`.
5. **Procurement Orders**: Deferred to Iteration I4 as specified in governance plan.
