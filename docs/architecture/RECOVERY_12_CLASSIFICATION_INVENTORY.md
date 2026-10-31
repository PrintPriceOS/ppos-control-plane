# RECOVERY-12 (Point 3) — Read-Only Classification Inventory & Accreditation Strategy (`337` Pending Variants)

- **Repository**: `PrintPriceOS/ppos-control-plane`
- **Database Target**: `Control.paper_variants`, `Control.paper_products`, `Control.paper_variant_classification_evidence` (`root@212.227.79.67`)
- **Execution Mode**: **STRICTLY READ-ONLY / AUDIT ONLY** (`0` mutations executed)
- **Audit Timestamp**: `2026-10-31T01:12:41Z`

---

## 1. Executive Summary & Production Database Integrity

This audit inspects the **`337` master catalog variants** with pending technical classification (`paper_type = 'OTHER'` / `'UNKNOWN'` at runtime) in production (`Control.paper_variants` joined with `Control.paper_products`), evaluates the state of their complementary attributes (`coating_status`, `finish`, `grain_direction`), audits the `paper_variant_classification_evidence` schema and `src/api/services/` layer, and defines the governed taxonomy and accreditation workflow.

### Live Production Invariants Verification (`Control.paper_variants`)

| Metric | Pre-Audit Baseline (Post `P1-A`) | Post-Audit Live Production | Delta | Status |
| :--- | :---: | :---: | :---: | :---: |
| **Total Variants (`COUNT(*)`)** | `1,524` | **`1,524`** | `0` | **PASS (100% Immutable)** |
| **With Authoritative Caliper (`caliper_um > 0`)** | `1,284` | **`1,284`** | `0` | **PASS (100% Immutable)** |
| **Without Caliper (`caliper_um IS NULL`)** | `240` | **`240`** | `0` | **PASS (100% Immutable)** |
| **MySQL Table Checksum (`CHECKSUM TABLE paper_variants`)** | `3572048628` | **`3572048628`** | `0` | **PASS (Exact Bitwise Match)** |
| **Existing Rows in `paper_variant_classification_evidence`** | `0` | **`0`** | `0` | **PASS (Clean Ledger)** |

> [!IMPORTANT]
> **Why Raw `paper_products.category = 'OTHER'` is `338` while Effective Pending Classifications is `337`**:
> In raw MySQL (`Control.paper_products.category`), **`338` variants** have `category = 'OTHER'`. However, variant **`var_85c142a50239e312`** (*Efalin FINE LINEN 130 (Light Blue) 120 102x70*, `product_id = prod_74bc2cb3bd5e8a40`) carries an authoritative 1:1 ODS recovery record in `paper_variants.metadata_json.ods_materials_recovery` (`ods_paper_type = 'Dizaina'`, `ods_coat = 'nekrītots'`, applied in `PAPER-MATERIALS-RECOVERY-03`). Consequently, `resolveVariantTechnicalAttributes()` in `src/api/services/paperMaterialsNormalizationService.js` resolves `var_85c142a50239e312` at runtime to `paperType = 'DESIGN'`, `coatingStatus = 'UNCOATED'`, `finish = 'UNCOATED'`, leaving exactly **`337` variants** in effective `OTHER` / `UNKNOWN` pending classification status.

---

## 2. Distribution Matrix & Breakdown of the `337` Pending Variants

### 2.1 Global Catalog Classification Distribution (`1,524` Total Variants)

| `paper_type` (`category`) | Raw DB Count (`paper_products.category`) | Raw DB Share | Runtime-Resolved Count (`resolveVariantTechnicalAttributes`) | Runtime Share | Notes |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **`COATED`** | `567` | `37.20%` | **`567`** | `37.20%` | Coated publication & art papers (Silk, Gloss, Matt) |
| **`OFFSET`** | `400` | `26.25%` | **`400`** | `26.25%` | Uncoated woodfree offset, preprint & book interior papers |
| **`OTHER` (Pending Classification)** | `338` | `22.18%` | **`337`** | `22.11%` | **Target scope of this audit (`337` unresolved variants)** |
| **`DESIGN`** | `110` | `7.22%` | **`111`** | `7.28%` | Includes `var_85c142a50239e312` resolved via `ods_materials_recovery` |
| **`CARTON`** | `109` | `7.15%` | **`109`** | `7.15%` | Folding boxboards (`GC1`/`GC2`/`GD2`), greyboards & cover boards |
| **`UNCOATED` / `DIGITAL` / `NULL`** | `0` | `0.00%` | **`0`** | `0.00%` | Not used as raw DB categories in `paper_products` |
| **Total** | **`1,524`** | **`100.00%`** | **`1,524`** | **`100.00%`** | `100%` accounted for |

---

### 2.2 State of Complementary Attributes Across the `337` Pending Variants

All `337` variants share a uniform raw database signature inherited from the initial catalog import, which is actively sanitized at runtime by `resolveVariantTechnicalAttributes()` (`src/api/services/paperMaterialsNormalizationService.js#L548-L574`):

| Technical Attribute | Physical DB Storage Column | Raw MySQL Value Across the `337` Variants | Runtime Resolved Value (`resolveVariantTechnicalAttributes`) | Technical Explanation |
| :--- | :--- | :--- | :--- | :--- |
| **`paper_type`** | `paper_products.category` | `'OTHER'` (`337 / 337` = `100%`) | **`'OTHER'`** (`337 / 337` = `100%`) | Legacy importer fallback when supplier category was unmapped or `Group 1`. |
| **`coating_status`** | `paper_variants.metadata_json` *(no dedicated column)* | `NULL` (`337 / 337` = `100%`) | **`'UNKNOWN'`** (`337 / 337` = `100%`) | `coatingConfidence` resolves to `'UNVERIFIED_DEFAULT'`. |
| **`finish`** | `paper_variants.finish` | `'UNCOATED'` (`337 / 337` = `100%`) | **`'UNKNOWN'`** (`337 / 337` = `100%`) | Legacy importer wrote `'UNCOATED'` by default; normalization guard `isSyntheticOtherUncoated` strips this false default to `'UNKNOWN'`. |
| **`grain_direction`** | `paper_variants.grain_direction` | `'UNKNOWN'` (`337 / 337` = `100%`) | **`'UNKNOWN'`** (`337 / 337` = `100%`) | Sheet dimensions (`width_cm` x `height_cm`) exist, but grain axis is unverified in DB. |

#### Caliper (`caliper_um`) Coverage Across the `337` Pending Variants (Live Post-`P1-A` State)

| Caliper Status in `Control.paper_variants` | Variant Count | Percentage of `337` | Notes |
| :--- | :---: | :---: | :--- |
| **With Authoritative Caliper (`caliper_um > 0`)** | **`190`** | **`56.38%`** | Includes `3` variants accredited in `RECOVERY-12 P1-A` (`var_ea4e053e2cc01a28` *Arena Rough Ivory 140g*, `var_4fade2216b6da976` *Printspeed 120g*, `var_321ee9ca05450fca` *Serixo 90g*). |
| **Without Caliper (`caliper_um IS NULL`)** | **`147`** | **`43.62%`** | Concentrated in case-binding coverings (*Efalin*, *Geltex*, *Wibalin*, *Surbalin*), *Sirio Color*, *Reacto* carbonless, and *Keaykolour*. |
| **Total** | **`337`** | **`100.00%`** | |

---

### 2.3 Breakdown by Functional Group (`G1`–`G6`) and Proposed Target Category

Cross-referencing the live `337` variants with `docs/architecture/RECOVERY_09_PENDING_CLASSIFICATIONS_337.csv` yields the following distribution across the 6 functional buckets:

| Functional Group | Total Variants | Share (`%`) | With Caliper (`190`) | Without Caliper (`147`) | Proposed Primary `paper_type` | Representative Commercial Lines |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **`G2_CREATIVE_DESIGN_AND_TINTED_UNCOATED`** | **`113`** | `33.53%` | `78` | `35` | **`DESIGN`** (`113`) | *Olin Colours* (`54`), *Sirio Color* (`11`), *Curious Metallics* (`9`), *Colorit* (`6`), *Burano* (`6`), *Curious Translucents* (`5`), *Rainbow* (`4`), *Rives* (`4`), *Pop'Set* (`4`), *Constellation Snow* (`2`), *Arena* (`2`). |
| **`G3_UNCOATED_OFFSET_AND_BOOK_PAPERS_IN_RAW_OTHER`** | **`74`** | `21.96%` | `66` | `8` | **`OFFSET`** (`64`) / **`CARTON`** (`10` *Luxline*) | *IQ Print/Selection* (`18`), *Serixo* (`13`), *Luxline* (`10` — *see Audit Note 1*), *Munken* (`7`), *Maestro Print* (`5`), *PERGRAPHICA* (`4`), *MasterBook Extra* (`4`), *Maxima* (`3`), *Amber Preprint* (`2`), *Nautilus* (`2`). |
| **`G1_CASE_BINDING_COVERING_MATERIALS`** | **`62`** | `18.40%` | `0` | `62` | **`DESIGN`** (`62`) | Hardcover bookbinding coverings: *Efalin* (`26`), *Geltex* (`18`), *Wibalin* (`13`), *Surbalin* (`5`). |
| **`G6_SPECIALTY_SYNTHETIC_CARBONLESS_ADHESIVE`** | **`49`** | `14.54%` | `15` | `34` | **`OTHER`** (`29`) / **`DESIGN`** (`19`) / **`OFFSET`** (`1`) | True specialty: *Reacto* NCR (`11`), *Syn-Coat* (`4`), *Priplak* (`3`), *Sticotac* (`3`), *Polylith* (`2`), *Pretex* (`2`). Also holds `20` creative/offset variants misbucketed by ODS `Group 1` (*see Audit Note 2*). |
| **`G4_PACKAGING_BOARDS_AND_KRAFTLINER`** | **`27`** | `8.01%` | `20` | `7` | **`CARTON`** (`27`) | *Ensocoat 1S/2S* (`9`), *KraftPak* (`4`), *CrownBoard Craft* (`2`), *Diva Art Duo* (`2`), *Artboard* (`2`), *Metsa Board* (`2`), *Splendorlux* (`2`), *Carta Solida* (`1`). |
| **`G5_COATED_PUBLICATION_PAPERS_IN_RAW_OTHER`** | **`12`** | `3.56%` | `11` | `1` | **`COATED`** (`12`) | *Arctic Volume Ice/White/Maxima* (`4`), *GardaMatt Art / Garda Recycled Print* (`4`), *Galerie Fine Gloss* (`3`), *Condat Matt* (`1`). |
| **Total** | **`337`** | **`100.00%`** | **`190`** | **`147`** | **`337`** | |

> [!WARNING]
> **Two Taxonomy Corrections Identified Against the Automated `RECOVERY-09` CSV Heuristic**:
> 1. **Audit Note 1 (`Luxline` in `G3` -> `CARTON`)**: The `10` *Luxline* variants (`1010 gsm` to `2170 gsm`, `1600 µm` to `3500 µm`) were grouped under `G3` (`OFFSET`) in `RECOVERY_09_PENDING_CLASSIFICATIONS_337.csv` because their product name lacked a board keyword. Physically, *Luxline* is a heavy laminated bookbinding greyboard (`1.6 mm`–`3.5 mm`) and must be accredited as **`CARTON`** (`finish = 'UNCOATED_BOARD'`, `coating_status = 'UNCOATED'`).
> 2. **Audit Note 2 (`20` Creative/Offset Variants in `G6` -> `DESIGN` / `OFFSET`)**: In `RECOVERY_09`, `20` fine paper variants were routed to `G6_SPECIALTY_SYNTHETIC_CARBONLESS_ADHESIVE` (`proposed_target_category = 'OTHER'`) solely because their raw ODS row had `PAPER TYPE = 'Group 1'`. Physical inspection of their commercial families confirms:
>    - **`19` variants belong to `DESIGN` (`G2`)**: *Keaykolour* (`10`), *Conqueror Laid* (`6`), *Fedrigoni Sirio Ultra Black* (`1`), *Fedrigoni Constellation Jade* (`1`), and *G.F. Smith Twist Red* (`1`).
>    - **`1` variant belongs to `OFFSET` / `DESIGN` (`G3`/`G2`)**: *Fedrigoni ArcoPrint Milk* (`1`).
>    - The remaining **`29` variants in `G6`** are genuine specialty substrates (*Reacto* carbonless NCR [`11`], *Syn-Coat* [`4`], *Priplak* polypropylene [`3`], *Sticotac* self-adhesive [`3`], *Polylith* synthetic [`2`], *Pretex* latex-impregnated [`2`], *Yupo/Teslin/Metallized* [`4`]) that legitimately remain in `OTHER`.

#### Summary by Corrected Target `paper_type` (`337` Variants)

| Target `paper_type` (`paper_products.category`) | Automated CSV Proposal (`RECOVERY-09`) | Corrected Technical Target (Post-Audit) | Net Adjustment |
| :--- | :---: | :---: | :---: |
| **`DESIGN`** | `175` (`G1: 62` + `G2: 113`) | **`194`** (`+19` from `G6`: *Keaykolour*, *Conqueror*, *Sirio*, *Constellation*, *Twist*) | `+19` |
| **`OFFSET`** | `74` (`G3: 74`) | **`65`** (`-10` *Luxline* to `CARTON`, `+1` *ArcoPrint Milk* from `G6`) | `-9` |
| **`CARTON`** | `27` (`G4: 27`) | **`37`** (`+10` *Luxline* heavy greyboards `1010–2170 gsm` from `G3`) | `+10` |
| **`OTHER` (True Specialty: NCR, Synthetic, Adhesive)** | `49` (`G6: 49`) | **`29`** (`-20` fine design/offset papers moved to `DESIGN`/`OFFSET`) | `-20` |
| **`COATED`** | `12` (`G5: 12`) | **`12`** (`G5: 12` *Arctic Volume*, *Garda*, *Galerie Fine*, *Condat*) | `0` |
| **Total** | **`337`** | **`337`** | **`0`** |

---

### 2.4 Top 30 Commercial Families / Brands Affected (`65` Total Families Across `337` Variants)

| Rank | Brand / Mill (`paper_products.brand`) | Commercial Family | Total Variants | With Caliper | Without Caliper | GSM Range (`g/m²`) | Functional Group | Corrected Target `paper_type` | Target `coating_status` | Target `finish` |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | **Antalis / Arjowiggins** | **Olin** (*Olin Colours*) | **`54`** | `54` | `0` | `120–350` | `G2` | `DESIGN` | `UNCOATED` | `ROUGH` / `SMOOTH` |
| 2 | **Gmund / Zanders** | **Efalin** (*Fine Linen, New Linen, Laid, Wove*) | **`26`** | `0` | `26` | `115–120` | `G1` | `DESIGN` | `UNCOATED` | `EMBOSSED_LINEN` / `LAID` |
| 3 | **Guarro Casas** | **Geltex** (*111–258*) | **`18`** | `0` | `18` | `115–130` | `G1` | `DESIGN` | `UNCOATED` | `ACRYLIC_EMBOSSED` |
| 4 | **Mondi** | **IQ** (*IQ Print, IQ Selection*) | **`18`** | `18` | `0` | `70–190` | `G3` | `OFFSET` | `UNCOATED` | `UNCOATED` |
| 5 | **Winter & Company** | **Wibalin** (*Natural, Buckram, Fine Linen*) | **`13`** | `0` | `13` | `120–125` | `G1` | `DESIGN` | `UNCOATED` | `EMBOSSED_BUCKRAM` / `LINEN` |
| 6 | **Mondi / Antalis** | **Serixo** | **`13`** | `13` | `0` | `70–250` | `G3` | `OFFSET` | `UNCOATED` | `UNCOATED` |
| 7 | **Fedrigoni** | **Sirio** (*Sirio Color, Sirio Ultra Black*) | **`12`** | `0` | `12` | `115–370` | `G2` / `G6` | `DESIGN` | `UNCOATED` | `SMOOTH` / `ROUGH` |
| 8 | **Koehler Paper** | **Reacto** (*CFB, CF, CB Carbonless*) | **`11`** | `0` | `11` | `53–173` | `G6` | `OTHER` | `SPECIALTY` | `CARBONLESS_NCR` |
| 9 | **Generic / Mill Board** | **Luxline** (*Laminated Greyboard*) | **`10`** | `10` | `0` | `1010–2170` | `G3` -> `G4` | `CARTON` | `UNCOATED` | `UNCOATED_BOARD` |
| 10 | **Arjowiggins** | **Keaykolour** (*Original*) | **`10`** | `1` | `9` | `120–300` | `G6` -> `G2` | `DESIGN` | `UNCOATED` | `NATURAL_TEXTURED` |
| 11 | **Stora Enso** | **Ensocoat** (*Ensocoat 1S, 2S*) | **`9`** | `9` | `0` | `190–380` | `G4` | `CARTON` | `ONE_SIDE_COATED` / `COATED` | `GLOSS` / `SILK` |
| 12 | **Arjowiggins** | **Curious Metallics** | **`9`** | `9` | `0` | `120–300` | `G2` | `DESIGN` | `SPECIALTY` | `METALLIC` |
| 13 | **Arjowiggins** | **Conqueror** (*Conqueror Laid*) | **`7`** | `0` | `7` | `100–300` | `G2` / `G6` | `DESIGN` | `UNCOATED` | `LAID` |
| 14 | **Arctic Paper** | **Munken** (*Polar, Pure Rough, Kristall, Print*) | **`7`** | `6` | `1` | `80–300` | `G3` | `OFFSET` | `UNCOATED` | `ROUGH` / `SMOOTH` |
| 15 | **Clairefontaine** | **Colorit** | **`6`** | `0` | `6` | `80–250` | `G2` | `DESIGN` | `UNCOATED` | `UNCOATED` |
| 16 | **Favini** | **Burano** | **`6`** | `6` | `0` | `90–320` | `G2` | `DESIGN` | `UNCOATED` | `SMOOTH` |
| 17 | **Peyer Graphic** | **Surbalin** (*Glatt, Linea*) | **`5`** | `0` | `5` | `115` | `G1` | `DESIGN` | `UNCOATED` | `SMOOTH` / `EMBOSSED` |
| 18 | **Mondi** | **Maestro** (*Maestro Print*) | **`5`** | `3` | `2` | `70–100` | `G3` | `OFFSET` | `UNCOATED` | `UNCOATED` |
| 19 | **Arjowiggins** | **Curious Translucents** | **`5`** | `5` | `0` | `100–230` | `G2` | `DESIGN` | `SPECIALTY` | `TRANSLUCENT` |
| 20 | **Mondi** | **PERGRAPHICA** (*Infinite Black, Classic Rough*) | **`4`** | `4` | `0` | `120–350` | `G3` | `OFFSET` | `UNCOATED` | `ROUGH` |
| 21 | **Papyrus** | **Rainbow** | **`4`** | `2` | `2` | `80–230` | `G2` | `DESIGN` | `UNCOATED` | `UNCOATED` |
| 22 | **UPM / Mill** | **MasterBook Extra** | **`4`** | `4` | `0` | `55–70` | `G3` | `OFFSET` | `UNCOATED` | `MECHANICAL_BOOK` |
| 23 | **Synthetic Mill** | **Syn-Coat** | **`4`** | `4` | `0` | `140–350` | `G6` | `OTHER` | `SYNTHETIC` | `SYNTHETIC_FILM` |
| 24 | **Arjowiggins** | **Rives** (*Tradition, Basane, Linear*) | **`4`** | `1` | `3` | `120–250` | `G2` | `DESIGN` | `UNCOATED` | `FELT_MARKED` |
| 25 | **WestRock / KapStone** | **KraftPak** | **`4`** | `3` | `1` | `215–356` | `G4` | `CARTON` | `UNCOATED` | `KRAFT_BOARD` |
| 26 | **Lecta** | **Garda** (*GardaMatt Art, Garda Recycled*) | **`4`** | `3` | `1` | `90–130` | `G5` | `COATED` | `COATED` | `MATT` |
| 27 | **Arjowiggins** | **Pop'Set** | **`4`** | `0` | `4` | `80–240` | `G2` | `DESIGN` | `UNCOATED` | `SMOOTH` |
| 28 | **Arctic Paper** | **Arctic Volume** (*Ice, White, Maxima*) | **`4`** | `3` | `1` | `90–250` | `G5` | `COATED` | `COATED` | `MATT` |
| 29 | **Sappi Europe** | **Galerie** (*Galerie Fine Gloss*) | **`3`** | `3` | `0` | `70–80` | `G5` | `COATED` | `COATED` | `GLOSS` |
| 30 | **Mill** | **Maxima** (*Maxima Natural, Maxima Volume*) | **`3`** | `1` | `2` | `70–100` | `G3` | `OFFSET` | `UNCOATED` | `UNCOATED` |

*(The remaining `35` commercial families carry `1` to `3` variants each, totaling `41` variants across `Priplak` [`3`], `Sticotac` [`3`], `Fedrigoni Constellation/Splendorlux` [`4`], `Amber Preprint` [`2`], `Nautilus` [`2`], `CrownBoard Craft` [`2`], `Diva Art Duo` [`2`], `Artboard` [`2`], `Metsa Board` [`2`], `Polylith` [`2`], `Pretex` [`2`], `Arena` [`2`], and `13` single-variant families).*

---

## 3. Data Model, Schema & Service Audit

### 3.1 Verification of `Control.paper_variant_classification_evidence` (Live MySQL 8 DDL)

The table `paper_variant_classification_evidence` was created in `migrations/174_phase197c_paper_evidence_and_technical_accreditation.sql` and verified live in `Control`:

```sql
CREATE TABLE `paper_variant_classification_evidence` (
  `classification_evidence_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `supplier_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `variant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `functional_group` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'G6_SPECIALTY_SYNTHETIC_CARBONLESS_ADHESIVE',
  `previous_category` enum('CARTON','OFFSET','COATED','UNCOATED','DESIGN','DIGITAL','OTHER') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OTHER',
  `proposed_category` enum('CARTON','OFFSET','COATED','UNCOATED','DESIGN','DIGITAL','OTHER') COLLATE utf8mb4_unicode_ci NOT NULL,
  `previous_finish` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `proposed_finish` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `proposed_coating_status` enum('COATED','UNCOATED','SYNTHETIC','SPECIALTY','UNKNOWN') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'UNKNOWN',
  `evidence_source_type` enum('MILL_DATASHEET','SUPPLIER_CATALOG_SPEC','ODS_EXPLICIT_HEADER') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MILL_DATASHEET',
  `document_title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `document_storage_uri` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `document_sha256` char(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `review_status` enum('DRAFT','PENDING_TECH_REVIEW','APPROVED','REJECTED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING_TECH_REVIEW',
  `applied_to_catalog_product` tinyint(1) NOT NULL DEFAULT '0',
  `idempotency_key` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `submitted_by` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `submitted_by_role` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `submitted_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `approved_by_technologist` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approved_by_role` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `decision_reason` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`classification_evidence_id`),
  UNIQUE KEY `uk_pvcle_tenant_idempotency` (`tenant_id`,`idempotency_key`),
  KEY `idx_pvcle_tenant_variant` (`tenant_id`,`variant_id`,`review_status`),
  KEY `idx_pvcle_tenant_product` (`tenant_id`,`product_id`,`review_status`),
  CONSTRAINT `fk_pvcle_product` FOREIGN KEY (`product_id`) REFERENCES `paper_products` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_pvcle_variant` FOREIGN KEY (`variant_id`) REFERENCES `paper_variants` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

### 3.2 Audit of Current Services & Controllers (`src/api/services/` & `src/api/routes/`)

1. **`src/api/services/paperMaterialsNormalizationService.js`**:
   - Defines canonical taxonomy constants:
     - `CANONICAL_PAPER_TYPES = ['COATED', 'OFFSET', 'DESIGN', 'CARTON', 'OTHER', 'UNKNOWN']`
     - `CANONICAL_COATING_STATUSES = ['COATED', 'UNCOATED', 'ONE_SIDE_COATED', 'UNKNOWN']`
     - `CANONICAL_GRAIN_DIRECTIONS = ['LONG_GRAIN', 'SHORT_GRAIN', 'UNKNOWN']`
   - `resolveVariantTechnicalAttributes(row)` inspects `row.raw_category` (`paper_products.category`), `row.raw_finish` (`paper_variants.finish`), `row.grain_direction` (`paper_variants.grain_direction`), and `row.variant_metadata_json` (`ods_materials_recovery`).
   - Currently, if `rawCategory === 'OTHER'` and no `ods_materials_recovery` exists, it returns `paperType = 'OTHER'`, `coatingStatus = 'UNKNOWN'`, `finish = 'UNKNOWN'`, `grainDirection = 'UNKNOWN'`.

2. **`src/api/services/paperEvidenceService.js`**:
   - **Read Support Exists**:
     - `getVariantEvidences(tenantId, variantId)` (`L881-L885`) queries `SELECT * FROM paper_variant_classification_evidence WHERE tenant_id = ? AND variant_id = ? ORDER BY created_at DESC` and returns `classificationEvidences`.
     - `listMissingCaliperMaterials(tenantId, filters)` (`L905-L980`) computes and returns `summary.pendingClassificationsEffectiveCount` (`337`) and `summary.pendingClassificationsRawDbOtherCount` (`338`).
   - **Write / Accreditation Support Does NOT Exist Yet**:
     - All write methods in `paperEvidenceService.js` (`registerMicrometerMeasurement`, `registerDocumentaryEvidence`, `reviewEvidence`, `requestEvidencePromotion`, `authorizeEvidencePromotion`, `revokeAndRevertPromotion`) operate exclusively on `paper_variant_technical_evidence` and `paper_variant_micrometer_readings` for **`caliper_um`**.
     - There is currently **no service method or API endpoint** in `src/api/routes/paperSuppliersRoutes.js` or `src/api/routes/materialsAdmin.js` to submit, review, or promote a `paper_variant_classification_evidence` record.

---

### 3.3 Four Architectural & Schema Findings to Address Before Executing Classification Promotions

1. **Finding 1 — `product_id` Shared Multi-Variant Impact (`paper_products.category` vs `paper_variants`)**:
   - In `Control`, `category` (`paper_type`) is stored on `paper_products.category`, while `finish`, `grain_direction`, and `metadata_json` are stored on `paper_variants`.
   - Across the `337` variants, `paper_products` maps `1:1` per commercial grade+grammage in most cases, **discovery during promotion must verify whether any `product_id` has sibling variants** and update `paper_variants.metadata_json.classification_accreditation` alongside `paper_products.category` so `resolveVariantTechnicalAttributes()` resolves deterministically at both product and variant granularity.
2. **Finding 2 — Missing `grain_direction` Columns in `paper_variant_classification_evidence`**:
   - `paper_variant_classification_evidence` tracks `previous_category`/`proposed_category`, `previous_finish`/`proposed_finish`, and `proposed_coating_status`, but lacks `previous_grain_direction` and `proposed_grain_direction` (`ENUM('LONG_GRAIN','SHORT_GRAIN','UNKNOWN')`), as well as `previous_coating_status`.
3. **Finding 3 — `ONE_SIDE_COATED` Enum Alignment**:
   - `paperMaterialsNormalizationService.js` uses `'ONE_SIDE_COATED'` in `CANONICAL_COATING_STATUSES` (needed for `G4` packaging boards like *Ensocoat 1S* and *Splendorlux*), whereas `paper_variant_classification_evidence.proposed_coating_status` has `ENUM('COATED','UNCOATED','SYNTHETIC','SPECIALTY','UNKNOWN')`. Adding `'ONE_SIDE_COATED'` to the enum ensures 100% alignment between the evidence ledger and the normalization engine.
4. **Finding 4 — Physical Sample Book / Inspection Source Type**:
   - `paper_variant_classification_evidence.evidence_source_type` currently allows `ENUM('MILL_DATASHEET','SUPPLIER_CATALOG_SPEC','ODS_EXPLICIT_HEADER')`. Extending it with `'PHYSICAL_SAMPLE_INSPECTION'` supports accredited physical inspection of sample books (e.g., *Efalin*, *Geltex*, *Wibalin* swatch books) and grain direction verification.

---

## 4. Proposed Standard Taxonomy & Governed Accreditation Strategy

### 4.1 Allowed Standard Taxonomy for the 4 Classification Fields

| Field | Target Storage | Allowed Standard Values (Canonical Taxonomy) | Governance Rules |
| :--- | :--- | :--- | :--- |
| **`paper_type`** | `paper_products.category` + `paper_variants.metadata_json` | `COATED`, `OFFSET`, `DESIGN`, `CARTON`, `DIGITAL`, `OTHER` | `'UNCOATED'` is prohibited as a `paper_type` (use `OFFSET` for woodfree uncoated offset/book papers and `DESIGN` for tinted/textured/covering design papers; reserve `OTHER` strictly for `29` specialty/NCR/synthetic/adhesive items). |
| **`coating_status`** | `paper_variants.metadata_json.classification_accreditation.coating_status` | `COATED`, `UNCOATED`, `ONE_SIDE_COATED`, `SYNTHETIC`, `SPECIALTY`, `UNKNOWN` | Must be explicitly backed by evidence (`coatingConfidence = 'ACCREDITED_EVIDENCE'`). Never inferred synthetically when `paper_type = 'OTHER'`. |
| **`finish`** | `paper_variants.finish` | **Standard**: `GLOSS`, `SILK`, `MATT`, `UNCOATED`, `SMOOTH`, `ROUGH`<br>**Design/Covering**: `LAID`, `FELT_MARKED`, `EMBOSSED_LINEN`, `EMBOSSED_BUCKRAM`, `ACRYLIC_EMBOSSED`, `METALLIC`, `TRANSLUCENT`, `NATURAL_TEXTURED`<br>**Board/Specialty**: `UNCOATED_BOARD`, `KRAFT_BOARD`, `CAST_COATED`, `CARBONLESS_NCR`, `SYNTHETIC_FILM`, `SELF_ADHESIVE`, `UNKNOWN` | Replaces the legacy synthetic `'UNCOATED'` importer default on the `337` variants with the verified physical surface finish. |
| **`grain_direction`** | `paper_variants.grain_direction` | `LONG_GRAIN` (`LG` / `BB`), `SHORT_GRAIN` (`SG` / `SB`), `UNKNOWN` | Determined only from explicit supplier SKU grain notation (`70x100` vs `100x70` with underlined grain dimension in supplier catalog/TDS) or physical fold/tear test. If not explicitly stated in the evidence source, must remain `'UNKNOWN'` (never guessed from `width_cm < height_cm`). |

---

### 4.2 Admitted Evidence Sources & Prioritized Execution Batches

#### Admitted Evidence Sources (`evidence_source_type`)
1. **`MILL_DATASHEET` (Tier 1 — Primary Authoritative)**:
   - Official Manufacturer Technical Data Sheet (TDS) confirming substrate construction (e.g., woodfree uncoated, C2S art paper, SBB `GC1`/`GC2` folding boxboard, acrylic-coated bookbinding covering, carbonless `CFB`/`CF`/`CB`).
2. **`SUPPLIER_CATALOG_SPEC` (Tier 2 — Commercial Merchant Specification)**:
   - Official merchant catalog specification (Antalis, Papyrus, Igepa, Fedrigoni, Winter & Company, Guarro Casas) explicitly stating product category, coating, finish texture, and grain direction per sheet format.
3. **`ODS_EXPLICIT_HEADER` (Tier 2 — Audited Master Spreadsheet Header)**:
   - Explicit commercial family header in `Materials.ods` where sibling rows in the same family carry verified classification (applicable to `G3` *IQ Print*, *Serixo*, *Munken*, *Maestro Print*).
4. **`PHYSICAL_SAMPLE_INSPECTION` (Tier 3 — Swatch Book / Lab Verification)**:
   - Physical inspection of mill swatch books or plant stock by an accredited technologist (specifically suited for verifying surface embossing on `G1` coverings and `grain_direction`).

#### Recommended Phased Accreditation Batches for the `337` Variants

| Batch | Target Scope | Variant Count | Caliper Status | Target Classification Outcome | Priority |
| :--- | :--- | :---: | :--- | :--- | :---: |
| **Batch C1 (Book Interior & Coated Publication)** | `G3` Uncoated Offset/Book (`64` variants excl. *Luxline*) + `G5` Coated Publication (`12` variants) + `1` *ArcoPrint Milk* (`G6`) | **`77`** | `68` with caliper / `9` without | `65` -> `OFFSET` (`UNCOATED`), `12` -> `COATED` (`MATT`/`GLOSS`) | **P1 (Immediate — Directly feeds Budget App interior/cover selectors)** |
| **Batch C2 (Packaging Boards & Bookbinding Greyboards)** | `G4` Packaging Boards (`27` variants) + `10` *Luxline* Heavy Greyboards (`1010–2170 gsm` from `G3`) | **`37`** | `30` with caliper / `7` without | `37` -> `CARTON` (`ONE_SIDE_COATED`, `COATED`, `UNCOATED_BOARD`, `KRAFT_BOARD`) | **P1 (Immediate — Covers packaging & hardcover greyboard `1.6–3.5 mm`)** |
| **Batch C3 (Hardcover Case-Binding Coverings)** | `G1` Case-Binding Materials (*Efalin* `26`, *Geltex* `18`, *Wibalin* `13`, *Surbalin* `5`) | **`62`** | `0` with caliper / `62` without | `62` -> `DESIGN` (`UNCOATED`, `EMBOSSED_LINEN` / `BUCKRAM` / `ACRYLIC_EMBOSSED`) | **P2 (Unblocks hardcover covering selection in Control Plane)** |
| **Batch C4 (Creative & Tinted Design Papers)** | `G2` Creative Design (`113` variants) + `19` Fine Design Papers from `G6` (*Keaykolour* `10`, *Conqueror* `6`, *Sirio* `1`, *Constellation* `1`, *Twist* `1`) | **`132`** | `79` with caliper / `53` without | `132` -> `DESIGN` (`UNCOATED` / `SPECIALTY` metallic & translucent) | **P2 (Completes creative & cover design catalog)** |
| **Batch C5 (True Specialty, NCR & Synthetic)** | `G6` True Specialty (*Reacto* NCR `11`, *Syn-Coat* `4`, *Priplak* `3`, *Sticotac* `3`, *Polylith* `2`, *Pretex* `2`, *Other* `4`) | **`29`** | `13` with caliper / `16` without | `29` -> Accredited `OTHER` (`coating_status = 'SPECIALTY'` / `'SYNTHETIC'`, explicit finish) | **P3 (Explicitly accredited specialty substrates)** |
| **Total** | **All `337` Pending Classification Variants** | **`337`** | **`190` with / `147` without** | **`194` `DESIGN`, `65` `OFFSET`, `37` `CARTON`, `29` `OTHER`, `12` `COATED`** | **100% Coverage** |

