# ORDEN PAPER-MATERIALS-RECOVERY-06 — Registro de Ejecución Transaccional e Idempotencia (Fase 3)

**Proyecto:** PrintPrice OS  
**Entorno:** Producción — MySQL `Control` (`212.227.79.67`)  
**Commit de Referencia:** `35b39aa2b97c59fc584f9c54bbeb1d40275638b9`  
**Inicio de Ejecución:** `2026-10-28T23:02:49.203Z`  
**Fin de Ejecución:** `2026-10-28T23:02:50.544Z`  
**Diff Completo Antes/Después (`234` filas):** [`docs/architecture/RECOVERY_06_BEFORE_AFTER.csv`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/RECOVERY_06_BEFORE_AFTER.csv)

---

## 1. Resumen de Pasada 1 (`PASS_1_SELECTIVE_234_UPDATE`) y Pasada 2 (`PASS_2_IDEMPOTENCY_VERIFICATION`)

La actualización se ejecutó en **5 lotes transaccionales pequeños** (`<= 50` variantes por lote), bloqueando cada fila mediante `SELECT ... FOR UPDATE` y aplicando cláusulas `WHERE` Compare-and-Swap (`grain_direction` e `IFNULL(caliper_um, -1)`):

| Métrica de Ejecución | Pasada 1 (`PASS_1_SELECTIVE_234_UPDATE`) | Pasada 2 (`PASS_2_IDEMPOTENCY_VERIFICATION`) | Estado |
| :--- | :---: | :---: | :---: |
| **Variantes únicas evaluadas** | `234` | `234` | `PASS` |
| **Variantes modificadas en BD (`paper_variants`)** | **`234`** | **`0`** | `PASS` |
| **Clasificaciones técnicas aplicadas (`176` Grupo A + `9` Grupo C)** | **`185`** | **`0`** | `PASS` |
| **Productos actualizados (`paper_products`)** | **`185`** (`0` compartidos) | **`0`** | `PASS` |
| **Espesores totales aplicados (`paper_variants.caliper_um`)** | **`65`** | **`0`** | `PASS` |
| — *Desglose D1 (Formatos hermanos equivalentes)* | **`60`** | **`0`** | `PASS` |
| — *Desglose D2 (Fuentes técnicas archivadas)* | **`5`** | **`0`** | `PASS` |
| **Variantes omitidas por idempotencia (`skippedIdempotent`)** | `0` | **`234`** (`100 %`) | `PASS` |
| **Variantes modificadas fuera del conjunto de 234** | **`0`** | **`0`** | `PASS` |

---

## 2. Desglose por Lote Transaccional (`BATCH_SIZE = 50`)

| Pasada | Lote # | Variantes en Lote | Clasificaciones Aplicadas | Productos Actualizados | Espesores Aplicados | Omitidas Idempotentes | Estado de Transacción |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`PASS_1`** | Lote 1 | `50` | `50` | `50` | `2` | `0` | `COMMITTED` |
| **`PASS_1`** | Lote 2 | `50` | `50` | `50` | `2` | `0` | `COMMITTED` |
| **`PASS_1`** | Lote 3 | `50` | `50` | `50` | `3` | `0` | `COMMITTED` |
| **`PASS_1`** | Lote 4 | `50` | `35` | `35` | `24` | `0` | `COMMITTED` |
| **`PASS_1`** | Lote 5 | `34` | `0` | `0` | `34` | `0` | `COMMITTED` |
| **Subtotal `PASS_1`** | **5 lotes** | **`234`** | **`185`** | **`185`** | **`65`** *(16 solapadas)* | **`0`** | **`100 % COMMITTED`** |
| **`PASS_2` (Idempotencia)** | Lotes 1–5 | `234` | **`0`** | **`0`** | **`0`** | **`234`** | **`0` escrituras adicionales** |

---

## 3. Cumplimiento de Reglas de Gobernanza en Fase 3

1. **Trazabilidad y Confianza de Espesor (`caliper_confidence_status`)**:
   - Las `65` variantes con espesor recuperado recibieron `caliper_source = 'SUPPLIER_IMPORT'` y `caliper_confidence_status = 'REFERENCE_IMPORTED'`.
   - **Cero variantes** recibieron `VERIFIED` automáticamente (`verifiedCaliperCount = 0`).
   - En `metadata_json.ods_caliper_recovery_06` quedó registrada la procedencia exacta (`recovery_sub_group`, `source_sibling_variant_id`, `source_sibling_ods_row`, `source_sibling_ods_code`, `evidence_reference`) junto con la nota explícita de gobernanza: `"Livonia technical reference / ODS sibling import (REFERENCE_IMPORTED, not official mill certification)"`.
2. **Conservación Estricta de los 9 Conflictos Históricos de Espesor**:
   - Ninguno de los 9 valores de espesor en conflicto (`LIVONIA_REFERENCE_IMPORT`: `5` *Amber Graphic 100* = `122.00 µm` y `4` *Galerie Art Matt 250* = `225.00 µm`) fue modificado.
   - Una de esas 9 variantes (`var_ae7dbf443ceab19a`, *Galerie Art Matt 250 46x64 FSC*) formaba parte de las `176` clasificaciones acreditadas del Grupo A: su acabado se actualizó limpiamente de `SILK` a `MATT` mientras su espesor histórico (`225.00 µm`, `LIVONIA_REFERENCE_IMPORT`, `REFERENCE_IMPORTED`) permaneció `100 %` intacto.
3. **Invarianza de Grano, Dimensiones y Precios Comerciales**:
   - `invariantViolationsCount = 0` en las `1.524` variantes para `product_id`, `gsm`, `width_mm`, `height_mm`, `is_reel`, `grain_direction` y `fingerprint`.
   - `CHECKSUM TABLE Control.supplier_paper_offers` permaneció invariante en `3737849396`.

