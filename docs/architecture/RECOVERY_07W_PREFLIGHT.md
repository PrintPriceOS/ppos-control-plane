# PAPER-MATERIALS-RECOVERY-07W — Preflight Productivo y Verificación Previa

**Misión:** `PAPER-MATERIALS-RECOVERY-07W`  
**Fecha de ejecución:** `2026-10-29T09:56:01Z` (Fase 2 Preflight) / `2026-10-29T10:00:28Z` (Pre-ejecución Fase 3)  
**Entorno:** Producción para testers — MySQL `Control` (`212.227.79.67`)  
**Repositorio:** `PrintPriceOS/ppos-control-plane`  
**Rama / PR de referencia:** `feat/paper-materials-recovery-05` ([PR #14](https://github.com/PrintPriceOS/ppos-control-plane/pull/14))  
**Commit base autorizado:** `78e313fd11d377ae019b962e3f959251a6db1128`  
**SHA-256 `RECOVERY_07W_SOURCE_VALIDATION.csv`:** `59794f81858c5cd7c11aaea6c9aec252f16ae91883071ef4b2ecd4e7d589f450`  

---

## 1. Resumen de Verificación Previa en Producción (`Control`)

Antes de realizar cualquier escritura en `Control`, se ejecutó la inspección preflight (`preflight_recovery_07w.cjs`) contra MySQL en `212.227.79.67`:

| Control Preflight | Valor Esperado | Valor Verificado en `Control` | Estado |
| :--- | :---: | :---: | :---: |
| Total de variantes (`paper_variants`) | `1.524` | **`1.524`** | `PASS` |
| Total de productos (`paper_products`) | `1.522` | **`1.522`** | `PASS` |
| Variantes con `caliper_um` presente (`> 0`) | `1.236` (`81,10 %`) | **`1.236`** (`81,10 %`) | `PASS` |
| Variantes con `caliper_um IS NULL` | `288` (`18,90 %`) | **`288`** (`18,90 %`) | `PASS` |
| Variantes con `caliper_confidence_status = 'VERIFIED'` | `0` | **`0`** | `PASS` |
| Variantes con `grain_direction != 'UNKNOWN'` | `2` | **`2`** (`1.522 UNKNOWN`) | `PASS` |
| Ofertas comerciales (`supplier_paper_offers`) | `2` | **`2`** | `PASS` |
| 9 conflictos históricos de caliper intactos | `9` (`LIVONIA_REFERENCE_IMPORT`) | **`9`** (`100 % intactos`) | `PASS` |
| Procesos concurrentes de escritura (`SHOW FULL PROCESSLIST`) | `0` | **`0`** | `PASS` |
| Candidatos en `RECOVERY_07V_VERIFIED_FOR_WRITE.csv` | `38` | **`38`** | `PASS` |
| Aprobados en Fase 1 (`EXECUTE_WRITE`) | `<= 38` | **`36`** | `PASS` |
| Excluidos en Fase 1 (`HOLD_DO_NOT_WRITE`) | `>= 0` | **`2`** (*Nevia Plus C1S 80g*, *Priplak Cristal + 0.5 mm*) | `PASS` |
| Compare-and-Swap (`casReady` sobre los 36 aprobados) | `36 / 36` (`0` drifts) | **`36 / 36`** (`casDriftsCount = 0`) | `PASS` |

---

## 2. Verificación del Esquema y Contrato de Columnas en `Control.paper_variants`

Se inspeccionó el esquema real en producción mediante `SHOW COLUMNS FROM paper_variants`:

| Columna | Tipo Real en MySQL `Control` | Nulabilidad | Valor por Defecto |
| :--- | :--- | :---: | :---: |
| `caliper_um` | `decimal(8,2)` | `YES` | `NULL` |
| `caliper_mm` | `decimal(8,4)` | `YES` | `NULL` |
| `bulk_factor` | `decimal(6,4)` | `YES` | `NULL` |
| `caliper_source` | `enum('MEASURED_MICROMETER','MANUFACTURER_DATASHEET','LIVONIA_REFERENCE_IMPORT','SUPPLIER_IMPORT','BULK_DERIVED','NONE')` | `NO` | `'NONE'` |
| `caliper_confidence_status` | `enum('VERIFIED','REFERENCE_IMPORTED','PROVISIONAL_ESTIMATED','MISSING')` | `NO` | `'MISSING'` |
| `caliper_revision` | `int` | `NO` | `1` |

### Alineación semántica con el contrato productivo:
1. **`MANUFACTURER_DATASHEET` (32 variantes)**: El enum exacto del esquema MySQL en producción para fichas técnicas oficiales del fabricante es `'MANUFACTURER_DATASHEET'`. En combinación con `caliper_confidence_status = 'REFERENCE_IMPORTED'`, el motor `spineCalculationEngine.js` mantiene `canReleaseToManufacturing = false` (bloqueo industrial activo hasta que exista medición física `VERIFIED` y perfil `PRODUCTION_CERTIFIED`).
2. **`LIVONIA_REFERENCE_IMPORT` (1 variante)**: Aplicado a `var_e9b970adf34027f1` (*Munken Print White 18 115 72x102 FSC*, `209 µm` en celda `R39` de `Spine calculation.xlsx`), manteniendo `caliper_confidence_status = 'REFERENCE_IMPORTED'`.
3. **`SUPPLIER_IMPORT` (3 variantes)**: Aplicado a los 3 formatos hermanos equivalentes (`var_6c9d63c6a90f9071` *GALERIE FINE gloss 80 64x90*, `var_ef95d9c7874f1e50` *Maxima Volume 150 102x72 FSC*, `var_015ca99a30bee286` *PrintSpeed Laser Jet 120g 45x32*) cuyas variantes hermanas de origen tienen celdas dedicadas `E` (`microns`) y `F` (`thicknessMm`) explícitas en el ODS original.

---

## 3. Estado Previo de los 9 Conflictos Históricos Protegidos

| `variant_id` | `product_id` | GSM | Formato (mm) | `caliper_um` | `caliper_source` | `caliper_confidence_status` |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| `var_06e1d1681e4f0989` | `prod_72b5e76aa0df7649` | `100` | `1000 x 700` | `122.00` | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` |
| `var_2b0314c68f5a97c7` | `prod_a27d47908f901b95` | `100` | `640 x 900` | `122.00` | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` |
| `var_4178aecbfa53dcf8` | `prod_19ca6886f8baaa1f` | `100` | `720 x 1020` | `122.00` | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` |
| `var_5f5cae75e6f45671` | `prod_01c9fd26bc8ff592` | `100` | `640 x 900` | `122.00` | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` |
| `var_7b7e3a2a2a4a0313` | `prod_12f82e39a83476b0` | `100` | `700 x 1000` | `122.00` | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` |
| `var_9dabfd7ac5eff6ca` | `prod_616b80e9547b4710` | `100` | `640 x 900` | `122.00` | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` |
| `var_ae7dbf443ceab19a` | `prod_84ba0341e4484d95` | `250` | `460 x 640` | `225.00` | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` |
| `var_c699e6a51cd6b41f` | `prod_9bf99148db05ff34` | `100` | `700 x 1000` | `122.00` | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` |
| `var_e2f2e68304e9d4a1` | `prod_7233640445d4455d` | `250` | `640 x 900` | `225.00` | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` |

---

## 4. Checksums de Tablas Antes de la Ejecución

| Tabla en `MySQL Control` | Checksum Pre-Ejecución |
| :--- | :---: |
| `Control.paper_products` | `1734492320` |
| `Control.paper_variants` | `2275212512` |
| `Control.supplier_paper_offers` | `3737849396` |
| `Control.paper_technical_caliper_reference` | `2847849606` |
| `Control.paper_caliper_reconciliation_candidates` | `3402454981` |
| `Control.paper_products_backup_rec06_20261028` | `1734492320` |
| `Control.paper_variants_backup_rec06_20261028` | `4286290315` |
