# MISIÓN PAPER-MATERIALS-RECOVERY-07 — Plan Técnico de Recuperación y Acreditación de Espesores (`RECOVERY_07_RECOVERY_PLAN.md`)

**Proyecto:** PrintPrice OS  
**Repositorio:** `PrintPriceOS/ppos-control-plane`  
**Rama Activa:** `feat/paper-materials-recovery-05` ([PR #14](https://github.com/PrintPriceOS/ppos-control-plane/pull/14) contra `feat/spine-03r-caliper-and-engine`)  
**Entorno de Referencia:** MySQL `Control` (`212.227.79.67`, auditado exclusivamente en modo lectura durante `RECOVERY-07`)  
**Fecha:** 2026-10-29  

---

## 1. Punto de Partida Consolidado (`PAPER-MATERIALS-RECOVERY-06`)

Tras el cierre productivo y documental de `PAPER-MATERIALS-RECOVERY-06` (`6516aeaf659711554b0a341f01b9aed6c1b3433d`), el catálogo de materiales de papel en producción (`Control`) presenta la siguiente distribución exacta:

| Métrica del Catálogo (`paper_variants`) | Valor Productivo | `%` sobre 1.524 |
| :--- | :---: | :---: |
| **Total de variantes activas** | **1.524** | `100,00 %` |
| **Variantes con espesor (`caliper_um > 0`)** | **1.236** | `81,10 %` |
| **Variantes sin espesor (`caliper_um IS NULL`)** | **288** | `18,90 %` |
| **Variantes con clasificación técnica acreditada (`category != 'OTHER'`)** | **1.187** | `77,89 %` |
| **Variantes con clasificación pendiente (`OTHER / UNKNOWN`)** | **337** | `22,11 %` |
| **Conflictos históricos de espesor protegidos (`LIVONIA_REFERENCE_IMPORT`)** | **9** | `0,59 %` |

El objetivo exclusivo de **`PAPER-MATERIALS-RECOVERY-07`** es investigar y acreditar con evidencia técnica verificable las **288 variantes con `caliper_um IS NULL`**, preparando los artefactos y el script de actualización en modo **`DRY_RUN`** sin ejecutar escrituras en producción.

---

## 2. Fase 1 — Inventario Definitivo por Prioridad Industrial (`288 Variantes`)

El inventario completo se encuentra versionado en [`docs/architecture/RECOVERY_07_MISSING_CALIPER_INVENTORY.csv`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/RECOVERY_07_MISSING_CALIPER_INVENTORY.csv). Las **288 variantes** se han clasificado en tres niveles de prioridad operativa para Budget App y Spine Calculator:

| Nivel de Prioridad | Aplicación Industrial | Total (`caliper_um IS NULL`) | Acreditadas para Recuperación (`72`) | Retenidas con Bloqueo Gobernado (`216`) | Familias Principales |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **`P1_INTERIOR_BOOK_PAPER`** | Papeles de interior de libro (offset, estucados y alta mano) | **34** | **15** (`44,12 %`) | **19** (`55,88 %`) | *Munken Print White 18*, *Munken Kristall 170*, *Maxima Volume 150*, *Galerie Art Silk 90*, *Galerie Fine Gloss 80*, *Balance Silk 130*, *Serixo 90*, *Nautilus SuperWhite 160*, *MultiDesign Original 100*, *Arena Rough Ivory 140*, *Print Speed 100/120*, *Image Digicolor 90*. |
| **`P2_COVER_BOARD_AND_CARD`** | Cartulinas gráficas, cartones de cubierta y alto gramaje ($\ge 200\text{ g/m}^2$) | **69** | **27** (`39,13 %`) | **42** (`60,87 %`) | *Invercote G 380*, *Incada Silk 280*, *CrownBoard Craft 345*, *Ensocoat 275*, *ProVantage Kraftliner 125*, *Umka Color 300/350*, *Munken Kristall 240*, *PERGRAPHICA Classic Rough 240*, *Nautilus SuperWhite 350*, *Olin Design Smooth 200*, *MultiDesign Original 300*, *Splendorgel E.W. 300*, *Sirio Ultra Black 280*, *Gmund Colors Metallic 260*, *Rives Shetland 250*, *Priplak 273/455*, *Burano 200/250*, *Curious Metallics 300*. |
| **`P3_SPECIALTY_AND_COVERING`** | Materiales de recubrimiento de encuadernación, papeles coloreados de guarda, autoadhesivos y autocopiativos | **185** | **30** (`16,22 %`) | **155** (`83,78 %`) | **Acreditadas (`30`)**: *Burano 140g* (`13`), *Rainbow 120/160g* (`5`), *Pop'Set 120g* (`5`), *Curious Metallics 120g* (`3`), *Rives Design/Linear 120g* (`2`), *Efalin Fine Linen 116 Red 120g* (`1`), *Nevia Plus C1S 80g 71my* (`1`).<br>**Retenidas (`155`)**: *Geltex* (`44`), *Efalin* (`40`), *Wibalin* (`15`), *Surbalin* (`5`), *Sticotac / Raflamatt / Semigloss* (`18`), *Reacto NCR* (`11`), *Colorit* (`8`), *Kaskad* (`7`), etc. |
| **TOTAL** | **Catálogo pendiente de espesor** | **288** | **72 (`25,00 %`)** | **216 (`75,00 %`)** | **Proyección: `1.236` $\to$ `1.308` variantes con espesor (`85,83 %`)** |

---

## 3. Fase 2 y Fase 3 — Conciliación y Mapeo Explícito a los Enums Reales de MySQL `Control`

De acuerdo con las reglas de gobierno de la misión:
1. **Prohibición absoluta de estimación por gramaje o bulk**: Ninguna variante ha sido calculada multiplicando `gsm × bulk` sin tabla oficial de micras en ficha técnica (por ejemplo, las gamas *Fedrigoni Arena Smooth/Rough 90/250*, *Sirio Color 290*, *Sirio Pearl 300*, *Materica 120/250* y *ArcoPrint 300* publican únicamente `VSA cm³/g` en sus fichas generales y se mantienen estrictamente en `DOCUMENTATION_REQUIRED`).
2. **Mapeo explícito entre las 6 categorías de auditoría y los enums reales de `paper_variants`** (`caliper_source` y `caliper_confidence_status`), sin promover ningún registro a `VERIFIED` salvo medición física en planta o certificado firmado de lote:

| Categoría de Auditoría (`RECOVERY-07`) | Variantes (`288`) | ¿Escribible en BD? | Columna `caliper_source` (Enum Real MySQL) | Columna `caliper_confidence_status` (Enum Real MySQL) | Regla de Gobierno y Liberación Industrial (`canReleaseToManufacturing`) |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **`MANUFACTURER_DATASHEET_VERIFIED`** | **53** | **SÍ** | `'DATASHEET_VERIFIED'` | `'REFERENCE_IMPORTED'` | Ficha técnica oficial del fabricante (ISO 534) con valor exacto en `µm` para familia, acabado y gramaje. Se mantiene `REFERENCE_IMPORTED` (`canReleaseToManufacturing: false`) hasta verificación física de lote en planta. |
| **`SUPPLIER_REFERENCE_IMPORTED`** | **4** | **SÍ** | `'LIVONIA_REFERENCE_IMPORT'` (`1`) / `'SUPPLIER_IMPORT'` (`3`) | `'REFERENCE_IMPORTED'` | Valor documentado directamente en `Spine calculation.xlsx` (*Munken Print White 18 115g* = `207 µm`) o en la fila/especificación del ODS original (*Nevia Plus C1S 80g 71my* = `71 µm`, *Priplak Cristal 0.5 mm* = `500 µm`, *Efalin Fine Linen 116 Red 120g* Fila ODS `#202` = `165 µm`). |
| **`SIBLING_FORMAT_DOCUMENTED`** | **15** | **SÍ** | `'SUPPLIER_IMPORT'` | `'REFERENCE_IMPORTED'` | Formato o tono hermano técnicamente equivalente del mismo fabricante, acabado y gramaje con espesor unánime en el ODS original y en producción. |
| **`PHYSICAL_MEASUREMENT_REQUIRED`** | **144** | **NO (`NULL`)** | `'NONE'` (sin cambio) | `'MISSING'` (sin cambio) | Materiales gofrados de recubrimiento (*Geltex*, *Efalin*, *Wibalin*, *Surbalin*), complejos autoadhesivos multicapa (*Sticotac*, *Raflamatt*), papel autocopiativo (*Reacto*) y cartulinas gofradas/contraencoladas (*Conqueror Laid*, *Constellation*, *Sirio Ultra Black 460*). Requieren micrómetro en planta. |
| **`CONFLICT_HOLD`** | **5** *(+9 históricos)* | **NO (`NULL`)** | `'NONE'` (sin cambio en las 5) / `'LIVONIA_REFERENCE_IMPORT'` (en las 9 históricas) | `'MISSING'` (en las 5) / `'REFERENCE_IMPORTED'` (en las 9 históricas) | Contradicción directa entre filas duplicadas o hermanos del ODS (*Maestro Print 170*, *Maestro Print 300*, *IQ Print 120*, *Munken Polar 170*, *Munken Pure Rough 100*). Los 9 conflictos históricos se preservan intactos. |
| **`DOCUMENTATION_REQUIRED`** | **67** | **NO (`NULL`)** | `'NONE'` (sin cambio) | `'MISSING'` (sin cambio) | Variantes donde el fabricante sólo publica `VSA / bulk` sin tabla directa de micras ISO 534, o donde existe ambigüedad de sub-serie/blancura (*Balance Pure 135*, *Keaykolour 300*, *Burano Graphite Grey Nr.72*). |

---

## 4. Resumen de las 72 Variantes Acreditadas (`RECOVERY_07_MANUFACTURER_EVIDENCE.csv`)

Todas las evidencias documentales individuales (título del documento, URL o referencia archivada, revisión, fabricante, gramaje y valor en `µm`) están registradas en [`docs/architecture/RECOVERY_07_MANUFACTURER_EVIDENCE.csv`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/RECOVERY_07_MANUFACTURER_EVIDENCE.csv):

### 4.1. `MANUFACTURER_DATASHEET_VERIFIED` (`53 variantes`)
1. **Arctic Paper Munkedal — *Munken Kristall*** (`2 variantes`):
   - `var_337668698c5acef2` (*Munken Kristall 170 90x64 FSC*, `170g`) $\to$ **`192 µm`** (`1.13 cm³/g`, ISO 534).
   - `var_586f4ee2a7c797c7` (*Munken Kristall 240 102x72 FSC*, `240g`) $\to$ **`271 µm`** (`1.13 cm³/g`, ISO 534).
2. **Papyrus / Inapa — *BalanceSilk®*** (`1 variante`):
   - `var_59ea39c77a5c9fbd` (*Balance Silk 130 46x64*, `130g`) $\to$ **`100 µm`** (ISO 534).
3. **Mondi / Antalis — *Serixo*** (`1 variante`):
   - `var_321ee9ca05450fca` (*Serixo 90 72x52 FSC*, `90g`) $\to$ **`115 µm`** (ISO 534).
4. **Antalis — *Image® Digicolor*** (`1 variante`):
   - `var_3d4c4c6b76317c37` (*Image Digicolor 90g 45x64*, `90g`) $\to$ **`98 µm`** (ISO 534).
5. **Mondi — *Nautilus® SuperWhite*** (`2 variantes`):
   - `var_fb2a8f3e2fe2f0d0` (*Nautilus SuperWhite 160 64x90*, `160g`) $\to$ **`160 µm`** ($\pm 4\text{ µm}$, ISO 534).
   - `var_0a232e062bba2a81` (*Nautilus SuperWhite 350 g/m B1*, `350g`) $\to$ **`450 µm`** ($\pm 10\text{ µm}$, ISO 534).
6. **Mondi — *PERGRAPHICA® Classic Rough*** (`1 variante`):
   - `var_ebd54628ffb83779` (*PERGRAPHICA Classic Rough 240 72x102 FSC*, `240g`) $\to$ **`328 µm`** ($\pm 7\text{ µm}$, ISO 534).
7. **Antalis — *Olin Design Smooth*** (`1 variante`):
   - `var_dce57fdd8e56067c` (*Olin Design Smooth 200 72x102 Ultimate White*, `200g`) $\to$ **`204 µm`** (ISO 534).
8. **Holmen Iggesund — *Invercote G* & *Incada Silk*** (`2 variantes`):
   - `var_d9defc9b19b9adbf` (*Invercote G 380 64x90*, `380g`) $\to$ **`505 µm`** ($\pm 4\%$, ISO 534).
   - `var_3810dbfc361594d9` (*INCADA SILK 280 64x92 FSC*, `280g`) $\to$ **`445 µm`** (`17.6 pt`, ISO 534).
9. **Billerud — *CrownBoard Craft™*** (`1 variante`):
   - `var_b56fd736fb2364c1` (*CrownBoard Craft 345 72x102*, `345g`) $\to$ **`535 µm`** (`21.1 pt`, $\pm 4\%$, ISO 534).
10. **Stora Enso — *Ensocoat™*** (`1 variante`):
    - `var_78eeb512252f2d98` (*Ensocoat 275g 102x72*, `275g`) $\to$ **`330 µm`** (ISO 534).
11. **Mondi — *ProVantage Kraftliner*** (`1 variante`):
    - `var_897a47f784db60d8` (*KRAFTLINER PROVANTAGE 125 70x100*, `125g`) $\to$ **`187 µm`** ($\pm 2\text{ µm}$, ISO 534).
12. **Umka Cardboard Mill — *Umka Color GD2*** (`2 variantes`):
    - `var_65a8f7c69b84369c` (*Umka Color 300 70x100*, `300g`) $\to$ **`390 µm`** (ISO 534).
    - `var_bb8139b48c741830` (*Umka Color 350 70x100*, `350g`) $\to$ **`450 µm`** (ISO 534).
13. **Fedrigoni — *Splendorgel Extra White* & *Sirio Ultra Black 280*** (`2 variantes`):
    - `var_9bb4094aff71a872` (*Splendorgel E.W. 300 45x64*, `300g`) $\to$ **`315 µm`** (ISO 534).
    - `var_74c119b5749f8722` (*Fedrigoni Sirio Ultra black 280 gm 72x102*, `280g`) $\to$ **`330 µm`** (ISO 534).
14. **Priplak — *Priplak® Opaline*** (`2 variantes`):
    - `var_10c768331b38915c` (*Priplak Opaline 273g 72x102, naturel*, `273g`) $\to$ **`300 µm`** (`0.30 mm`).
    - `var_7f139c0667b2098d` (*Priplak Opaline 455g 72x102, naturel*, `455g`) $\to$ **`500 µm`** (`0.50 mm`).
15. **Gmund Paper — *Gmund Colors Metallic*** (`1 variante`):
    - `var_461d8b9ba2b0b8cc` (*Gmund Color System Metallic 50 blanc 260 70x100*, `260g`) $\to$ **`300 µm`** ($\pm 25\text{ µm}$, ISO 534).
16. **Antalis / Arjowiggins — *Rives Design, Linear & Shetland*** (`3 variantes`):
    - `var_6b178658448ce948` (*Rives Design Bright White 120g 70x100*, `120g`) $\to$ **`138 µm`** (ISO 534).
    - `var_53074163da87b009` (*Rives Linear Bright White 120 g/m 70x100*, `120g`) $\to$ **`160 µm`** (ISO 534).
    - `var_f989b6f4fd9d4b96` (*Rives Shetland 250g 70x100 Bright White*, `250g`) $\to$ **`357 µm`** (ISO 534).
17. **Favini — *Burano Pastel/Bright & Nero Black*** (`15 variantes`):
    - `12` variantes *Burano Pastel & Bright 140g* $\to$ **`170 µm`** ($\pm 5\%$, ISO 534).
    - `1` variante *Burano 50 Shocking Pink 200g* (`var_16f616d88874c4f5`) $\to$ **`234 µm`** ($\pm 5\%$, ISO 534).
    - `1` variante *Burano 63 Nero Black 140g* (`var_3cab347d98e6bafb`) $\to$ **`172 µm`** ($\pm 5\%$, ISO 534).
    - `1` variante *Burano nr. 63 Nero Black 250g* (`var_4d8611e0419fa40a`) $\to$ **`290 µm`** ($\pm 5\%$, ISO 534).
18. **Antalis / Arjowiggins — *Curious Metallics*** (`9 variantes`):
    - `3` variantes *Curious Metallics 120g* (`Ice Silver`, `Super Gold`, `Galvanised`) $\to$ **`157 µm`** (ISO 534).
    - `6` variantes *Curious Metallics 300g* (`Ice Gold`, `Super Gold`, `Galvanised`, `Iceberg`, `Electric Blue`, `Lustre`) $\to$ **`400 µm`** (ISO 534).
19. **Antalis / Arjowiggins — *Pop'Set*** (`5 variantes`):
    - `5` variantes *Pop'Set 120g* (`Californian Blue`, `Indigo`, `Poppy`, `Cloud`, `Lime Tonic`) $\to$ **`150 µm`** (ISO 534).

### 4.2. `SUPPLIER_REFERENCE_IMPORTED` (`4 variantes`)
1. `var_e9b970adf34027f1` (*Munken Print White 18 115 72x102 FSC*, `115g`) $\to$ **`207 µm`** (`LIVONIA_REFERENCE_IMPORT`, tabulado en `Spine calculation.xlsx` Hoja `Papers` cabecera `C127` *Munken Print White 1.8*, fila `115g = 207 µm`).
2. `var_dbd5357075534e3b` (*Nevia Plus C1S 80g 71my 52X72cm*, `80g`) $\to$ **`71 µm`** (`SUPPLIER_IMPORT`, especificado explícitamente como `71my` en Fila ODS `#1220`).
3. `var_737c9a59216f4bf2` (*Priplak Cristal + 0.5 mm 72x102 Transparent*, `455g`) $\to$ **`500 µm`** (`SUPPLIER_IMPORT`, especificado explícitamente como `0.5 mm` en Fila ODS `#1399` y ficha oficial Priplak).
4. `var_a7fc7fb8e188329b` (*Efalin FINE LINEN 116 (Red) 120 102x70*, `120g`) $\to$ **`165 µm`** (`SUPPLIER_IMPORT`, registrado explícitamente en la Fila duplicada ODS `#202` para este producto exacto y coincidente con la ficha Zanders Efalin Fine Linen `165 µm`).

### 4.3. `SIBLING_FORMAT_DOCUMENTED` (`15 variantes`)
1. `var_ef95d9c7874f1e50` (*Maxima Volume 150 102x72 FSC*, `150g`) $\to$ **`162 µm`** (hermano ODS Fila `#881` *Maxima Voule 150 90x64 FSC* = `162 µm`).
2. `var_6c9d63c6a90f9071` (*GALERIE FINE gloss 80 64x90*, `80g`) $\to$ **`65 µm`** (hermano ODS Fila `#518` *GALERIE FINE G 80 72x102* = `65 µm`).
3. `var_2a961015f775a4f7` (*Galerie A Silk 90 46x64 FSC*, `90g`) $\to$ **`74 µm`** (hermano ODS Fila `#517` *Galerie Art Silk 90 64x90 FSC* = `74 µm`).
4. `var_d6382607237e7511` (*Multidesign Original Natural 100 g/m A1*, `100g`) $\to$ **`130 µm`** (hermano ODS Fila `#983` *MultiDesign Original White 100 64x90* = `130 µm`).
5. `var_df51ab48fb6bee6d` (*Multidesign original Natural 300 g/m B1*, `300g`) $\to$ **`375 µm`** (hermanos ODS Filas `#980` y `#986` *MultiDesign Original 300g* = `375 µm`).
6. `var_ea4e053e2cc01a28` (*Arena Rough Ivory 140g 64x90*, `140g`) $\to$ **`185 µm`** (hermano ODS Fila `#116` *Arena Natural Rough 140 64x90* = `185 µm`).
7. `var_a52282e5180d0d3b` (*Print Speed 100 72x102*, `100g`) $\to$ **`118 µm`** (hermano ODS Fila `#1393` *Print Speed Laser Jet 100 45x64* = `118 µm`).
8. `var_4fade2216b6da976`, `var_59ac0c5f627c9a5d`, `var_015ca99a30bee286` (*Print Speed 120g*, `3 variantes`) $\to$ **`133 µm`** (hermano ODS Fila `#1395` *Print Speed Laser Jet 120g 45x64* = `133 µm`).
9. `var_303c4d29091a0b5f`, `var_dadd87b51f6a6a43`, `var_289d4883082e6e4b`, `var_96b5e3fe0ca4583b` (*Rainbow 120g*, `4 variantes`) $\to$ **`159 µm`** (hermanos ODS Filas `#1410` y `#1411` *Rainbow 120g* = `159 µm`).
10. `var_0dfa098d4381319e` (*Rainbow 82 Light Blue 160g 45x64*, `160g`) $\to$ **`214 µm`** (hermano ODS Fila `#1408` *Rainbow 160g* = `214 µm`).

---

## 5. Diseño de Ejecución Futura Idempotente y Reversible (`scripts/recover_paper_materials_07.cjs`)

El script [`scripts/recover_paper_materials_07.cjs`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/scripts/recover_paper_materials_07.cjs) implementa:
- **Bloqueo estricto de escritura por defecto (`DRY_RUN_ONLY`)**: Requiere tanto `--execute` como la variable de entorno `PAPER_MATERIALS_RECOVERY_07_APPROVED=true` para cualquier conexión de escritura futura.
- **Guardas Compare-and-Swap (`CAS`)**:
  - `WHERE id = ? AND (caliper_um IS NULL OR caliper_um <= 0) AND id NOT IN (<9 historical conflicts>)`.
  - Si una variante ya tiene el espesor objetivo aplicado, la segunda pasada (`Pass 2`) la omite con `0` escrituras adicionales (`idempotent = true`).
- **Generador determinista de Rollback SQL (`generateRollbackSql07`)**: Genera las sentencias exactas para revertir las 72 variantes a `caliper_um = NULL, caliper_mm = NULL, bulk_factor = NULL, caliper_source = 'NONE', caliper_confidence_status = 'MISSING'` en una única transacción atómica.

