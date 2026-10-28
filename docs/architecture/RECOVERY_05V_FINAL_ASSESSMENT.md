# MISIÓN PAPER-MATERIALS-RECOVERY-05V — Dictamen Final de Validación Documental y Preparación de Recuperación Ampliada

**Proyecto:** PrintPrice OS  
**Repositorio:** `PrintPriceOS/ppos-control-plane`  
**Base / PR:** [PR #14](https://github.com/PrintPriceOS/ppos-control-plane/pull/14) — `feat/paper-materials-recovery-05`  
**Fecha de Certificación:** 2026-10-28  
**Dictamen Oficial:** **`PAPER_MATERIALS_RECOVERY_05V_READY_FOR_WRITE_APPROVAL`**

---

## 1. Resumen Ejecutivo: Propuestas Iniciales (`RECOVERY-05`) vs Registros Realmente Acreditados (`05V`)

En cumplimiento estricto de las Secciones 1 a 6 de la orden de misión `PAPER-MATERIALS-RECOVERY-05V`, se ha auditado individualmente cada uno de los **363 candidatos de clasificación técnica** (`348` Grupo A + `15` Grupo C) y cada uno de los **179 candidatos de espesor** (`112` Grupo D2 por ficha oficial + `67` Grupo D1 por formato hermano), aplicando la regla de **cero inferencia nominal sin respaldo documental archivado** y **cero propagación ambigua**:

| Ámbito Auditado | Propuestas Iniciales (`RECOVERY-05`) | **Realmente Acreditados para Escritura (`05V`)** | **Reclasificados `DOCUMENTATION_REQUIRED`** | **Retenidos por Conflicto / Ambigüedad (`CONFLICT_HOLD`)** | Artefacto de Certificación |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **1. Espesores por Ficha Oficial / Archivo (`Grupo D2`)** | `112` | **`5`** (`4,46 %`) | **`104`** (`92,86 %`) | **`3`** (`2,68 %`) | [`RECOVERY_05V_MANUFACTURER_EVIDENCE.csv`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/RECOVERY_05V_MANUFACTURER_EVIDENCE.csv) |
| **2. Espesores por Formato Hermano (`Grupo D1`)** | `67` | **`60`** (`89,55 %`) | **`5`** (`7,46 %`) | **`2`** (`2,99 %`) | [`RECOVERY_05V_SIBLING_CALIPER_VALIDATION.csv`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/RECOVERY_05V_SIBLING_CALIPER_VALIDATION.csv) |
| **Subtotal Espesores (`D1 + D2`)** | **`179`** | **`65`** (`36,31 %`) | **`109`** (`60,89 %`) | **`5`** (`2,79 %`) | `60` hermanos unánimes + `5` fichas/ODS archivados |
| **3. Clasificaciones Grupo A (`STRONG_MATCH_REVIEW`)** | `348` | **`176`** (`50,57 %`) | **`172`** (`49,43 %`) | **`0`** (`0,00 %`) | [`RECOVERY_05V_CLASSIFICATION_EVIDENCE.csv`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/RECOVERY_05V_CLASSIFICATION_EVIDENCE.csv) |
| **4. Clasificaciones Grupo C (`AMBIGUOUS_MATCH` Resueltos)** | `15` | **`9`** (`60,00 %`) | **`4`** (`26,67 %`) | **`2`** (`13,33 %`) | [`RECOVERY_05V_CLASSIFICATION_EVIDENCE.csv`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/RECOVERY_05V_CLASSIFICATION_EVIDENCE.csv) |
| **Subtotal Clasificaciones (`A + C`)** | **`363`** | **`185`** (`50,96 %`) | **`176`** (`48,48 %`) | **`2`** (`0,55 %`) | `176` Grupo A + `9` Grupo C |
| **TOTAL OPERACIONES COMBINADAS (`Unión Única`)** | `454` variantes | **`234` variantes únicas**<br>(`185` clasif. + `65` esp., `16` en ambas) | **`285` propuestas reclasificadas** | **`7` propuestas retenidas en conflicto** | [`RECOVERY_05V_PRODUCTION_WRITE_PLAN.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/RECOVERY_05V_PRODUCTION_WRITE_PLAN.md) |

---

## 2. Hallazgos Críticos de la Auditoría Documental `05V`

### 2.1. Validación de las 112 Fichas Oficiales (`RECOVERY_05V_MANUFACTURER_EVIDENCE.csv`)
- **5 variantes acreditadas (`ACCREDITED_FOR_WRITE` con `caliper_confidence_status = 'REFERENCE_IMPORTED'`)**:
  1. `var_3d45d076a5d30a41` (*Munken Print Cream 15 100 72x102 FSC*, SKU `320489`, `150 µm`): acreditado en las dos filas duplicadas del ODS (`#1106` y `#1107`, ambas con `MICRONS=150`) y en la biblioteca técnica archivada `Livonia Spine calculation.xlsx` (Hoja `Papers`, celda `C142 = 150 µm`).
  2. `var_bb96cf7cb403f2da` (*Munken Print White 15 80 102x72 FSC*, SKU `323298`, `120 µm`): acreditado en las dos filas duplicadas del ODS (`#1140` y `#1141`, ambas con `MICRONS=120`) y en `Livonia Spine calculation.xlsx` (celda `C116 = 120 µm`).
  3. `var_872fd511f0e13034` (*MultiArt Gloss 250 64x90*, SKU `88154867`, `193 µm`): acreditado directamente en `Livonia Spine calculation.xlsx` (Tabla *MultiArt Gloss*, cabecera `C55`, fila 63: `B63=250g`, `C63=193 µm`).
  4. `var_967bf7f06ab8238e` (*Munken Polar 200 72x102 FSC*, `226 µm`): acreditado directamente en `Livonia Spine calculation.xlsx` (Tabla *Munken Polar*, cabecera `C175`, fila 181: `B181=200g`, `C181=226 µm`).
  5. `var_c6481e1f258fc492` (*Munken Lynx 400 64x90 FSC*, SKU `328077`, `452 µm`): acreditado por la serie estándar Munken bulk `1.13 cm³/g` en `Livonia Spine calculation.xlsx` (`C199–C208`) y fila ODS `#1178` (`400g = 452 µm`).
- **107 variantes reclasificadas como `DOCUMENTATION_REQUIRED` (y retenidas fuera del lote)**:
  - **98 materiales de recubrimiento / encuadernación** (*Geltex* `44`, *Efalin* `41`, *Wibalin* `9`, *Surbalin* `4`): tienen `MICRONS=0` en el ODS (salvo una contradicción `165 µm` vs `162 µm` en *Efalin Fine Linen* filas `#202` y `#205`), su espesor físico varía según el gofrado (*Fine Linen*, *New Linen*, *Wove*, *Laid*, *Linear*, *Glatt*, *Seda*, *Pizzara*, *Buckram*) y no existe ficha oficial por textura archivada en el repositorio.
  - **6 papeles sin ficha archivada en el repositorio**: *Balance Silk* (`3`), *Munken Kristall* (`2`) y *Serixo 90g* (`1`).
  - **3 papeles con contradicción frente a hermanos existentes en BD**:
    - `var_2f2e2255bb097267` (*IQ print 120 72x102 FSC*): proponía `151 µm`, contradiciendo los 3 hermanos *IQ Print 120g* en BD (`141 µm` y `144 µm`).
    - `var_9f43752a7fdf0360` (*Maestro Print 300 90x64 FSC*): proponía `360 µm`, contradiciendo los 2 hermanos *Maestro Print 300g* en BD (`324 µm` y `346 µm`).
    - `var_fb2766157c634cc2` (*Munken Polar 170 102x72 FSC*): aunque `Spine calculation.xlsx` (`C180`) indica `192 µm`, los hermanos en BD discrepan (`72x102` tiene `192 µm` mientras `90x64` tiene `238 µm`).

### 2.2. Validación de los 67 Formatos Hermanos (`RECOVERY_05V_SIBLING_CALIPER_VALIDATION.csv`)
- **60 variantes aprobadas (`ACCREDITED_SIBLING_PROPAGATION`)**:
  - Verificadas con correspondencia técnica exacta (`misma marca + misma serie/bulk + mismo gramaje`) y **unanimidad del `100 %` en el espesor** de todos los formatos hermanos existentes en producción, documentando el `source_sibling_variant_id`, `source_sibling_ods_row` y `source_sibling_ods_code`.
- **7 propagaciones ambiguas rechazadas (`REJECTED_AMBIGUOUS_PROPAGATION`)**:
  1. `var_e9b970adf34027f1` (*Munken Print White 18 115 72x102 FSC*): **falso hermano detectado**. El producto es **bulk 1.8** (`207 µm`), pero la agrupación previa lo emparejó con *Munken Print White 15* (**bulk 1.5**, `172 µm`).
  2. `var_f30fa00e5c230b37` (*Maestro Print 170 64x90 FSC*): el formato `64x90` tiene conflicto directo de micras en sus dos filas duplicadas del ODS (`#701 = 198 µm` vs `#714 = 204 µm`).
  3. `var_24529f375c1b6341` (*Munken Pure Rough 100 90x64*): el formato destino tiene conflicto de identidad en sus dos filas duplicadas del ODS (`#1189 Matt` vs `#1190 Ofset`).
  4. `4` variantes tintadas de *Rainbow* (`var_303c4d29091a0b5f` *chamois/06*, `var_dadd87b51f6a6a43` *light green 72*, `var_289d4883082e6e4b` *Nr.26 intensive orange*, `var_0dfa098d4381319e` *82 Light Blue 160g*): SKUs de color específicos con `MICRONS=0` en el ODS.

### 2.3. Auditoría de las 363 Clasificaciones (`RECOVERY_05V_CLASSIFICATION_EVIDENCE.csv`)
- **185 variantes acreditadas (`ACCREDITED_FOR_WRITE`)**:
  - **100 variantes `PT_SILK_WITH_GLOSS_PRODUCT_NAME`**: acreditadas por `COAT` explícito en el ODS (`Gloss` / `Krītots`) **y** tabla explícita `coated gloss` en `Livonia Spine calculation.xlsx` (*Galerie Art Gloss* `C31`, *Maxi Gloss* `C19`, *MultiArt Gloss* `C55`, o `COAT=Gloss` literal en *OMNI GLOSS*). (Las `2` variantes de *Omni gloss* donde el ODS sólo ponía `krītots` genérico y `PAPER TYPE=Silk` fueron reclasificadas como `DOCUMENTATION_REQUIRED`).
  - **76 variantes `DOCUMENTED_MILL_FAMILY_RULE` con respaldo en `Livonia Spine calculation.xlsx`**: acreditadas por la combinación de `PAPER TYPE` en el ODS **más** la columna `coating_raw` explícita en `Livonia Spine calculation.xlsx` (*G-Print* `C43 coated matt` `36`, *Maxi Satin* `C19 coated silk` `13`, *Arctic Volume White* `C67 coated matt` `11`, *Galerie Art Matt* `C7 coated matt` `9`, *Galerie Art Silk* `C19 coated silk` `3`, *Munken Print Cream 1.5* `C139 uncoated` `3`, *Munken Print White 1.5* `C115 uncoated` `3`, *Amber Graphic* `C103 uncoated` `2`, *Munken Lynx Rough* `C211 uncoated` `2`, menos las ya contadas).
  - **9 variantes `GROUP_C_DUPLICATE_RESOLVED`**: donde las filas duplicadas del ODS declaran explícitamente el acabado (`nekrītots` / `krītots`) y/o están corroboradas en `Livonia Spine calculation.xlsx` (*Maxi Satin 115*, *Munken Polar 300*, *Munken Print Cream 15 100/115*, *Munken Print White 15 80*, *Munken Pure Rough 90/100/150*, *Efalin Fine Linen 105 Blue*).
- **176 variantes reclasificadas como `DOCUMENTATION_REQUIRED` + 2 retenidas en `CONFLICT_HOLD`**:
  - Todas aquellas filas donde `COAT` estaba vacío en el ODS (o repetía `Dizaina` / código de color) y la familia no figuraba en `Livonia Spine calculation.xlsx` (*Olin Colours/Design*, *Sirio Color*, *IQ Print*, *G-Silk*, *Serixo*, *Efalin*, *Burano*, *Colorit*, *Keaykolour*, *Conqueror*, *Ensocoat*, *MasterBook Extra*, *Maestro Print*, *Munken Kristall*, *Arctic Volume Ice*, *Balance Silk*) han sido reclasificadas como `DOCUMENTATION_REQUIRED` para cumplir la regla: *"No declarar acreditado un acabado únicamente por una inferencia nominal"*.

---

## 3. Estado Proyectado del Catálogo Productivo (`1.524` Variantes) Tras Aplicar el Lote Acreditado `05V`

| Métrica del Catálogo (`1.524` Variantes) | Estado Productivo Actual (Tras `RECOVERY-04`) | Incremento Acreditado en `05V` | Estado Proyectado Tras `05V` |
| :--- | :---: | :---: | :---: |
| **Variantes con Clasificación Técnica Acreditada** | `945` (`943` `04` + `2` verificadas) | **`+185`** | **`1.130` (`74,15 %`)** |
| **Variantes con Espesor (`caliper_um > 0`)** | `1.171` (`76,84 %`) | **`+65`** (`60` D1 + `5` D2) | **`1.236` (`81,10 %`)** |
| **Variantes sin Espesor (`CALIPER_MISSING`)** | `353` (`23,16 %`) | `-65` | **`288` (`18,90 %`)** |
| **Conflictos Históricos de Espesor Preservados** | `9` (`CONFLICT_PRESERVED`) | `0` (Intactos) | **`9` (`CONFLICT_PRESERVED`)** |
| **Variantes `CALIPER_VERIFIED` (Micrómetro en planta)** | `0` | `0` | **`0`** |
| **Modificaciones Ejecutadas en Producción Durante `05V`** | — | **`0` (Sólo Preparación y Auditoría)** | **Sin cambios en vivo** |

