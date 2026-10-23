# Paper Supplier Hub — Operational Management Plan (Pre-I4)

> [!NOTE]
> **Documentación Canónica**: La especificación maestra y trazabilidad histórica del módulo se gestionan en [docs/implementation/paper-supplier-hub/PLAN.md](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/implementation/paper-supplier-hub/PLAN.md) y [docs/implementation/paper-supplier-hub/STATUS.md](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/implementation/paper-supplier-hub/STATUS.md). Este documento en la raíz sirve como tracker operativo del sprint Pre-I4.

## 1. Executive Summary & Objective
Complete the operational governance, lifecycle management, and catalog maintenance of Paper Supplier Hub on branch `feat/paper-supplier-hub` prior to Iteration I4 (Procurement Orders).

This plan addresses:
1. Operational data contracts & consistency (offers -> variants -> products, complete canonical categories, multi-state metrics).
2. Individual and bulk lifecycle management (selection across pages/filters, archive, restore, and safe deletion with dependency revalidation).
3. Technical catalog sharing semantics (shared canonical specs vs supplier-specific offers and batches; zero destructive cascades to third parties or historical procurement).
4. Technical maintenance & batch staging tools (batch history, reopening pending batches, discrepancy drill-down, issue CSV export, controlled technical editing, and safe batch retraction).
5. Granular role-based permissions (SUPPLIER_VIEWER read-only, SUPPLIER_OPERATOR actions, SUPPLIER_ADMIN hard-delete).
6. Full test verification on ephemeral MySQL (127.0.0.1:3307), zero new TypeScript diagnostics, and production build readiness.

---

## 2. Production Audit & Root Cause Analysis

### Finding 1: DEMO-OFFER-01 and DEMO-OFFER-02 show "Paper Product" and empty specifications
* **Status**: Confirmed Defect.
* **Root Cause Proven**: In `src/api/services/paperOfferService.js` (`listSupplierOffers`), product and variant details were mapped exclusively inside a nested `variantDetails: { productName, gsm, widthMm, heightMm, finish }` object. However, `SupplierCatalogOffersPage.tsx` directly read top-level `off.productName`, `off.gsm`, `off.widthMm`, `off.heightMm`, and `off.finish`. Because those top-level properties were `undefined`, the UI defaulted to `'Paper Product'` and rendered empty dimension/grammage slots.
* **Remediation**:
  1. Flatten `productName`, `gsm`, `widthMm`, `heightMm`, `finish`, `category`, and `brand` at the top level of the offer response while preserving `variantDetails` for backwards compatibility.
  2. In the UI, robustly resolve both `off.variantDetails` and `off.*` properties.
  3. If a variant reference is missing or inaccessible, render explicit localized fallback state (`"Variante no disponible"` / `"Unlinked Variant"`) rather than invented values.

### Finding 2: Category Filter mismatch with Canonical Domain Model
* **Status**: Confirmed Defect.
* **Root Cause Proven**: `paper_products.category` enum in MySQL migration 163 defines `('CARTON', 'OFFSET', 'COATED', 'UNCOATED', 'DESIGN', 'DIGITAL', 'OTHER')`. The dropdown in `SupplierCatalogOffersPage.tsx` hardcoded `COATED`, `UNCOATED`, `SPECIALTY`, `KRAFT`, `BOARD` (inherited from printhouse substrate types), completely omitting `CARTON`, `OFFSET`, `DESIGN`, `DIGITAL`, and `OTHER`. Users could not filter by major paperboard and specialty categories.
* **Remediation**:
  1. Expand the filter dropdown to include all canonical categories: `COATED`, `UNCOATED`, `OFFSET`, `CARTON`, `DESIGN`, `DIGITAL`, `OTHER`.
  2. Retain historical legacy categories (`SPECIALTY`, `KRAFT`, `BOARD`) in the filter options to prevent breakage of any pre-existing records.
  3. Ensure no silent recategorization takes place.

### Finding 3: "AllyKing Cream GC2 325 72x104" shows a variant of 720x1020 mm
* **Status**: Investigated & Proven Data Finding (No automatic mutation allowed).
* **Root Cause Proven**:
  - In source file `content.xml`:
    - Product Name (Cell 1): `AllyKing Cream GC2 325 72x104`
    - FORMAT field (Cell 5): `B1 720 x 1040`
    - Width column (Cell 10): `72` (cm -> 720 mm)
    - Height column (Cell 11): `102` (cm -> 1020 mm)
  - The legacy supplier spreadsheet contains an internal contradiction between the descriptive format text (`104` / `1040`) and the numerical dimension column (`102` / `1020`).
  - The importer normalized the explicit dimension columns (720x1020 mm) and flagged a `DIMENSION_CONTRADICTION`. Upon confirmation, the variant was created with the numerical column values (720x1020 mm).
* **Policy & Remediation**:
  - In accordance with project instructions: *Never assume the name is the single source of truth or mutate live data automatically*.
  - Provide a controlled technical editing workflow for authorized operators to inspect the evidence (`formatDimensions`, `colW_mm`, `colH_mm`) and manually update or version the variant if warranted.

### Finding 4: Absence of Selection, Batch Actions, Archive/Restore, and Safe Deletion
* **Status**: Confirmed Functional Gap.
* **Root Cause Proven**: `SupplierCatalogOffersPage.tsx` lacked row selection, bulk action bars, archive/restore controls, and deletion modals. Backend lacked bulk status endpoints and safe delete handlers.
* **Remediation**: Implement structured selection, reversible archiving, and restricted hard-deletion (SUPPLIER_ADMIN only, zero references).

### Finding 5: Procurement Orders Status
* **Status**: Explicitly deferred to Iteration I4. Current delivery will not prematurely implement I4 order fulfillment.

---

## 3. Iterative Implementation Plan

### Iteration A: Contracts, Categories, and Metrics
- **A1. Offer Data Contract**: Return real product name, grammage, dimensions, finish, and category at both top level and `variantDetails`. Handle orphan variants fail-closed with clear indicator.
- **A2. Canonical Categories**: Align frontend filter and i18n with `CARTON`, `OFFSET`, `COATED`, `UNCOATED`, `DESIGN`, `DIGITAL`, `OTHER`, plus legacy compatibility aliases.
- **A3. Multi-State Metrics**: Enhance Dashboard and Catalog counters to distinguish:
  - Total active technical variants in published catalog.
  - Active offers vs. Inactive offers vs. Archived offers.
- **A4. Automated Tests**: Regression suite covering offer data hydration, category filtering, and metric calculation.

### Iteration B: Selection and Lifecycle Management (Archive / Restore)
- **B1. Selection Engine**:
  - Checkbox per row and "Select Visible Page" toggle.
  - "Select All Matching Results" scope with exact count across pages.
  - Selection clear on supplier change, tab change, or filter change.
- **B2. Bulk Offer Status (Activate / Deactivate / Archive / Restore)**:
  - Backend `PATCH /api/v1/paper-suppliers/offers/bulk-status`.
  - Atomically update offer status and create audit revisions.
  - Maintain unique active SKU invariant: restoring an archived offer checks if the SKU was re-allocated while archived.
- **B3. UI Action Bar & Confirmation**:
  - Action bar showing selected count and available actions based on role and current status.
  - Confirmation modal with breakdown of affected records.

### Iteration C: Safe Deletion & Technical Catalog Shared Semantics
- **C1. Catalog Sharing Invariants**:
  - `paper_products` and `paper_variants` are canonical shared assets across the platform.
  - A supplier cannot hard-delete a variant that has offers from other suppliers or is referenced in procurement receipts/orders.
  - If a supplier wishes to remove a variant from their view, they archive/delete their commercial offer.
- **C2. Safe Offer Deletion**:
  - `DELETE /api/v1/paper-suppliers/offers/:offerId` and `POST /api/v1/paper-suppliers/offers/bulk-delete`.
  - If offer has historical procurement receipts or order lines -> block hard delete, enforce soft ARCHIVE.
  - If offer has zero external references -> allowed hard delete (SUPPLIER_ADMIN only) with revision ledger cleanup.
- **C3. Controlled Variant Deletion**:
  - Only permitted if: created by current supplier's batch, zero other supplier offers exist, zero procurement references exist.
  - Reserved strictly for `SUPPLIER_ADMIN`.

### Iteration D: Technical Maintenance, Import Tooling & Document Closure
- **D1. Batch Staging History**:
  - Endpoint `GET /api/v1/paper-suppliers/catalog/imports` returning batch history with file name, date, user, status, and row breakdown.
  - Re-open pending `PREVIEW` batches directly into the review modal.
- **D2. Batch Retraction / Rollback**:
  - Endpoint `POST /api/v1/paper-suppliers/catalog/imports/:batchId/retract`.
  - Allows withdrawing records created by a confirmed batch if unreferenced by other suppliers or orders.
- **D3. Issues Export & Template Download**:
  - Endpoint `GET /api/v1/paper-suppliers/catalog/imports/:batchId/export-issues` returning CSV of problematic rows with exact error messages.
  - Endpoint `GET /api/v1/paper-suppliers/catalog/template` providing compatible CSV template.
- **D4. Controlled Technical Variant Editing**:
  - Endpoint `PATCH /api/v1/paper-suppliers/catalog/variants/:variantId`.
  - Recomputes variant fingerprint, verifies duplicate collision, and validates dimensions/gsm.
- **D5. Regressions, Vitest, Build & Document Closure**:
  - All test suites passing on ephemeral MySQL.
  - TypeScript comparison (0 new errors).
  - Update `STATUS.md`.

### Iteration E: Modal Positioning & Accessibility (Item 7)
- **E1. Root Cause Proven**:
  - `src/ui/layout/Layout.tsx` wraps page content inside `<div className="... animate-slide-fade">`. CSS property `translateY(...)` in CSS Transforms Module Level 1 §6 creates a local containing block for all `position: fixed` descendants.
  - In addition, `<main>` has `overflow-y-auto`. When long tables scroll down, unportaled `position: fixed` modals are anchored to the scrolled, transformed container, displacing the dialog off-screen or down to the bottom of the long list.
- **E2. Accessible Portal Dialog (`AccessibleModal.tsx`)**:
  - Implemented `<AccessibleModal>` using `@headlessui/react` `Dialog`, which portals directly to `document.body`, escaping all container transforms and scroll offsets.
  - Root overlay covers browser viewport: `position: fixed; inset: 0; z-index: 50;`.
  - Viewport centering wrapper: `fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto`.
  - Max dimensions limited to viewport (`max-h-[calc(100vh-2rem)] sm:max-h-[88vh]`), with internal scrollable body (`overflow-y-auto min-h-0`) and sticky header/footer.
  - Body scroll lock while open, restored without jump on close.
  - Accessibility: `role="dialog"`, `aria-modal="true"`, focus trap, initial focus, return focus to trigger button on close, Escape key handler with `hasUnsavedChanges` confirmation.
- **E3. Supplier Hub Modals Migration**:
  - Technical Specs Detail Modal (`variantDetailModalOpen`).
  - Technical Import & Review Modal (`TechnicalImportModal.tsx`).
  - Create / Edit Offer Modal (`isOfferModalOpen`).
  - Price & Terms Revisions Ledger (`isRevisionsModalOpen`).
  - Import Batch History Modal (`isBatchHistoryModalOpen`).
  - Edit Technical Variant Specs Modal (`isEditVariantModalOpen`).
  - Confirmation Modal (`confirmModal.isOpen`).
  - Bulk Operation Report Modal (`reportModal`).

---

## 4. Acceptance Criteria
1. DEMO-OFFER-01/02 and all listed offers display real product name, grammage, and dimensions without N+1 queries.
2. Category filter supports all 7 canonical categories and returns corresponding records.
3. Dashboard displays accurate active variants and differentiated offer metrics (active / inactive / archived).
4. Selection supports single, visible page, and all-matching scope with exact counts.
5. Archiving and restoring offers updates status atomically and checks SKU uniqueness upon restore.
6. Hard deletion is restricted to SUPPLIER_ADMIN and blocked when references exist.
7. Batch history, issue CSV export, and batch retraction work seamlessly without affecting shared catalog records.
8. Zero new TypeScript errors and all Vitest integration suites pass cleanly (74 tests passed).
9. All Supplier Hub modals appear centered in visible viewport when opened from top, middle, or bottom of long scrolled tables, tested across desktop (1366x768), short screen (1024x500), mobile (390x844), and 200% zoom.

