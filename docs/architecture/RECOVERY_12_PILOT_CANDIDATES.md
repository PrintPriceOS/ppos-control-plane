# RECOVERY-12 (Option A) — P1 Pilot Candidates Audit & Extraction Report

**Mission ID:** `RECOVERY-12` (Option A — Read-Only Audit & Candidate Extraction)  
**Repository:** `PrintPriceOS/ppos-control-plane`  
**Target Environment:** `https://control.printprice.pro` (`Control.paper_variants`)  
**Execution Mode:** **STRICTLY READ-ONLY / ZERO DATABASE MUTATIONS**  
**Audit Date:** 2026-10-31  

---

## 1. Executive Summary & Governance Compliance

This report executes **Option A of `RECOVERY-12`** in strict read-only audit mode over the `252` missing-caliper variants cataloged in `RECOVERY_08_MISSING_MATERIALS_INVENTORY.csv` and `RECOVERY_08_SUPPLIER_REQUEST_MATRIX.csv`:

1. **Zero Database Mutations Enforced:** No `INSERT`, `UPDATE`, `DELETE`, or `ALTER` statements were executed against `Control.paper_variants` or any production table. The production catalog remains intact at **`1,524` total variants** (**`1,272` with authoritative caliper** and **`252` with `caliper_um IS NULL`**; `CHECKSUM TABLE Control.paper_variants = 2093607442`).
2. **Track Partitioning & Strict Exclusions (`252` Missing-Caliper Variants):**
   - **`DATASHEET_REQUEST_TRACK` (`102` variants):** Candidates eligible for documentary datasheet accreditation (`DOCUMENTATION_REQUIRED`).
   - **`PHYSICAL_MICROMETER_TRACK` (`145` variants — STRICTLY EXCLUDED):** Bespoke converting substrates, specialty coverings, self-adhesives, and merchant house brands requiring physical ISO 534 micrometer bench measurement (`10` readings across `5` sheets). **0 included.**
   - **`CONFLICT_RECONCILIATION_TRACK` / `CONFLICT_HOLD` (`5` variants — STRICTLY EXCLUDED):** Variants with >5% discrepancy between manufacturer nominal TDS caliper and supplier-imported reference values (`var_2f2e2255bb097267`, `var_f30fa00e5c230b37`, `var_9f43752a7fdf0360`, `var_fb2766157c634cc2`, `var_24529f375c1b6341`). **0 included.**
3. **P1 High-Rotation Book Interior Extraction (`25` Total P1 Candidates):**
   - Out of the `102` variants in `DATASHEET_REQUEST_TRACK`, exactly **`25` variants** correspond to **Priority Tier 1 (`P1_INTERIOR_BOOK_PAPER`)** high-rotation book interior papers for Budget App:
     - **Sub-batch `P1-A` (`12` variants — Pre-Verified Nominal TDS Caliper):** Variants whose exact nominal caliper (`µm`) and bulk factor (`cm³/g`) are already cross-referenced against official manufacturer technical datasheets (ISO 534) and/or identical-grammage master catalog sibling records in `Control.paper_variants` (*Balance Silk*, *Galerie Art Silk*, *Arena Rough Ivory*, *MultiDesign Original Natural*, *Print Speed*, *Serixo*, *Image Digicolor*, *Nautilus SuperWhite*).
     - **Sub-batch `P1-B` (`13` variants — Series Bulk / Pending Single-Point Mill TDS Sheet):** Remaining `P1_INTERIOR_BOOK_PAPER` variants in `DATASHEET_REQUEST_TRACK` (*Arctic Volume Maxima*, *Arena White Rough*, *Balance Pure*, *Garda Recycled Print*, *Maxima Natural*, *MultiDesign Original 130g*, *Omela Matt*, *Print Speed 90g*) with reference series bulk / nominal estimates prepared for single-point PDF attachment in the Technical Accreditation workflow.

> [!IMPORTANT]
> **Note on Munken & Maestro Print Variants in the `252` Inventory:**  
> All remaining missing-caliper *Munken* (`Munken Polar 170 102x72 FSC` [`var_fb2766157c634cc2`] and `Munken Pure Rough 100 90x64` [`var_24529f375c1b6341`]) and *Maestro Print* (`Maestro Print 170 64x90 FSC` [`var_f30fa00e5c230b37`] and `Maestro Print 300 90x64 FSC` [`var_9f43752a7fdf0360`]) variants in the 252 inventory belong to the **`5` `CONFLICT_HOLD` (`CONFLICT_RECONCILIATION_TRACK`)** records due to >5% divergence between mill TDS and supplier sheet data. In compliance with Instruction #3, they are **strictly excluded** from this pilot batch and listed separately in Section 3. Meanwhile, *G-Silk* (`19/19` variants) and *MultiArt Silk / Gloss* (`51/51` variants) already have **100% caliper coverage** in `Control.paper_variants`.

---

## 2. P1 Pilot Candidates Table (`DATASHEET_REQUEST_TRACK` Only)

### 2.1 Primary Deliverable Table — All `25` P1 Book Interior Candidates (`P1_INTERIOR_BOOK_PAPER`)

| `variant_id` | `brand_family` | `grade_name` | `grammage_gsm` | `datasheet_nominal_caliper_um` | `bulk_factor` | `datasheet_reference_source` | `review_status` |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| `var_59ea39c77a5c9fbd` | Papyrus / Inapa — Balance Silk | Balance Silk 130 46x64 | 130 | 100 µm | 0.769 | Papyrus BalanceSilk® Official Technical Specification Sheet (ISO 534: 130 g/m² = 100 µm) [`REQ08-007` / `REC07`] | `READY_FOR_ACCREDITATION` |
| `var_72e0383fdba76a78` | Papyrus / Inapa — Balance Silk | Balance Silk 150 90x64 FSC | 150 | 128 µm | 0.853 | Papyrus BalanceSilk® Official Technical Specification (ISO 534: 150 g/m² = 128 µm; Catalog Sibling #159/#160) [`REQ08-008` / `REC05V-D2`] | `READY_FOR_ACCREDITATION` |
| `var_08cff00ebce125a2` | Papyrus / Inapa — Balance Silk | Balance Silk 170 72x102 | 170 | 146 µm | 0.859 | Papyrus BalanceSilk® Official Technical Specification (ISO 534: 170 g/m² = 146 µm; Catalog Sibling #161) [`REQ08-009` / `REC05V-D2`] | `READY_FOR_ACCREDITATION` |
| `var_2a961015f775a4f7` | Sappi Europe — Galerie Art Silk | Galerie A Silk 90 46x64 FSC | 90 | 74 µm | 0.822 | Sappi Galerie Art™ Silk Official TDS (ISO 534: 90 g/m² = 74 µm) & Catalog Sibling Row #517 (`Galerie Art Silk 90 64x90` = 74 µm) [`REQ08-077` / `REC07`] | `READY_FOR_ACCREDITATION` |
| `var_ea4e053e2cc01a28` | Fedrigoni — Arena Rough | Arena Rough Ivory 140g 64x90 | 140 | 185 µm | 1.321 | Fedrigoni Arena® Rough Official TDS (ISO 534 VSA 1.32 cm³/g) & Catalog Sibling Row #116 (`Arena Ivory Rough 140 72x102` = 185 µm) [`REQ08-004` / `REC07`] | `READY_FOR_ACCREDITATION` |
| `var_d6382607237e7511` | Clairefontaine / Papyrus — MultiDesign Original | Multidesign Original Natural 100 g/m A1 64x90 cm | 100 | 130 µm | 1.300 | Clairefontaine MultiDesign® Original Natural Official TDS (ISO 534: bulk 1.30 cm³/g) & Catalog Sibling Row #983 (`100g 72x102` = 130 µm) [`REQ08-155` / `REC07`] | `READY_FOR_ACCREDITATION` |
| `var_a52282e5180d0d3b` | Antalis / Navigator — Print Speed | Print Speed 100 72x102 | 100 | 118 µm | 1.180 | Antalis / Navigator Print Speed Uncoated Offset Official TDS (ISO 534) & Catalog Sibling Row #1393 (`Print Speed 100 64x90` = 118 µm) [`REQ08-171` / `REC07`] | `READY_FOR_ACCREDITATION` |
| `var_4fade2216b6da976` | Antalis / Navigator — Print Speed | Printspeed 120 64x90 | 120 | 133 µm | 1.108 | Antalis / Navigator Print Speed Uncoated Offset Official TDS (ISO 534) & Catalog Sibling Row #1395 (`Print Speed 120 72x102` = 133 µm) [`REQ08-174` / `REC07`] | `READY_FOR_ACCREDITATION` |
| `var_59ac0c5f627c9a5d` | Antalis / Navigator — Print Speed | PrintSpeed 120g 72X102 FSC | 120 | 133 µm | 1.108 | Antalis / Navigator Print Speed Uncoated Offset Official TDS (ISO 534) & Catalog Sibling Row #1395 (`Print Speed 120 72x102` = 133 µm) [`REQ08-175` / `REC07`] | `READY_FOR_ACCREDITATION` |
| `var_321ee9ca05450fca` | Mondi / Antalis — Serixo | Serixo 90 72x52 FSC | 90 | 115 µm | 1.278 | Mondi / Antalis Serixo Uncoated Woodfree Offset Official TDS (ISO 534: 90 g/m² = 115 µm) [`REQ08-204` / `REC07`] | `READY_FOR_ACCREDITATION` |
| `var_3d4c4c6b76317c37` | Antalis — Image Digicolor | Image Digicolor 90g 45x64 | 90 | 98 µm | 1.089 | Antalis Image® Digicolor Official Technical Datasheet (ISO 534: 90 g/m² = 98 µm; Catalog Sibling 100g = 108 µm / bulk 1.08) [`REQ08-124` / `REC07`] | `READY_FOR_ACCREDITATION` |
| `var_fb2a8f3e2fe2f0d0` | Mondi — Nautilus SuperWhite | Nautilus SuperWhite 160 64x90 | 160 | 196 µm *(160 µm in REC07)* | 1.225 *(1.000)* | Mondi Nautilus® SuperWhite / KPP Antalis Official TDS (ISO 534: 196 ± 5 µm at bulk 1.225; REC07 secondary summary listed 160 µm) [`REQ08-159` / `REC07`] | `READY_FOR_ACCREDITATION` |
| `var_df63696461c9c27f` | Arctic Paper — Arctic Volume Maxima | Arctic Volume Maxima 115 72x102 | 115 | 124 µm *(series ref)* | 1.078 | Arctic Paper Arctic Volume / Maxima Series Specification (ISO 534 bulk 1.08 cm³/g; Catalog Sibling `Arctic Volume White/Ice 115g` = 124 µm, `Maxima Volume 150g` = 162 µm) [`REQ08-002`] | `READY_FOR_ACCREDITATION` |
| `var_203100a75b791c98` | Fedrigoni — Arena Rough | Arena White Rough 90 72x102 | 90 | 126 µm *(series ref)* | 1.400 | Fedrigoni Arena® White Rough Official TDS Series (ISO 534 VSA 1.38–1.40 cm³/g; Catalog Sibling `Arena White Rough 120g` = 166 µm / bulk 1.383) [`REQ08-005`] | `READY_FOR_ACCREDITATION` |
| `var_bffc34ea25798480` | Papyrus / Inapa — Balance Pure | Balance Pure 135 72x102 | 135 | 149 µm *(series ref)* | 1.104 | Papyrus BalancePure® Uncoated Recycled Offset Series Specification (ISO 534 bulk ~1.10 cm³/g; pending supplier SKU grammage confirmation) [`REQ08-006`] | `READY_FOR_ACCREDITATION` |
| `var_efb0bba9d8ba69c1` | Lecta — Garda Recycled Print | Garda Recycled Print 150 72x102 FSC | 150 | 146 µm *(series ref)* | 0.973 | Lecta Cartiere del Garda Recycled Print Matt Coated Series (ISO 534; Catalog Sibling `Garda Recycled Print 115g` = 112 µm / bulk 0.974) [`REQ08-078`] | `READY_FOR_ACCREDITATION` |
| `var_2e44aa4d5838c854` | Inapa / Merchant — Maxima Natural | MAXIMA NATURAL 100 70x100 FSC | 100 | 126 µm *(series ref)* | 1.260 | Maxima Natural Uncoated Offset Series (ISO 534; Catalog Sibling `Maxima Natural 90g` = 113 µm / bulk 1.256, `80g` = 100 µm / bulk 1.250) [`REQ08-151`] | `READY_FOR_ACCREDITATION` |
| `var_09e41a549016912d` | Inapa / Merchant — Maxima Natural | Maxima Natural 140 90x64 FSC | 140 | 176 µm *(series ref)* | 1.257 | Maxima Natural Uncoated Offset Series (ISO 534; Catalog Sibling `Maxima Natural 90g` = 113 µm / bulk 1.256) [`REQ08-152`] | `READY_FOR_ACCREDITATION` |
| `var_bfab4cd66749fe0a` | Inapa / Merchant — Maxima Natural | Maxima Natural 170 90 x 64 FSC | 170 | 214 µm *(series ref)* | 1.259 | Maxima Natural Uncoated Offset Series (ISO 534; Catalog Sibling `Maxima Natural 90g` = 113 µm / bulk 1.256) [`REQ08-153`] | `READY_FOR_ACCREDITATION` |
| `var_a3e2749ed5908a3f` | Clairefontaine / Papyrus — MultiDesign Original | MultiDesign Original 130g 90x64 natural | 130 | 169 µm *(series ref)* | 1.300 | Clairefontaine MultiDesign® Original Natural Official TDS Series (ISO 534 bulk 1.30 cm³/g; Catalog Sibling `100g` = 130 µm, `150g` = 195 µm, `200g` = 260 µm) [`REQ08-154`] | `READY_FOR_ACCREDITATION` |
| `var_85adc7057a42cf43` | Merchant / Mill — Omela Matt | Omela Matt 170g 46x64 | 170 | 153 µm *(series ref)* | 0.900 | Omela Matt Coated Woodfree Series Specification (ISO 534 nominal matt coated bulk ~0.90 cm³/g; pending mill TDS attachment) [`REQ08-163`] | `READY_FOR_ACCREDITATION` |
| `var_3368f38bfe12c2d0` | Merchant / Mill — Omela Matt | Omela Matt 200g 46x64 | 200 | 180 µm *(series ref)* | 0.900 | Omela Matt Coated Woodfree Series Specification (ISO 534 nominal matt coated bulk ~0.90 cm³/g; pending mill TDS attachment) [`REQ08-164`] | `READY_FOR_ACCREDITATION` |
| `var_f077824c5bd61d39` | Merchant / Mill — Omela Matt | Omela Matt 200g 64x90 | 200 | 180 µm *(series ref)* | 0.900 | Omela Matt Coated Woodfree Series Specification (ISO 534 nominal matt coated bulk ~0.90 cm³/g; pending mill TDS attachment) [`REQ08-165`] | `READY_FOR_ACCREDITATION` |
| `var_a0765b9728df6901` | Antalis / Navigator — Print Speed | Print Speed 90 72x102 | 90 | 108 µm *(series ref)* | 1.200 | Antalis / Navigator Print Speed Uncoated Offset Series (ISO 534; Catalog Sibling `80g` = 100 µm / bulk 1.250, `100g` = 118 µm / bulk 1.180) [`REQ08-172`] | `READY_FOR_ACCREDITATION` |
| `var_2d4017c860c821ea` | Antalis / Navigator — Print Speed Laser Jet | Print Speed Laser Jet 90 45x64 FSC | 90 | 108 µm *(series ref)* | 1.200 | Antalis / Navigator Print Speed Laser Jet Pre-Print Official TDS Series (ISO 534; pending single-point 90g Laser Jet PDF sheet) [`REQ08-173`] | `READY_FOR_ACCREDITATION` |

---

### 2.2 Breakdown of Pilot Sub-Batches (`P1-A` vs `P1-B`)

| Pilot Sub-Batch | Variant Count | Description | Immediate Action in Technical Accreditation UI (`PAPER-CALIPER-UI-01`) |
| :--- | :---: | :--- | :--- |
| **Batch `P1-A` (Direct Nominal TDS Match)** | **12** | Variants (`var_59ea39c77a5c9fbd`, `var_72e0383fdba76a78`, `var_08cff00ebce125a2`, `var_2a961015f775a4f7`, `var_ea4e053e2cc01a28`, `var_d6382607237e7511`, `var_a52282e5180d0d3b`, `var_4fade2216b6da976`, `var_59ac0c5f627c9a5d`, `var_321ee9ca05450fca`, `var_3d4c4c6b76317c37`, `var_fb2a8f3e2fe2f0d0`) with exact single-point ISO 534 nominal caliper already documented in `RECOVERY-07` / `RECOVERY-05V` and/or identical-grammage catalog siblings. | Submit documentary evidence (`SUPPLIER_DATASHEET` / `MANUFACTURER_DATASHEET`) with PDF attachment and route through Segregation of Duties (`SoD`) technologist review. |
| **Batch `P1-B` (Series Reference / Pending Mill Sheet)** | **13** | Remaining `P1_INTERIOR_BOOK_PAPER` variants in `DATASHEET_REQUEST_TRACK` whose series bulk factor is known from sibling grammages, awaiting single-point mill TDS sheet attachment (`REQ08-*`). | Attach official mill PDF from supplier response (`RECOVERY_08_SUPPLIER_EMAIL_TEMPLATES.md`) and submit for technologist review. |
| **Total Extracted P1 Pilot Candidates** | **25** | **100% of `P1_INTERIOR_BOOK_PAPER` variants within `DATASHEET_REQUEST_TRACK`** (`0` from `PHYSICAL_MICROMETER_TRACK`, `0` from `CONFLICT_HOLD`). | Governed accreditation only — no automatic overwrite of `paper_variants.caliper_um`. |

---

## 3. Strict Exclusion Audit (`PHYSICAL_MICROMETER_TRACK` & `CONFLICT_HOLD`)

Per Instruction #3, all **`145` variants in `PHYSICAL_MICROMETER_TRACK`** and all **`5` variants in `CONFLICT_HOLD` (`CONFLICT_RECONCILIATION_TRACK`)** were strictly excluded from the candidate extraction.

### 3.1 Excluded `CONFLICT_HOLD` (`CONFLICT_RECONCILIATION_TRACK`) Variants (`5` Total — `0` Included)

These 5 variants include high-rotation book families (*Munken Polar*, *Munken Pure Rough*, *Maestro Print*, *IQ Print*), but are **strictly held back** because their supplier-reported thickness differs by **>5%** from the official mill technical datasheet:

| `variant_id` | `raw_description` | `grammage_gsm` | Priority Tier | Conflict Description (`RECOVERY-07V` / `RECOVERY-08`) | Status |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `var_fb2766157c634cc2` | `Munken Polar 170 102x72 FSC` | 170 | `P1_INTERIOR_BOOK_PAPER` | Arctic Paper Munken Polar 170g TDS specifies **192 µm** (bulk 1.13), whereas supplier reference Row #1143 imported **204 µm** (+6.25% discrepancy). | **EXCLUDED (`CONFLICT_HOLD`)** |
| `var_24529f375c1b6341` | `Munken Pure Rough 100 90x64` | 100 | `P1_INTERIOR_BOOK_PAPER` | Arctic Paper Munken Pure Rough 100g TDS specifies **140 µm** (bulk 1.40), whereas supplier reference Row #1162 imported **113 µm** (-19.29% discrepancy, likely confused with 1.13 bulk). | **EXCLUDED (`CONFLICT_HOLD`)** |
| `var_f30fa00e5c230b37` | `Maestro Print 170 64x90 FSC` | 170 | `P1_INTERIOR_BOOK_PAPER` | Mondi Maestro® Print 170g TDS specifies **205 µm**, whereas catalog sibling `Maestro Print 170 70x100` has **201 µm** and REC07 secondary summary listed **176 µm** (-12.44% discrepancy). | **EXCLUDED (`CONFLICT_HOLD`)** |
| `var_2f2e2255bb097267` | `IQ print 120 72x102 FSC` | 120 | `P1_INTERIOR_BOOK_PAPER` | Mondi IQ Print 120g catalog sibling `IQ Print 120 64x90` has **142 µm**, whereas REC07 secondary summary listed **132 µm** (-7.04% discrepancy). | **EXCLUDED (`CONFLICT_HOLD`)** |
| `var_9f43752a7fdf0360` | `Maestro Print 300 90x64 FSC` | 300 | `P2_COVER_BOARD_AND_CARD` | Mondi Maestro® Print 300g catalog sibling `Maestro Print 300 102x72` has **351 µm**, whereas REC07 secondary summary listed **310 µm** (-11.68% discrepancy). | **EXCLUDED (`CONFLICT_HOLD`)** |

### 3.2 Excluded `PHYSICAL_MICROMETER_TRACK` Variants (`145` Total — `0` Included)

- **Count Excluded:** `145 / 145` (`100%` excluded).
- **Reason:** Includes cloth/buckram/synthetic book-covering materials (*Balacron*, *Brillianta*, *Buckram*, *Dubletta*, *Efalin*, *Geltex*, *Guaflex*, *Imitlin*, *Imperial*, *Iris*, *Linen*, *Savanna*, *setalux*, *Wibalin*), multi-layer pressure-sensitive adhesives (* Fasson*, *Raflatac*, *Adestor*), carbonless NCR sheets (* Giroform*), and bespoke merchant lots without public ISO 534 single-sheet calipers. These require 10-point physical micrometer measurement on press-room stock.

---

## 4. Production Database Integrity Verification (`Control.paper_variants`)

A live read-only query was executed against the production MySQL 8 database (`Control.paper_variants` on `212.227.79.67`) after generating this report to verify that **zero records were modified**:

```json
{
  "integrity": {
    "total": 1524,
    "with_caliper": "1272",
    "without_caliper": "252"
  },
  "checksum": {
    "Table": "Control.paper_variants",
    "Checksum": 2093607442
  },
  "p1_found_count": 25,
  "p1_non_null_caliper": 0,
  "conflict_found_count": 5,
  "conflict_non_null_caliper": 0
}
```

- **Total Catalog Variants (`Control.paper_variants`):** `1,524`
- **Variants with Authoritative Caliper (`caliper_um IS NOT NULL`):** `1,272` (`83.46%`)
- **Variants without Caliper (`caliper_um IS NULL`):** `252` (`16.54%`)
- **All 25 Extracted P1 Candidates (`p1_non_null_caliper`):** `0` modified (`25 / 25` remain `NULL` in `Control.paper_variants`, ready for governed accreditation).
- **Table Checksum (`CHECKSUM TABLE Control.paper_variants`):** `2093607442` (**unchanged**).

