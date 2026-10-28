# MISIÓN PAPER-MATERIALS-RECOVERY-05V — Reconciliación Determinista de Conflictos de Espesor y Estado Productivo

**Proyecto:** PrintPrice OS  
**Repositorio:** `PrintPriceOS/ppos-control-plane`  
**Base de Datos Productiva Referenciada:** MySQL `Control` (`212.227.79.67`, sólo lectura / auditoría documental)  
**Fecha de Certificación:** 2026-10-28  

---

## 1. Reconciliación Exacta de las 1.524 Variantes en MySQL `Control`

De acuerdo con la Sección 3 de la orden de misión `PAPER-MATERIALS-RECOVERY-05V`, se presenta el desglose íntegro, mutuamente excluyente y exhaustivo de las **1.524 variantes activas** en `paper_material_variants` según su estado real de espesor (`caliper_um`, `caliper_source`, `caliper_confidence_status`) y su cruce con `paper_caliper_reconciliation_candidates`:

| Categoría de Estado de Espesor | Total Variantes | `%` Catálogo | Desglose por Origen / Subcategoría en Base de Datos (`Control`) | Acción Gobernada en `05V` |
| :--- | :---: | :---: | :--- | :--- |
| **`CALIPER_REFERENCE_IMPORTED`** (Sin conflicto) | **1.162** | `76,25 %` | `caliper_um > 0`, `caliper_source = 'SUPPLIER_IMPORT'`, `caliper_confidence_status = 'REFERENCE_IMPORTED'` (recuperados desde `Paper data base.ods.zip` en `RECOVERY-02` con `SAFE_UNIQUE_MATCH`). | **Preservar intactos** (protegidos por guarda CAS). |
| **`CALIPER_PRESENT_SOURCE_CONFLICT`** (Históricos preservados) | **9** | `0,59 %` | `caliper_um > 0`, `caliper_source = 'LIVONIA_REFERENCE_IMPORT'`, `caliper_confidence_status = 'REFERENCE_IMPORTED'`, registrados en `paper_caliper_reconciliation_candidates` con `reconciliation_status = 'CONFLICT_PRESERVED'` por discrepancia frente al ODS. | **Prohibido sobrescribir**. Se mantienen congelados hasta medición física con micrómetro en planta. |
| **`CALIPER_VERIFIED`** (Verificados físicamente en planta) | **0** | `0,00 %` | `caliper_confidence_status = 'VERIFIED'` (`0` filas; ninguna variante ha sido aún certificada con micrómetro físico en planta ni por lote recibido). | **Reservar estado `VERIFIED`** exclusivamente para medición física / ficha firmada por lote. |
| **`CALIPER_MISSING`** (Sin espesor en BD: `caliper_um IS NULL`) | **353** | `23,16 %` | • **337 variantes** `UNMATCHED` (`MICRONS = 0` o vacío en el ODS original).<br>• **16 variantes** `AMBIGUOUS_MATCH` (2 filas duplicadas en el ODS compartiendo `(nombre, gsm, ancho, alto)`). | **65 acreditados** (`60` formato hermano + `5` ficha/ODS archivado); **288 retenidos** (`DOCUMENTATION_REQUIRED` / `CONFLICT_HOLD`). |
| **TOTAL CATÁLOGO PRODUCTIVO** | **1.524** | **`100,00 %`** | **1.171 con espesor (`1.162` + `9`)** · **353 sin espesor (`caliper_um IS NULL`)** | **Cero escrituras sin aprobación explícita.** |

---

## 2. Detalle Individualizado de los 9 Conflictos Históricos (`CALIPER_PRESENT_SOURCE_CONFLICT`)

Durante `PAPER-CALIPER-RECOVERY-02`, estas **9 variantes** ya poseían en producción un espesor procedente de la importación de referencia técnica Livonia (`caliper_source = 'LIVONIA_REFERENCE_IMPORT'`). Al conciliar contra `Paper data base.ods.zip`, se detectó que el archivo ODS del proveedor declaraba un valor distinto en micrómetros. Siguiendo la regla de no sobrescritura destructiva, se preservaron los valores existentes en `paper_material_variants` y se registraron en `paper_caliper_reconciliation_candidates` como `CONFLICT_PRESERVED`:

| # | `variant_id` | `product_id` | Producto / Variante | GSM | Formato (`mm`) | Caliper en BD (`LIVONIA_REFERENCE_IMPORT`) | Caliper en ODS (`Paper data base.ods.zip`) | Fila ODS y SKU | Delta (`ODS - BD`) | Estado y Regla de Protección |
| :-: | :--- | :--- | :--- | :-: | :---: | :---: | :---: | :--- | :---: | :--- |
| 1 | `var_2b0314c68f5a97c7` | `prod_7ccfc379634bf296` | **Amber Graphic 100 100x70 FSC** | 100 | `1000x700` | **`122 µm`** (bulk `1.22`) | `119 µm` (bulk `1.19`) | Fila `#15` (`412490`) | `-3 µm` | `CONFLICT_PRESERVED` — **No sobrescribir** |
| 2 | `var_7b7e3a2a2a4a0313` | `prod_267809e5490b3056` | **Amber Graphic 100 64x90 FSC** | 100 | `640x900` | **`122 µm`** (bulk `1.22`) | `119 µm` (bulk `1.19`) | Fila `#16` (`412475`) | `-3 µm` | `CONFLICT_PRESERVED` — **No sobrescribir** |
| 3 | `var_4178aecbfa53dcf8` | `prod_15a0c41388f9e9bd` | **Amber Graphic 100 70x100 FSC** | 100 | `700x1000` | **`122 µm`** (bulk `1.22`) | `119 µm` (bulk `1.19`) | Fila `#17` (`412485`) | `-3 µm` | `CONFLICT_PRESERVED` — **No sobrescribir** |
| 4 | `var_c699e6a51cd6b41f` | `prod_6413b007dc8c97cf` | **Amber Graphic 100 72x102 FSC** | 100 | `720x1020` | **`122 µm`** (bulk `1.22`) | `119 µm` (bulk `1.19`) | Fila `#18` (`412498`) | `-3 µm` | `CONFLICT_PRESERVED` — **No sobrescribir** |
| 5 | `var_5f5cae75e6f45671` | `prod_9bfabbb659b5c510` | **Amber Graphic 100 90x64 FSC** | 100 | `900x640` | **`122 µm`** (bulk `1.22`) | `119 µm` (bulk `1.19`) | Fila `#19` (`412476`) | `-3 µm` | `CONFLICT_PRESERVED` — **No sobrescribir** |
| 6 | `var_c28fd29bf014d9f1` | `prod_6f5d5721453cb631` | **Galerie Art Matt 250 100x70 FSC** | 250 | `1000x700` | **`225 µm`** (bulk `0.90`) | `257 µm` (bulk `1.03`) | Fila `#462` (`3888`) | `+32 µm` | `CONFLICT_PRESERVED` — **No sobrescribir** |
| 7 | `var_9dabfd7ac5eff6ca` | `prod_7aa453543b8c04d3` | **Galerie Art Matt 250 64x90 FSC** | 250 | `640x900` | **`225 µm`** (bulk `0.90`) | `257 µm` (bulk `1.03`) | Fila `#463` (`3880`) | `+32 µm` | `CONFLICT_PRESERVED` — **No sobrescribir** |
| 8 | `var_06e1d1681e4f0989` | `prod_2ca216143ddac217` | **Galerie Art Matt 250 70x100 FSC** | 250 | `700x1000` | **`225 µm`** (bulk `0.90`) | `257 µm` (bulk `1.03`) | Fila `#464` (`3886`) | `+32 µm` | `CONFLICT_PRESERVED` — **No sobrescribir** |
| 9 | `var_e2f2e68304e9d4a1` | `prod_01c87aa058f3cf78` | **Galerie Art Matt 250 72x102 FSC** | 250 | `720x1020` | **`225 µm`** (bulk `0.90`) | `257 µm` (bulk `1.03`) | Fila `#465` (`3890`) | `+32 µm` | `CONFLICT_PRESERVED` — **No sobrescribir** |

---

## 3. Nuevos Conflictos y Discrepancias Detectados en la Auditoría `05V` (`CALIPER_MISSING` Reclasificados / Retenidos)

Además de los 9 conflictos históricos con espesor ya presente en base de datos, la validación individualizada de los `179` candidatos de espesor de `RECOVERY-05` (`112` de ficha oficial D2 + `67` de formato hermano D1) identificó **10 variantes con conflicto técnico o contradicción entre fuentes**, que han sido **excluidas del lote de escritura** y reclasificadas:

| # | `variant_id` | Producto / Variante | Grupo Origen | Caliper Propuesto en `05` | Conflicto / Discrepancia Detectada en `05V` | Veredicto `05V` |
| :-: | :--- | :--- | :---: | :---: | :--- | :--- |
| 1 | `var_e9b970adf34027f1` | **Munken Print White 18 115 72x102 FSC** | `D1` (Hermano) | `172 µm` | **Conflicto de serie/bulk**: El producto es **Munken Print White 18** (bulk `1.8 cm³/g` $\to$ `207 µm` en `Spine calculation.xlsx` celda `C128`), pero el extractor nominal lo emparejó con hermanos *Munken Print White 15* (bulk `1.5 cm³/g` $\to$ `172 µm`). | `REJECTED_BULK_SERIES_MISMATCH` (`DOCUMENTATION_REQUIRED`) |
| 2 | `var_f30fa00e5c230b37` | **Maestro Print 170 64x90 FSC** | `D1` (Hermano) / `C` | `198 µm` | **Conflicto directo en filas duplicadas ODS**: El formato `64x90` tiene dos filas en el ODS con micras contradictorias: Fila `#701` (`198 µm`) vs Fila `#714` (`204 µm`). Prohibido puentear el conflicto propagando desde `70x100`. | `REJECTED_TARGET_HAS_CONFLICTING_ODS_MICRONS` (`CONFLICT_HOLD`) |
| 3 | `var_24529f375c1b6341` | **Munken Pure Rough 100 90x64** | `D1` (Hermano) / `C` | `140 µm` | **Conflicto de identidad en filas duplicadas ODS**: Fila `#1189` (`PAPER TYPE=Matt`, `COAT=nekrītots`) vs Fila `#1190` (`PAPER TYPE=Ofset`, `COAT=<EMPTY>`). | `REJECTED_TARGET_IDENTITY_CONFLICT` (`CONFLICT_HOLD`) |
| 4 | `var_fb2766157c634cc2` | **Munken Polar 170 102x72 FSC** | `D2` (Ficha) | `192 µm` | **Conflicto entre hermanos en BD**: Mientras `Spine calculation.xlsx` (`C180`) y el hermano `72x102` (`var_e5266df3a9742388`) tienen `192 µm`, el hermano `90x64` (`var_21e0a46260d18881`, ODS Fila `#1067`) tiene `238 µm` en BD. | `DOCUMENTATION_REQUIRED` (`CONFLICT_HOLD`) |
| 5 | `var_2f2e2255bb097267` | **IQ print 120 72x102 FSC** | `D2` (Ficha) | `151 µm` | **Contradicción con hermanos en BD**: El valor propuesto (`151 µm`) contradice los 3 formatos hermanos *IQ Print 120g* en BD (`64x90`: `144 µm`, `90x64`: `144 µm`, `88x63`: `141 µm`, Filas ODS `#634–#637`). | `DOCUMENTATION_REQUIRED` (`CONFLICT_HOLD`) |
| 6 | `var_9f43752a7fdf0360` | **Maestro Print 300 90x64 FSC** | `D2` (Ficha) | `360 µm` | **Contradicción con hermanos en BD**: El valor propuesto (`360 µm`) contradice los 2 formatos hermanos *Maestro Print 300g* en BD (`102x72`: `324 µm` en Fila `#725` vs `72x102`: `346 µm` en Fila `#726`). | `DOCUMENTATION_REQUIRED` (`CONFLICT_HOLD`) |
| 7 | `var_303c4d29091a0b5f` | **Rainbow 120g 920x650 R chamois/06** | `D1` (Hermano) | `159 µm` | **Variante tintada específica (`chamois/06`)** con `MICRONS=0` en ODS Fila `#1412`; no se propaga desde SKU genérico sin verificación por color. | `REJECTED_COLOR_DYED_SKU_VARIANCE` (`DOCUMENTATION_REQUIRED`) |
| 8 | `var_dadd87b51f6a6a43` | **Rainbow 120g 92x65 light green 72** | `D1` (Hermano) | `159 µm` | **Variante tintada específica (`light green 72`)** con `MICRONS=0` en ODS Fila `#1414`. | `REJECTED_COLOR_DYED_SKU_VARIANCE` (`DOCUMENTATION_REQUIRED`) |
| 9 | `var_289d4883082e6e4b` | **Rainbow 120g 92x65, Nr.26 intensive orange** | `D1` (Hermano) | `159 µm` | **Variante tintada específica (`Nr.26 intensive orange`)** con `MICRONS=0` en ODS Fila `#1415`. | `REJECTED_COLOR_DYED_SKU_VARIANCE` (`DOCUMENTATION_REQUIRED`) |
| 10 | `var_0dfa098d4381319e` | **Rainbow 82 Light Blue 160g 45x64** | `D1` (Hermano) | `214 µm` | **Variante tintada específica (`82 Light Blue`)** con `MICRONS=0` en ODS Fila `#1419`. | `REJECTED_COLOR_DYED_SKU_VARIANCE` (`DOCUMENTATION_REQUIRED`) |

