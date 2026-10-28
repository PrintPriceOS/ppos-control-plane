# PAPER-MATERIALS-RECOVERY-03 — Source Technical Audit (`Paper data base.ods.zip`)

- **Mission**: `PAPER-MATERIALS-RECOVERY-03`
- **Repository**: `PrintPriceOS/ppos-control-plane` & `PrintPriceOS/PrintPricePro_BookPrice`
- **Primary Source File**: `Paper data base.ods.zip` (`SHA-256: 7ffb63eb2705fa0c6faa459001ddd3db0702aa25d0bca52fa58e1a13899d4c9a`)
- **Batch Import Files**: `paper_supplier_schema_compatible_batches.zip` (`catalog_compatible_all.csv` [`1,544` rows] + `references_need_review.csv` [`29` rows] = `1,573` rows)
- **Complementary Reference**: Livonia Technical Reference Library (`paper_technical_caliper_reference`, `375` rows across `60` blocks)
- **Production Catalog Baseline**: `Control.paper_products` (`1,522` rows) & `Control.paper_variants` (`1,524` rows, including `1,171` variants with recovered calipers after `PAPER-CALIPER-RECOVERY-02`)

---

## 1. Complete Column Inventory of `Paper data base.ods.zip`

The original supplier spreadsheet (`Sheet1`, `1,573` data rows starting at XML row `5`) contains `18` columns (`0`–`17`):

| Col Index | Header in ODS | Non-Empty Rows | Empty Rows | Distinct Values | Description & Role in Recovery |
| ---: | --- | ---: | ---: | ---: | --- |
| `0` | `CODE` | `1,354` | `219` | `1,341` | Supplier / internal article code (`original_code`). Stripped from `catalog_compatible_all.csv`. |
| `1` | `QR` | `0` | `1,573` | `0` | Empty across all rows. |
| `2` | `NAME` | `1,573` | `0` | `1,554` | Commercial product description (often includes brand, gsm, dimensions, finish/shade, FSC). |
| `3` | `PRICE` | `1,571` | `2` | `677` | Supplier reference price (`14` rows have `0`). Strictly excluded from technical catalog updates. |
| `4` | `MIKRONS` | `1,540` | `33` | `223` | Physical caliper in µm (`336` rows have `0`, `1,204` rows have `> 0`). Recovered in `RECOVERY-02`. |
| `5` | `THICKNESS (mm)` | `1,573` | `0` | `227` | Physical thickness in mm (`369` rows have `0`, `1,204` rows have `> 0`). Recovered in `RECOVERY-02`. |
| `6` | `FORMAT` | `1,196` | `377` | `86` | Sheet format string (e.g., `B1 70 x 100`, `A2 460 x 640`). |
| `7` | `GRAMS` | `1,573` | `0` | `69` | Basis weight in $\text{g/m}^2$ (`gsm`). |
| `8` | *(Unnamed Col 8)* | `8` | `1,565` | `6` | Auxiliary notes on 8 rows. |
| `9` | `COAT` | `1,159` | `414` | `43` | **Primary Coating & Surface Finish column** (Latvian/English). Stripped from `catalog_compatible_all.csv`. |
| `10` | `Min. QUANTITY` | `1,490` | `83` | `15` | Minimum order quantity note. |
| `11` | `STEPS/UNITS` | `383` | `1,190` | `12` | Order multiple / pack step note. |
| `12` | `SORTIMET` | `1,154` | `419` | `39` | Assortment / stock availability classification. Stripped from `catalog_compatible_all.csv`. |
| `13` | `WIDTH (mm)` | `1,573` | `0` | `46` | Sheet width (mixed cm and mm in raw ODS; normalized to mm in `paper_variants.width_mm`). |
| `14` | `Heights (mm)` | `1,573` | `0` | `48` | Sheet height (mixed cm and mm in raw ODS; normalized to mm in `paper_variants.height_mm`). |
| `15` | `PAPER TYPE` | `1,573` | `0` | `7` | **Primary Paper Family column** (`Ofset`, `Silk`, `Dizaina`, `Matt`, `Kartons`, `Group 1`, `Kappa`). Stripped from `catalog_compatible_all.csv`. |
| `16` | `PROVISER` | `1,573` | `0` | `6` | **Supplier / Distributor column** (`Antalis DEF`, `Dardedze hologrāfija`, `Polap DEF`, `Papyrus DEF`, `Cits DEF`, `Oldi DEF`). Stripped from `catalog_compatible_all.csv`. |
| `17` | `AKTIV` | `1,573` | `0` | `2` | Active flag (`Jā`: `1,554`, `Nē`: `19`). |

> [!IMPORTANT]
> **Absence of Grain Direction in Original Source**: `Paper data base.ods.zip` does **not** have a `GRAIN` column, and `0` of its `1,573` rows contain grain direction (`LONG_GRAIN` / `SHORT_GRAIN` / `LG` / `SG` / `BB` / `SB`) in any column.

---

## 2. Exhaustive Distribution of `PAPER TYPE` (Col 15)

All `1,573` rows in `Paper data base.ods.zip` have a non-empty `PAPER TYPE` value across `7` distinct values:

| Raw `PAPER TYPE` | Row Count | % of ODS | Real Technical Content & Anomalies Discovered |
| --- | ---: | ---: | --- |
| `Ofset` | `471` | `29.94%` | Uncoated offset and book papers (`Amber Graphic`, `PlanoPlus`, `Maestro Print`, `Olin`, `Munken Print/Polar/Lynx/Pure`, `Holmen Book`), **except** `1` row (`#338 Geltex LS 1165 Rioja 115 70x100 FSC`, empty `COAT`) which is a specialty covering material, and `1` row (`#37 Chantaffiche 250JE Blueback`) with `COAT = mitrumizturīgs`. |
| `Silk` | `404` | `25.68%` | Coated publishing/commercial papers. **Critical finding**: In the supplier's ODS, `PAPER TYPE = Silk` was used as a generic bucket for **both Silk and Gloss** coated papers! Specifically, `106` rows inside `PAPER TYPE = Silk` are explicitly **Gloss** (`Galerie Art Gloss`, `Galerie Fine Gloss`, `Maxi Gloss`, `Chorus Lux Gloss`, `Omni Gloss`, ` MultiArt Gloss`), `4` are **Matt** (`Galerie Art Matt`, `MultiArt Matt`), and `294` are **Silk / Satin** (`Galerie Art Silk`, `Maxi Satin`, `Creator Silk`, `Digigreen Silk`, `MultiArt Silk`, `Omni Silk`). |
| `Dizaina` | `344` | `21.87%` | Design, textured, dyed, metallic, translucent, and bookbinding covering papers (`Munken`, `Arena`, `Burano`, `Colorit`, `Conqueror`, `Curious Metallics`, `Curious Translucents`, `Efalin`, `Geltex`, `Wibalin`, `Surbalin`, `Keaykolour`, `Pop'Set`, `Rives`, `Splendorlux`, `Syn-Coat`, `Pergraphica`). |
| `Matt` | `182` | `11.57%` | Primarily coated matt papers (`179` rows: `Galerie Art Matt`, `Arctic Volume White/Ice/Highwhite`, `G-Print`, `Novatech Matt`, `Profi Matt`, `Volume Maxima`, `Sora Matt`, `Omni Silk 170`). **Critical finding**: `3` rows under `PAPER TYPE = Matt` have `COAT = nekrītots` and are **uncoated** (`#687 LuxCream 1.8 90g 64x90`, `#1074 Munken Polar 240 72x102 FSC`, `#1189 Munken Pure Rough 100 90x64`), and `2` rows have `COAT = silk` (`#65 Arctic Volume ice 130`, `#78 Arctic Volume White 200`). |
| `Kartons` | `141` | `8.96%` | Folding boxboard, SBS/FBB/GC1/GC2/GD board (`Alaska Plus GC2`, `Algro Design`, `Arktika GC1`, `Carta Integra`, `Carta Solida`, `Chromolux`, `CrownBoard`, `Diva Art`, `Ensocoat 1S/2S`, `Incada Exel/Silk`, `Invercote G/Creato`, `Kotkamills`, `Metsa Board`, `Simcote`, `Tambrite`, `Umka Color`, `Beermat`). |
| `Group 1` | `19` | `1.21%` | Heterogeneous bucket containing `Algro Design` (`4` rows), `Galerie Art` (`3` rows), `Image Digicolor` (`1`), `Multioffset` (`1`), `Keaykolour` (`1`), `Munken Pure` (`1`), `Multidesign` (`1`), `Raflamatt` / `Sticotac` self-adhesive (`3`), `Priplak` (`1`), `Syn-Coat` (`1`), `Brūns kraftpapīrs` (`1`), `ENVEL.POSTAC` (`1`). |
| `Kappa` | `12` | `0.76%` | Uncoated greyboard / bookbinding board (`Luxline` 1.0 mm to 3.0 mm). |
| **Total** | **`1,573`** | **`100.00%`** | **`0` empty values** |

---

## 3. Exhaustive Distribution of `COAT` (Col 9)

Across the `1,573` rows, `COAT` has `1,159` non-empty values (`43` distinct tokens) and `414` empty values:

| Category | Raw `COAT` Tokens (Exact Count) | Total Rows | Normalized `coatingStatus` & `finish` |
| --- | --- | ---: | --- |
| **Explicit Uncoated (Latvian)** | `nekrītots` (`405`), `Nekrītots` (`79`), `Nekrītota` (`3`), `nektītots` (`2`), `nekrītota, matēt` (`2`), `nekrītota` (`1`) | **`492`** | `coatingStatus = UNCOATED`, `finish = UNCOATED` |
| **Explicit Coated Generic (Latvian)** | `krītots` (`232`), `Krītots` (`151`), `krītots,` (`1`) | **`384`** | `coatingStatus = COATED` (Finish resolved from `PAPER TYPE` & `NAME`: `SILK`, `MATT`, `GLOSS`, or `OTHER`) |
| **Explicit Coated Matt** | `Matt` (`65`), `matt` (`2`), `pusmatēts` (`1`) | **`68`** | `coatingStatus = COATED`, `finish = MATT` |
| **Explicit Coated Silk / Satin** | `Silk` (`35`), `silk` (`28`), `satin` (`1`) | **`64`** | `coatingStatus = COATED`, `finish = SILK` (except `2` `Arctic Volume` rows flagged for `Matt` vs `silk` conflict) |
| **Explicit Coated Gloss** | `Gloss` (`29`), `gloss` (`2`), `glancēta` (`1`), `plastikāts gloss` (`1`) | **`33`** | `coatingStatus = COATED`, `finish = GLOSS` |
| **Explicit Coated Semi-Gloss** | `pusglancēts` (`6`), `semigloss` (`1`), `Semigloss` (`1`) | **`8`** | `coatingStatus = COATED`, `finish = SEMI_GLOSS` |
| **Explicit One-Side Coated** | `GC1` (`19`), `krītot/nekrītot` (`4`), `vienpus. krītots` (`3`), `Krītots 1s` (`1`), `kritots/nekritot` (`1`, on `Algro Design Duo`) | **`28`** | `coatingStatus = ONE_SIDE_COATED` (`Algro Design Duo` flagged for conflict review because `Duo` is 2S) |
| **Empty `COAT`** | `""` (`414`) | **`414`** | Evaluated via documented mill-family rules (`STRONG_MATCH_REVIEW`) or kept as `UNKNOWN` (`84` rows) |
| **Ambiguous / Non-Coating Tokens** | `Jautāt` ("Ask", `35`), `dizaina` (`28`), `Dizaina` (`7`), `Nr.108...`/`Nr.114...`/`Nr.121...`/`Nr.137...` (`6` Efalin shade codes), `70` (`1`, `Umka Color 350`), `POLAP` (`1`, `Maestro Print 140`), `mitrumizturīgs` (`1`), `caurspīdīgs` (`1`), `cits` (`1`), `Sintētiskais` (`1`) | **`82`** | Flagged as `ATTRIBUTE_CONFLICT` or `STRONG_MATCH_REVIEW`; never blindly defaulted to `UNCOATED` |
| **Total** | | **`1,573`** | |

---

## 4. Exhaustive Cross-Tabulation of `(PAPER TYPE, COAT)` in ODS

1. **`Ofset` (`471` rows)**:
   - `nekrītots` / `Nekrītots` / `nektītots`: `397` rows (`SAFE_UNIQUE_MATCH` / `AMBIGUOUS_MATCH`).
   - `<EMPTY>`: `71` rows (`70` standard offset papers resolved via documented family rule + `1` `Geltex LS 1165 Rioja` flagged as `ATTRIBUTE_CONFLICT`).
   - `POLAP`: `1` row (`#700 Maestro Print 140`, provider name misplaced in `COAT`, flagged as `ATTRIBUTE_CONFLICT`).
   - `mitrumizturīgs`: `1` row (`#37 Chantaffiche 250JE Blueback`, wet-strength poster paper, flagged as `ATTRIBUTE_CONFLICT`).
   - `Jautāt`: `1` row (`#1394 Printspeed 120`, flagged as `ATTRIBUTE_CONFLICT`).
2. **`Silk` (`404` rows)**:
   - `krītots` / `Krītots` / `krītots,`: `268` rows (`191` Silk/Satin + `77` Gloss in product name).
   - `Silk` / `silk` / `satin`: `60` rows.
   - `Gloss` / `gloss`: `25` rows (`Galerie Art Gloss`, `Maxi Gloss`, `Galerie Fine Gloss`).
   - `<EMPTY>`: `47` rows (`39` Silk, `4` Gloss, `4` Matt).
   - `pusglancēts`: `4` rows.
3. **`Matt` (`182` rows)**:
   - `krītots` / `Krītots`: `71` rows (`Arctic Volume`, `G-Print`, `Galerie Art Matt`, `Novatech Matt`, `Profi Matt`).
   - `Matt` / `matt`: `41` rows.
   - `<EMPTY>`: `65` rows (`Arctic Volume`, `G-Print`, `Galerie Art Matt`, `Matt Maxima`, `Novatech Matt`, `Sora Matt`, `Volume Maxima`).
   - `nekrītots`: `3` rows (`#687 LuxCream 1.8 90g`, `#1074 Munken Polar 240`, `#1189 Munken Pure Rough 100` — flagged as `SOURCE_TYPE_MATT_WITH_NEKRITOTS_COAT`).
   - `silk`: `2` rows (`#65 Arctic Volume ice 130`, `#78 Arctic Volume White 200` — flagged as `PT_MATT_WITH_COAT_SILK_CONFLICT`).
4. **`Dizaina` (`344` rows)**:
   - `nekrītots` / `Nekrītots` / `Nekrītota` / `nekrītota, matēt`: `92` rows.
   - `<EMPTY>`: `160` rows (`97` documented uncoated mill lines like `Munken`, `Arena`, `Burano`, `Colorit`, `Olin` + `58` specialty covering/metallic/translucent papers kept as `UNKNOWN` + `5` duplicate tuples).
   - `dizaina` / `Dizaina`: `35` rows (`14` `Burano`/`Colorit`/`Conqueror`/`Efalin` + `21` `Geltex`/`Surbalin`/`Wibalin`/`Pergraphica` flagged as `ATTRIBUTE_CONFLICT`).
   - `Jautāt`: `29` rows (flagged as `ATTRIBUTE_CONFLICT`).
   - `Nr.108...`–`Nr.137...`: `7` rows (`Efalin` shade numbers in `COAT`).
   - `krītots` / `Krītots` / `Matt` / `Silk` / `Gloss` / `glancēta` / `plastikāts gloss` / `pusmatēts` / `pusglancēts` / `semigloss`: `18` rows.
   - `caurspīdīgs` / `Sintētiskais` / `cits`: `3` rows.
5. **`Kartons` (`141` rows)**:
   - `krītots` / `Krītots`: `37` rows.
   - `Matt` (`23`), `GC1` (`19`), `krītot/nekrītot` (`4`), `vienpus. krītots` (`3`), `Krītots 1s` (`1`), `Gloss` (`5`), `Silk` (`3`), `Semigloss` (`1`): `59` rows.
   - `nekrītots`: `1` row (`#103 Beermat 395g`).
   - `<EMPTY>`: `42` rows (`20` `GC1`/`GC2`/`1S`/`Beermat` + `22` boards kept as `UNKNOWN`).
   - `Jautāt` (`1`, `CrownBoard Craft 245`), `70` (`1`, `Umka Color 350`): `2` rows (flagged as `ATTRIBUTE_CONFLICT`).
6. **`Group 1` (`19` rows)** & **`Kappa` (`12` rows)**:
   - Fully mapped and audited in `PAPER_MATERIALS_RECOVERY_MATCH_MATRIX.csv`.

---

## 5. Supplier (`PROVISER`, Col 16) & `SORTIMET` (Col 12) Audit

| `PROVISER` Raw Value | Normalized Code | ODS Row Count | % of ODS |
| --- | --- | ---: | ---: |
| `Antalis DEF` | `ANTALIS` | `556` | `35.35%` |
| `Dardedze hologrāfija` | `DARDEDZE` | `483` | `30.71%` |
| `Polap DEF` | `POLAP` | `356` | `22.63%` |
| `Papyrus DEF` | `PAPYRUS` | `115` | `7.31%` |
| `Cits DEF` | `OTHER_SUPPLIER` | `60` | `3.81%` |
| `Oldi DEF` | `OLDI` | `3` | `0.19%` |
| **Total** | | **`1,573`** | **`100.00%`** |

