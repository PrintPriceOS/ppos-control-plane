# PAPER-MATERIALS-RECOVERY-03 — Multilingual Technical Normalization Rules

**Mission:** `PAPER-MATERIALS-RECOVERY-03`  
**Service:** [`src/api/services/paperMaterialsNormalizationService.js`](../../src/api/services/paperMaterialsNormalizationService.js)  
**Target Universe:** `1,524` production variants in `Control.paper_variants` / `Control.paper_products` (`1,573` rows in `Paper data base.ods.zip`)

---

## 1. Architectural Separation of Technical Concepts

During the audit of `Paper data base.ods.zip` (`Лист1`), we verified that the original spreadsheet combines substrate family and surface finish in `PAPER TYPE` (`Ofset`, `Silk`, `Matt`, `Gloss`, `Dizaina`, `Kartons`, `Kappa`, `Uzlīmju`, `Paškopējošais`, `Avīžpapīrs`, `Kraft`, `Group 1`, `Plotter`) while recording Latvian coating / material descriptors in `COAT` (`krītots`, `nekrītots`, `1xkrītots`, `2xkrītots`, `Jautāt`, `dizaina`, `mitrumizturīgs`, `caurspīdīgs`, `Sintētiskais`, etc.).

To prevent semantic conflation and silent defaults, [`paperMaterialsNormalizationService.js`](../../src/api/services/paperMaterialsNormalizationService.js) strictly decouples six independent dimensions:

| Canonical Attribute | Target Column | Allowed Canonical Values | Default When Missing |
| :--- | :--- | :--- | :--- |
| **`paperType`** | `paper_products.paper_type` | `OFFSET`, `COATED`, `DESIGN`, `CARTON`, `DIGITAL`, `OTHER` | `OTHER` (only when family is specialty/label/carbonless/newsprint) |
| **`coatingStatus`** | `paper_products.coating_status` + `paper_variants.metadata_json.ods_materials_recovery.coatingStatus` | `COATED`, `UNCOATED`, `ONE_SIDE_COATED`, `UNKNOWN` | `UNKNOWN` (never defaults silently to `UNCOATED`) |
| **`finish`** | `paper_variants.finish` | `MATT`, `SILK`, `GLOSS`, `SEMI_GLOSS`, `UNCOATED`, `OTHER`, `UNKNOWN` | `UNKNOWN` (never defaults silently to `UNCOATED`) |
| **`grainDirection`** | `paper_variants.grain_direction` | `LONG_GRAIN`, `SHORT_GRAIN`, `UNKNOWN` | `UNKNOWN` (never inferred from `width_mm` vs `height_mm`) |
| **`caliperUm`** | `paper_variants.caliper_um` | Positive numeric $\mu\text{m}$ or `NULL` | `NULL` (`caliper_confidence = 'UNKNOWN'`) |
| **`originalCode` / `supplierCodeNormalized`** | `paper_variants.metadata_json.ods_materials_recovery` | Raw ODS `CODE` + normalized supplier code (`LIVONIA`, `ANTALIS`, `PAPYRUS`, `IGEPA`, `POLAP`, `PG`, `CUSTOM_UPLOAD`) | `null` |

---

## 2. Explicit Latvian / English `COAT` Token Dictionary

The primary source of truth for `coatingStatus` is the explicit `COAT` column in `Paper data base.ods.zip`:

| Raw `COAT` Token (Trimmed) | Normalized Key | `coatingStatus` | `coatingConfidence` | Rule & Verification Note |
| :--- | :--- | :--- | :--- | :--- |
| `krītots`, `kritots`, `2xkrītots` | `kritots` / `2xkritots` | `COATED` | `EXACT_SOURCE` | Two-side coated paper or board (`726` + `3` ODS rows). |
| `1xkrītots`, `1xkritots` | `1xkritots` | `ONE_SIDE_COATED` | `EXACT_SOURCE` | One-side coated board/label (`19` ODS rows, e.g., `Arktika GC1`, `Incada Exel GC2`). |
| `nekrītots`, `nekritots` | `nekritots` | `UNCOATED` | `EXACT_SOURCE` | Explicitly uncoated paper/board (`351` ODS rows). |
| `kritots/nekritot` | `kritots/nekritot` | `ONE_SIDE_COATED` | `CONFLICT` | Hybrid coated/uncoated entry (`1` row: `Algro Design Duo 330`). Flagged as `COAT_HYBRID_CONFLICT` for manual review. |
| `Jautāt` | `jautat` | `UNKNOWN` | `CONFLICT` | Latvian for *"Ask"* (`31` ODS rows). Flagged as `COAT_ASK_SUPPLIER_JAUTAT`; never converted to `UNCOATED`. |
| `dizaina`, `Dizaina` | `dizaina` | `UNKNOWN` | `CONFLICT` | Design/covering material tag in `COAT` (`21` ODS rows: `Geltex`, `Wibalin`, `Surbalin`, `Pergraphica`). Flagged as `COAT_DESIGN_COVERING_MATERIAL`. |
| `mitrumizturīgs` | `mitrumizturigs` | `ONE_SIDE_COATED` | `CONFLICT` | Wet-strength blueback poster paper (`1` row: `Chantaffiche 250JE Blueback 115g`). Flagged as `COAT_SPECIALTY_WET_STRENGTH`. |
| `caurspīdīgs` | `caurspidigs` | `UNCOATED` | `CONFLICT` | Translucent tracing/design paper (`1` row: `Curious Translucents 210g`). Flagged as `COAT_SPECIALTY_TRANSLUCENT`. |
| `Sintētiskais` | `sintetiskais` | `UNKNOWN` | `CONFLICT` | Synthetic film substrate (`1` row: `Syn-Coat 175g`). Flagged as `COAT_SPECIALTY_SYNTHETIC`. |
| `POLAP` | `polap` | `UNCOATED` | `CONFLICT` | Supplier code entered in `COAT` on `Maestro Print 140 102x72 FSC` (`PAPER TYPE = Ofset`). Flagged as `COAT_CONTAINS_PROVIDER_CODE`. |
| `70` | `70` | `ONE_SIDE_COATED` | `CONFLICT` | Numeric typo in `COAT` on `Umka Color 350 70x100` (`GD2` folding boxboard). Flagged as `COAT_NUMERIC_TYPO_GD2_BOARD`. |
| `Splendorgel EW`, `Olin Regular High White`, `Olin Rough Cream`, `Olin Rough High White`, `Olin Rough Absolute White` | Brand/shade strings (`21` rows) | `UNCOATED` | `INFERRED_FAMILY` | Brand/shade text placed in `COAT` on verified uncoated offset/design papers (`Splendorgel EW`, `Olin`). |

---

## 3. Resolution Rules When `COAT` Is Empty (`397` ODS Rows / `317` Production Variants)

When `COAT` is empty (`""`) in `Paper data base.ods.zip`, [`normalizeOdsRowTechnicalAttributes`](../../src/api/services/paperMaterialsNormalizationService.js) applies deterministic family and mill-brand rules and marks the row with `coatingConfidence = 'INFERRED_FAMILY'` (categorized in reconciliation as `STRONG_MATCH_REVIEW`, **never** mixed into `SAFE_UNIQUE_MATCH`):

1. **`PAPER TYPE = Ofset` with empty `COAT` (`70` variants)**:
   - Standard woodfree offset papers (`Amber Graphic`, `Maestro Print`, `Munken Print`, `Holmen Book`, `Preprint`, `Soporset`, etc.) $\to$ `paperType = OFFSET`, `coatingStatus = UNCOATED`, `finish = UNCOATED`.
   - *Exception*: `Geltex LS 1165 Rioja 115 70x100 FSC` is a bookbinding covering material $\to$ flagged as `ATTRIBUTE_CONFLICT` (`COVERING_MATERIAL_IN_OFFSET_TYPE`).
2. **`PAPER TYPE = Dizaina` with empty `COAT` on verified uncoated mill lines (`117` variants)**:
   - Mill lines `Munken` (`Polar`, `Lynx`, `Pure`, `Kristall`), `Olin` (`Regular`, `Rough`, `Smooth`), `Pergraphica`, `Scandia 2000`, `Splendorgel`, `Rives`, `Keaykolour`, `Curious Metallics`, `Mohawk`, `Arena`, `materica`, `Sirio`, ` Woodstock`, `Cromatico`, `Gmund`, `Pop'Set`, `Conqueror`, `Wild`, `PlanoPlus` $\to$ `paperType = DESIGN`, `coatingStatus = UNCOATED`, `finish = UNCOATED`.
3. **`PAPER TYPE = Matt` with empty `COAT` on verified coated matt mill lines (`63` variants)**:
   - Mill lines `G-Print`, `Galerie Art Matt`, `Galerie Fine`, `MultiArt Matt`, `Maxi Matt`, `LumiMatt`, `Creator Vol`, `Quatro`, `Arctic Matt`, `igepa matt`, `Tom&Otto Matt` $\to$ `paperType = COATED`, `coatingStatus = COATED`, `finish = MATT`.
4. **`PAPER TYPE = Silk` with empty `COAT` (`47` variants)**:
   - Verified coated silk mill lines (`Galerie Art Silk`, `MultiArt Silk`, `Maxi Silk`, `Creator Silk`, `LumiSilk`, `Arctic Silk`, `Tom&Otto Silk`, `Digigreen Silk`) $\to$ `paperType = COATED`, `coatingStatus = COATED`, `finish = SILK` (`39` variants).
   - Product name explicitly contains `Gloss` (`Galerie Art Gloss`, `Maxi Gloss`) $\to$ `finish = GLOSS` (`7` variants).
   - Product name explicitly contains `Matt` (`1` variant) $\to$ `finish = MATT`.
5. **`PAPER TYPE = Kappa` with empty `COAT` (`10` variants)**:
   - Greyboard (`Eskaboard`, `Kappa`) $\to$ `paperType = CARTON`, `coatingStatus = UNCOATED`, `finish = UNCOATED`.
6. **`PAPER TYPE = Kartons` with empty `COAT` (`42` variants)**:
   - Explicit `1S`, `GC1`, `GC2`, `Ensocoat 1s`, `Arktika`, `Incada`, `Tambrite`, `Carta Integra`, `Chromocard`, `Algro Design 1S` (`7` variants) $\to$ `paperType = CARTON`, `coatingStatus = ONE_SIDE_COATED`.
   - Unspecified specialty boards (`35` variants) $\to$ `paperType = CARTON`, `coatingStatus = UNKNOWN`, `finish = UNKNOWN` (`EMPTY_COAT_UNRESOLVED`).
7. **Remaining specialty rows with empty `COAT` (`49` variants across `Dizaina` covering materials, `Group 1`, etc.)**:
   - Preserved strictly as `coatingStatus = UNKNOWN`, `finish = UNKNOWN` (`EMPTY_COAT_UNRESOLVED`).

---

## 4. Mandatory Non-Hallucination & Conflict Invariants

### Invariant 1 — `Paper Type = Matt` Does Not Imply `Coating = COATED`
If `PAPER TYPE = Matt` and `COAT = nekrītots`, the paper is an **uncoated** smooth/matt-feel paper (`LuxCream 1.8 90g 64x90`, `Munken Polar 240 72x102 FSC`, `Munken Pure Rough 100 90x64`).
- `coatingStatus` is resolved strictly to `UNCOATED`.
- `paperType` is resolved to `OFFSET` or `DESIGN` (never `COATED`).
- The row is flagged with `MATT_TYPE_WITH_UNCOATED_COAT` and placed in `ATTRIBUTE_CONFLICT` (`2` unique variants) or `AMBIGUOUS_MATCH` (`1` duplicate-tuple variant) for explicit review.

### Invariant 2 — `PAPER TYPE = Silk` With `Gloss` Product Name
In `Paper data base.ods.zip`, `111` rows have `PAPER TYPE = Silk` while the product name explicitly specifies `Gloss` (e.g., `Galerie Art Gloss`, `Maxi Gloss`, `Galerie Fine Gloss`).
- `finish` is resolved to `GLOSS` (not `SILK`).
- The row is flagged with `SILK_TYPE_WITH_GLOSS_PRODUCT_NAME` (`finishConfidence = 'INFERRED_NAME'`) and categorized as `STRONG_MATCH_REVIEW` (`102` unique variants with `krītots` + `7` unique variants with empty `COAT`).

### Invariant 3 — `PAPER TYPE = Matt` With `COAT = silk`
Two rows in `Paper data base.ods.zip` (`Arctic Volume ice 130 72x102 FSC` and `Arctic Volume White 200 102x72 FSC`) have `PAPER TYPE = Matt` and `COAT = silk`.
- Flagged as `MATT_TYPE_WITH_SILK_COAT` in `ATTRIBUTE_CONFLICT` (`2` variants).

### Invariant 4 — Zero Grain Direction Inference From Dimensions
`Paper data base.ods.zip` does not contain an explicit grain column (`LG`/`SG`/`BB`/`SB`), and `WIDTH (mm)` $\times$ `Heights (mm)` lists `70x100` (`493` rows) alongside `100x70` (`144` rows) without consistent typographic underline/bold grain conventions.
- `normalizeGrainDirection()` returns `UNKNOWN` for all `1,573` ODS rows.
- Only the `2` demo variants (`var_9cd7c29f956dc9e0` `LONG_GRAIN` and `var_035cb8ab7cd3fa7e` `SHORT_GRAIN`) retain accredited grain direction (`ALREADY_VERIFIED`).

### Invariant 5 — Dimension Normalization (`cm` vs `mm` in ODS)
In `Paper data base.ods.zip`, the columns labeled `WIDTH (mm)` and `Heights (mm)` actually store values in **centimeters** for all values `< 200` (e.g., `70` $\times$ `100` = `700` $\times$ `1000` mm) and in **millimeters** for `16` rows with values $\ge 200$ (`460` $\times$ `640`, `700` $\times$ `1000`, `640` $\times$ `900`, `720` $\times$ `1020`).
- `normalizeOdsDimensionToMm(val)` applies `n < 200 ? Math.round(n * 10) : Math.round(n)`, achieving a **100% deterministic tuple match (`1,522 / 1,522` non-demo production variants, `0` unmatched)**.

