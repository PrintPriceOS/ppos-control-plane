# PAPER-MATERIALS-RECOVERY-07V — Dictamen Final y Preparación Técnica

**Proyecto:** PrintPrice OS  
**Repositorio:** `PrintPriceOS/ppos-control-plane`  
**Rama / PR:** `feat/paper-materials-recovery-05` ([PR #14](https://github.com/PrintPriceOS/ppos-control-plane/pull/14) $\to$ `feat/spine-03r-caliper-and-engine`)  
**Fecha:** 2026-10-29  
**Estado de Producción (`MySQL Control`):** **0 escrituras ejecutadas** (`1.524` variantes totales; `1.236` con espesor; `288` sin espesor; `9` conflictos históricos intactos).

---

## 1. Veredictos Oficiales Obligatorios

1. **`RECOVERY_07V_READY_FOR_WRITE_APPROVAL`**:
   - **38 variantes** superan la auditoría documental estricta con evidencia primaria reproducible (URL directa a PDF técnico oficial con página/tabla/fila o coordenada exacta de hoja/fila/celda en `Spine calculation.xlsx` y `Paper data base.ods.zip`).
   - Desglose de las **38 variantes acreditadas**:
     - **32 `MANUFACTURER_DATASHEET_VERIFIED`** (`caliper_source = 'DATASHEET_VERIFIED'`, `caliper_confidence_status = 'REFERENCE_IMPORTED'`):
       - *Arctic Paper Munkedal*: *Munken Kristall* `170g` (`192 µm`) y `240g` (`271 µm`) — PDF directo `TechnicalSheetMunkenKristallEN.pdf`.
       - *Holmen Iggesund*: *Invercote G* `380g` (`505 µm`) — PDF directo `P7001311853_Invercote_G_General_Technical_Information_igepa.pdf`; *Incada Silk* `280g` (`445 µm`) — PDF directo `datasheet_incada_silk.pdf` / `Incada silk Productblad_IgepaNL.pdf`.
       - *Billerud*: *CrownBoard Craft* `345g` (`535 µm`) — PDF directo `billerud_crownboard-craft_tech_data_sheet_2025.08.pdf` (`Rev. 2025.08`).
       - *Mondi*: *PERGRAPHICA Classic Rough* `240g` (`328 µm`) — PDF directo `IGEPA_43727_PERGRAPHICA_rough_Datenblatt.pdf`.
       - *Umka Cardboard Mill*: *Umka Color GD2* `300g` (`390 µm`) y `350g` (`450 µm`) — PDF directo `TDS-GD2-Umka-Color.pdf` (`Rev. 2023-01`).
       - *Favini*: *Burano Pastel & Bright* (`12` variantes `140g = 170 µm`, `1` variante `200g = 234 µm`) y *Burano Nero Notte Nr. 63* (`140g = 172 µm`, `250g = 290 µm`) — PDFs directos `TechnicalSheetBuranoEN.pdf`, `range-chart-Burano-1.pdf` y `Caracteristicas Tecnicas Burano Nero.pdf`.
       - *Antalis / Arjowiggins*: *Curious Metallics* (`3` variantes `120g = 157 µm`, `6` variantes `300g = 400 µm`) — PDF directo fechado `TS_EN_Curious_Collection_00_25092023.pdf` (`Rev. 00 — 25/09/2023`).
     - **3 `SUPPLIER_REFERENCE_IMPORTED`** (`caliper_confidence_status = 'REFERENCE_IMPORTED'`):
       - `var_e9b970adf34027f1` (*Munken Print White 18 115 72x102 FSC*, `115g` $\to$ **`209 µm`**, corregido desde `207 µm` según la celda exacta `R39` del Bloque `#24` en `Spine calculation.xlsx`, Hoja `Papers`, Cabecera `P31`).
       - `var_dbd5357075534e3b` (*Nevia Plus C1S 80g 71my 52X72cm*, `80g` $\to$ **`71 µm`**, Celda `C1224` de `Paper data base.ods.zip`).
       - `var_737c9a59216f4bf2` (*Priplak Cristal + 0.5 mm 72x102 Transparent*, `455g` $\to$ **`500 µm`**, Celda `C1403` de `Paper data base.ods.zip`).
     - **3 `SIBLING_FORMAT_DOCUMENTED`** (`caliper_source = 'SUPPLIER_IMPORT'`, `caliper_confidence_status = 'REFERENCE_IMPORTED'`):
       - `var_6c9d63c6a90f9071` (*GALERIE FINE gloss 80 64x90*, `80g` $\to$ **`65 µm`**, hermano exacto `var_4754d3a2eeb5d5b2` en Fila `#518` / Celda `K522`).
       - `var_ef95d9c7874f1e50` (*Maxima Volume 150 102x72 FSC*, `150g` $\to$ **`162 µm`**, hermano exacto `var_84b91b1fcfe9a59d` en Fila `#881` / Celda `K885`).
       - `var_015ca99a30bee286` (*PrintSpeed Laser Jet 120g 45x32*, `120g` $\to$ **`133 µm`**, medio pliego exacto de `var_9164f93b039773bd` en Fila `#1395` / Celda `K1399`).

2. **`RECOVERY_07V_DOCUMENTATION_PENDING`**:
   - **250 variantes** permanecen retenidas sin escritura en base de datos:
     - **34 propuestas de `RECOVERY-07` reclasificadas durante `07V`**:
       - **33** pasan a `DOCUMENTATION_REQUIRED` (incluyendo las discrepancias detectadas en *Nautilus SuperWhite 160g* `196 vs 160 µm`, *Sirio Ultra Black 280g* `370 vs 330 µm`, *Olin Design Smooth 200g* `194 vs 204 µm`, la ambigüedad de subserie en *Ensocoat 275g* `1S vs 2S`, las entradas con URL genérica sin PDF directo y las 12 propagaciones de hermanos entre colores distintos o subseries no idénticas).
       - **1** pasa a `PHYSICAL_MEASUREMENT_REQUIRED` (`var_a7fc7fb8e188329b`, *Efalin FINE LINEN 116 Red 120 102x70*, por conflicto entre filas duplicadas `#201`/`#202` del ODS y por pertenecer a la línea de recubrimiento gofrado *Efalin*).
     - **216 variantes ya retenidas desde `RECOVERY-07`** (`144` `PHYSICAL_MEASUREMENT_REQUIRED` para *Geltex, Efalin, Wibalin, Surbalin, Sticotac, Reacto*, `67` `DOCUMENTATION_REQUIRED` y `5` `CONFLICT_HOLD`).

---

## 2. Impacto Proyectado en el Catálogo (`1.524` Variantes)

| Métrica del Catálogo (`paper_variants`) | Estado Actual (Post-`RECOVERY-06`) | Cambio Acreditado en `RECOVERY-07V` | Estado Proyectado tras Aplicar `07V` |
| :--- | :---: | :---: | :---: |
| **Variantes con espesor (`caliper_um > 0`)** | `1.236` (`81,10 %`) | **`+38`** | **`1.274` (`83,60 %`)** |
| **Variantes pendientes (`caliper_um IS NULL`)** | `288` (`18,90 %`) | **`-38`** | **`250` (`16,40 %`)** |
| — *Pendientes en `PHYSICAL_MEASUREMENT_REQUIRED`* | `144` | `+1` (*Efalin 116 Red*) | `145` (`9,51 %`) |
| — *Pendientes en `DOCUMENTATION_REQUIRED`* | `67` | `+33` (reclasificadas en `07V`) | `100` (`6,56 %`) |
| — *Pendientes en `CONFLICT_HOLD` (`caliper_um IS NULL`)* | `5` | `0` | `5` (`0,33 %`) |
| **Conflictos históricos con espesor preservados** | `9` (`LIVONIA_REFERENCE_IMPORT`) | **`0` sobrescrituras** | **`9` intactos** |

---

## 3. Garantías Técnicas e Invariantes Conservados en el Script Dry-Run

El script [`scripts/recover_paper_materials_07.cjs`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/scripts/recover_paper_materials_07.cjs) y la batería de tests [`tests/paper_materials_recovery_07.test.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/paper_materials_recovery_07.test.js) han sido actualizados para operar **exclusivamente sobre las 38 variantes verificadas en `RECOVERY_07V_VERIFIED_FOR_WRITE.csv`**:

1. **Control Compare-and-Swap (`CAS`)**: Solo permite actualizar filas donde `caliper_um IS NULL OR caliper_um <= 0` y cuyo `id` no pertenezca a los 9 conflictos históricos ni a los 5 conflictos sin espesor.
2. **Idempotencia estricta**: La simulación dry-run verifica que una segunda pasada produce `0` escrituras adicionales (`pass1.updatedCalipers = 38`, `pass2.updatedCalipers = 0`, `pass2.skippedAlreadyApplied = 38`).
3. **Rollback SQL determinista por variante**: Generación automática de `UPDATE paper_variants SET ... WHERE id = ...` dentro de una transacción para las 38 variantes.
4. **Conservación de `REFERENCE_IMPORTED` y bloqueo industrial**: Ninguna variante se promueve a `VERIFIED` sin medición física en planta; `canReleaseToManufacturing` permanece en `false`.
5. **Cero impacto comercial / BPE**: No toca `paper_products`, `grain_direction`, `supplier_paper_offers`, precios, gramajes ni dimensiones.
6. **Pendiente de seguridad**: Se mantiene abierto `SECURITY_ROTATION_PENDING`.

