# PAPER-MATERIALS-RECOVERY-03 — Audit & Remediation of `UNKNOWN · UNCOATED`

**Mission:** `PAPER-MATERIALS-RECOVERY-03`  
**Phase:** Phase 4 — Revisión del problema `UNKNOWN · UNCOATED`  
**Scope:** `PrintPriceOS/ppos-control-plane` & `PrintPriceOS/PrintPricePro_BookPrice`

---

## 1. Executive Summary of Findings

When users inspected the Paper Materials catalog in Control Plane (`SupplierCatalogOffersPage.tsx`) or the paper selector in Budget App (`AdvancedPaperSelector.tsx`), **`1,097` of the `1,524` production variants (`71.98%`)** displayed the misleading string:

> `UNKNOWN · UNCOATED`

Our end-to-end trace across the batch import scripts, MySQL database schema, Control Plane API services, and frontend components proved that **`UNKNOWN · UNCOATED` is NOT a real paper property** — it was the concatenation of two distinct technical omissions caused by the original 4-column CSV batch import:

1. **First token (`UNKNOWN`) = `paper_variants.grain_direction`**:
   - `1,522` of the `1,524` production variants had `grain_direction = 'UNKNOWN'` because `Paper data base.ods.zip` had no grain column and the import batches omitted grain.
2. **Second token (`UNCOATED`) = `paper_variants.finish` (and `paper_products.coating_status`)**:
   - During the original import via `paper_supplier_schema_compatible_batches.zip` (` product_name, gsm, sheet_size, price_per_ton `), no `finish`, `paper_type`, or `coating_status` columns were present in the CSV.
   - [`src/api/services/paperImportService.js`](../../src/api/services/paperImportService.js) applied a naive keyword detector (`inferPaperType` / `inferFinish` / `inferCoatingStatus`) solely against `product_name`.
   - Whenever a product name did not literally contain English words like `silk`, `gloss`, `matt`, or `coated` (for example, `G-Print`, `LumiForte`, `MultiArt`, `Solaris`, `Chorus Lux`, `Ensocoat`, `Arktika`, `Incada`, `Tambrite`), the importer fell back to hardcoded defaults:
     - `paper_products.paper_type = 'OTHER'` (`1,024` variants)
     - `paper_products.coating_status = 'UNCOATED'` (`1,097` variants)
     - `paper_variants.finish = 'UNCOATED'` (`1,097` variants)

---

## 2. Exact Code Locations of the Bug (Before Fix)

### 2.1. Batch Import Hardcoded Fallback (`src/api/services/paperImportService.js`)
Previously, lines `109–123` of [`src/api/services/paperImportService.js`](../../src/api/services/paperImportService.js) contained:

```javascript
function inferFinish(rawFinish, productName = '') {
    const val = `${rawFinish || ''} ${productName || ''}`.trim().toLowerCase();
    if (val.includes('gloss') || val.includes('brillo')) return 'GLOSS';
    if (val.includes('silk') || val.includes('satin') || val.includes('estucado semimate')) return 'SILK';
    if (val.includes('matt') || val.includes('mate')) return 'MATT';
    return 'UNCOATED'; // <-- BUG: Defaulted every unrecognized paper to UNCOATED
}

function inferCoatingStatus(paperType, finish, rawCoating = '') {
    const val = String(rawCoating || '').trim().toLowerCase();
    if (val.includes('coated') && !val.includes('uncoated')) return 'COATED';
    if (val.includes('uncoated') || val.includes('no estucado')) return 'UNCOATED';
    if (paperType === 'COATED' || ['GLOSS', 'SILK', 'MATT'].includes(finish)) return 'COATED';
    return 'UNCOATED'; // <-- BUG: Defaulted every unrecognized paper to UNCOATED
}
```

### 2.2. API Serialization Hardcoded Fallback (`src/api/services/paperProcurementService.js` & `paperOfferService.js`)
Previously, [`src/api/services/paperProcurementService.js`](../../src/api/services/paperProcurementService.js) (lines `74–75`) and [`src/api/services/paperOfferService.js`](../../src/api/services/paperOfferService.js) (lines `148–149`) serialized variant rows as:

```javascript
grainDirection: r.grain_direction || 'UNKNOWN',
finish: r.finish || 'UNCOATED',
```
Furthermore, the SQL queries did not join `paper_products.paper_type` or `paper_products.coating_status`, nor did they inspect `metadata_json.ods_caliper_recovery` / `metadata_json.ods_materials_recovery`.

### 2.3. Control Plane UI Concatenation (`src/ui/pages/supplier/SupplierCatalogOffersPage.tsx`)
Previously, line `574` of [`src/ui/pages/supplier/SupplierCatalogOffersPage.tsx`](../../src/ui/pages/supplier/SupplierCatalogOffersPage.tsx) rendered the secondary subtitle in the "Format & Grain" column as:

```tsx
<div className="text-[11px] text-[var(--text-secondary)]">
    {offer.grainDirection} · {offer.finish}
</div>
```
Because `offer.grainDirection` was `'UNKNOWN'` and `offer.finish` was `'UNCOATED'`, the table rendered **`UNKNOWN · UNCOATED`** verbatim on `1,097` rows.

---

## 3. Quantified Impact Across the `1,524` Production Variants

| Stored DB State (`paper_type` / `coating_status` / `finish` / `grain_direction`) | Variant Count | Share of Catalog | Root Cause |
| :--- | :---: | :---: | :--- |
| `OTHER` / `UNCOATED` / `UNCOATED` / `UNKNOWN` | **`1,024`** | `67.19%` | Unrecognized product name during 4-column CSV import $\to$ synthetic fallback to `OTHER + UNCOATED + UNKNOWN`. |
| `OFFSET` / `UNCOATED` / `UNCOATED` / `UNKNOWN` | **`73`** | `4.79%` | Product name contained `offset` / `bond` $\to$ `UNCOATED`, plus missing grain `UNKNOWN`. |
| **Total rows displaying `UNKNOWN · UNCOATED` in UI** | **`1,097`** | **`71.98%`** | Combined count of `grain_direction = 'UNKNOWN'` + `finish = 'UNCOATED'`. |
| `COATED` / `COATED` / `MATT` / `UNKNOWN` | **`250`** | `16.40%` | Product name contained `matt` $\to$ displayed `UNKNOWN · MATT` (including uncoated `Munken Polar Rough` / `LuxCream` falsely marked `COATED`!). |
| `COATED` / `COATED` / `SILK` / `UNKNOWN` | **`112`** | `7.35%` | Product name contained `silk` $\to$ displayed `UNKNOWN · SILK`. |
| `COATED` / `COATED` / `GLOSS` / `UNKNOWN` | **`63`** | `4.13%` | Product name contained `gloss` $\to$ displayed `UNKNOWN · GLOSS`. |
| Demo rows (`LONG_GRAIN` / `SHORT_GRAIN`) | **`2`** | `0.13%` | Accredited demo rows (`Creator Silk`, `Amber Graphic`). |

---

## 4. End-to-End Remediation Implemented

### 4.1. Importer Hardening (`src/api/services/paperImportService.js`)
- Delegated `inferPaperType`, `inferFinish`, `inferCoatingStatus`, and `inferGrainDirection` to [`paperMaterialsNormalizationService.js`](../../src/api/services/paperMaterialsNormalizationService.js).
- Unrecognized finishes and coatings now return `'UNKNOWN'` instead of `'UNCOATED'`.
- Added explicit support for `coat` / `coating_status` (`krītots`, `nekrītots`, `1xkrītots`), `paper_type` (`Ofset`, `Silk`, `Matt`, `Dizaina`, `Kartons`), `code` (`originalCode`), and `sortiment` in CSV/XLSX batch imports, persisting full provenance in `metadata_json.ods_materials_recovery`.

### 4.2. Runtime Technical Attribute Resolver (`resolveVariantTechnicalAttributes`)
- Implemented [`resolveVariantTechnicalAttributes(row)`](../../src/api/services/paperMaterialsNormalizationService.js) and integrated it into:
  - [`src/api/services/paperProcurementService.js`](../../src/api/services/paperProcurementService.js) (`GET /api/Supplier/catalog-offers`)
  - [`src/api/services/paperOfferService.js`](../../src/api/services/paperOfferService.js) (`GET /api/paper-Catalog/variants`)
  - [`src/api/routes/marketplacePublic.js`](../../src/api/routes/marketplacePublic.js) (`GET /api/public/marketplace/paper-Catalog`)
- **Immediate Effect Even Before Mass DB Write**:
  1. If a row has `metadata_json.ods_materials_recovery` or `metadata_json.ods_caliper_recovery` (which is already present on `1,508` production rows from `PAPER-CALIPER-RECOVERY-02`), `resolveVariantTechnicalAttributes` resolves `paperType`, `coatingStatus`, and `finish` dynamically from the ODS provenance (`odsPaperType` + product name) and detects false synthetic `OTHER + UNCOATED + UNKNOWN` defaults, converting unverified values to `'UNKNOWN'` instead of lying with `'UNCOATED'`.
  2. Exposes `paperType`, `coatingStatus`, `coatingConfidence`, `finish`, `grainDirection`, `originalCode`, and `proviserRaw` cleanly in all API responses.

### 4.3. Control Plane UI & i18n (`SupplierCatalogOffersPage.tsx`, `es.ts`, `en.ts`, `de.ts`)
- Replaced raw `{offer.grainDirection} · {offer.finish}` in [`SupplierCatalogOffersPage.tsx`](../../src/ui/pages/supplier/SupplierCatalogOffersPage.tsx) with structured, localized badges:
  - When `grainDirection === 'UNKNOWN'`, renders localized `t.ppos.supplier.catalog.grainUnspecified` (`"Grain no especificado"` / `"Grain unspecified"` / `"Laufrichtung nicht angegeben"`).
  - Displays verified `paperType` (`OFFSET`, `COATED`, `DESIGN`, `CARTON`, `DIGITAL`), `coatingStatus` (`COATED`, `UNCOATED`, `ONE_SIDE_COATED`), and `finish` (`MATT`, `SILK`, `GLOSS`, `SEMI_GLOSS`, `UNCOATED`), or `t.ppos.supplier.catalog.finishUnspecified` (`"Acabado sin especificar"` / `"Finish unspecified"` / `"Oberfläche nicht angegeben"`) when `UNKNOWN`.
  - Raw `UNKNOWN · UNCOATED` can **never** be rendered in any language (`ES`, `EN`, `DE`).

### 4.4. Budget App Paper Selector (`PrintPricePro_BookPrice/components/AdvancedPaperSelector.tsx`)
- Updated [`AdvancedPaperSelector.tsx`](../../../PrintPricePro_BookPrice-feature-adversarial-node-v5.2/components/AdvancedPaperSelector.tsx) and [`types.ts`](../../../PrintPricePro_BookPrice-feature-adversarial-node-v5.2/types.ts) so each variant option in the selector displays:
  - Commercial paper name + `gsm` + sheet format (`width_mm × height_mm`)
  - Verified `paperType` / `finish` / `coatingStatus` (omitting `UNKNOWN` / `OTHER` noise)
  - Verified `grainDirection` (`LG` / `SG`) when known, without printing raw `UNKNOWN`
  - Authoritative caliper in $\mu\text{m}$ (`caliper_um`) when approved (`✓ XX µm`) or explicit caliper warning (`⚠ Sin espesor (µm)`)

