# PAPER-MATERIALS-RECOVERY-07W — Informe Final de Ejecución Productiva

**Misión:** `ORDEN PAPER-MATERIALS-RECOVERY-07W — Aplicación productiva controlada de hasta 38 espesores`  
**Proyecto:** PrintPrice OS  
**Entorno:** Producción — MySQL `Control` (`212.227.79.67`)  
**Repositorio:** `PrintPriceOS/ppos-control-plane` ([PR #14](https://github.com/PrintPriceOS/ppos-control-plane/pull/14))  
**Commit base autorizado:** `78e313fd11d377ae019b962e3f959251a6db1128`  
**Fecha de cierre:** `2026-10-29T10:02:21Z`  
**Veredicto:** **`RECOVERY_07W_PARTIAL` (`36 de 38` variantes aplicadas; `2` excluidas preventivamente en Fase 1 por rigor de celda dedicada)**  

---

## 1. Resumen Ejecutivo

Siguiendo estrictamente las 5 fases de la orden **`PAPER-MATERIALS-RECOVERY-07W`**:

1. **Fase 1 (Verificación final de fuentes primarias antes de escribir)**:
   - Se descargaron e inspeccionaron directamente los **11 archivos PDF primarios** correspondientes a las **32 variantes** respaldadas por fichas técnicas de fabricante (`Munken_Kristall.pdf`, `Invercote_G.pdf`, `Incada_Silk_EBB.pdf`, `Incada_Silk_Igepa.pdf`, `CrownBoard_Craft.pdf`, `PERGRAPHICA_Rough.pdf`, `Umka_Color_GD2.pdf`, `Favini_Burano_EN.pdf`, `Favini_Burano_Range.pdf`, `Favini_Burano_Nero.pdf`, `Curious_Metallics.pdf`), verificando HTTP `200`, cabecera `%PDF-`, fecha/revisión y coordenadas exactas de página, tabla, fila y columna.
   - Se verificó la coordenada exacta en `Spine calculation.xlsx` para **1 variante** Livonia (`var_e9b970adf34027f1`, *Munken Print White 18 115 72x102 FSC*: hoja `Papers`, bloque `#24`, cabecera `P31` con bulk `1.8`, celda GSM `P39 = 115`, celda micras **`R39 = 209`** $\to$ `209 µm`).
   - Se verificaron las celdas dedicadas de espesor `E` (`microns`) y `F` (`thicknessMm`) en `Paper data base.ods.zip` para las **3 variantes de formato hermano** (`var_6c9d63c6a90f9071` *GALERIE FINE gloss 80 64x90* $\leftarrow$ `E522="65"`, `var_ef95d9c7874f1e50` *Maxima Volume 150 102x72 FSC* $\leftarrow$ `E885="162"`, `var_015ca99a30bee286` *PrintSpeed Laser Jet 120g 45x32* $\leftarrow$ `E1399="133"`).
   - **Exclusión preventiva de 2 variantes en Fase 1**: Al aplicar la instrucción explícita de Fase 1 (*"Confirmar específicamente que Nevia Plus y Priplak Cristal tienen un valor de espesor explícito, no solamente una mención comercial del producto"*), se comprobó que en `Paper data base.ods.zip` las celdas dedicadas de espesor para `var_dbd5357075534e3b` (*Nevia Plus C1S 80g 71my 52X72cm*, fila `#1220`/`1224`) y `var_737c9a59216f4bf2` (*Priplak Cristal + 0.5 mm 72x102 Transparent*, fila `#1399`/`1403`) son **`E1224 = "0"`, `F1224 = "0"`** y **`E1403 = "0"`, `F1403 = "0"`**, apareciendo `"71my"` y `"0.5 mm"` únicamente embebidos en el nombre comercial (`C1224` y `C1403`). En consecuencia, ambas fueron excluidas (`HOLD_DO_NOT_WRITE`) y permanecen en `DOCUMENTATION_REQUIRED`.

2. **Fase 2 (Preflight productivo en MySQL `Control`)**:
   - Se verificaron en vivo `1.524` variantes totales, `1.236` con espesor (`81,10 %`), `288` sin espesor (`18,90 %`), `9` conflictos históricos intactos, `0` escrituras concurrentes y `36/36` candidatos aptos para Compare-and-Swap (`casDriftsCount = 0`).
   - Se verificó el contrato exacto del enum `paper_variants.caliper_source` en MySQL `Control`: `enum('MEASURED_MICROMETER','MANUFACTURER_DATASHEET','LIVONIA_REFERENCE_IMPORT','SUPPLIER_IMPORT','BULK_DERIVED','NONE')`.

3. **Fase 3 (Backup completo y actualización transaccional controlada de las 36 variantes)**:
   - Se creó la tabla de respaldo `Control.paper_variants_backup_rec07w_20261029` (`1.524` filas, checksum `2275212512`) y los artefactos privados en `/opt/printprice-os/backups/paper-materials-recovery-07w/` (`full_catalog_1524_pre_rec07w.json`, `target_36_variants_pre_rec07w.json`, `rollback_paper_materials_recovery_07w_36.sql`).
   - Se aplicó la actualización transaccional sobre las **36 variantes** (`32` con `caliper_source = 'MANUFACTURER_DATASHEET'`, `1` con `LIVONIA_REFERENCE_IMPORT`, `3` con `SUPPLIER_IMPORT`; todas con `caliper_confidence_status = 'REFERENCE_IMPORTED'`).
   - La segunda pasada de idempotencia (`PASS_2_IDEMPOTENCY_VERIFICATION`) produjo **`0` escrituras adicionales** (`skippedIdempotent = 36`).

4. **Fase 4 (Validación productiva y E2E en navegador)**:
   - Cobertura acumulada de espesores en producción: **`1.272 / 1.524` variantes (`83,46 %`)**, quedando **`252` variantes sin espesor (`16,54 %`)**.
   - `0` cambios en `paper_products` (checksum `1734492320` intacto), `0` cambios en `supplier_paper_offers` (checksum `3737849396` intacto), `0` cambios en clasificaciones técnicas ni `grain_direction`, `0` cambios en los 9 conflictos históricos, `0` variantes promovidas a `VERIFIED`, bloqueo industrial activo (`canReleaseToManufacturing = false`) y deriva BPE de **`0,00 €`** (`2.169,88 EUR`).

---

## 2. Balance Cuantitativo de `RECOVERY-07W` y Evolución del Catálogo

| Métrica | Antes de `RECOVERY-07W` (Post-`06`) | Cambio en `RECOVERY-07W` | Después de `RECOVERY-07W` | % sobre `1.524` |
| :--- | :---: | :---: | :---: | :---: |
| **Total de variantes (`paper_variants`)** | `1.524` | `0` | **`1.524`** | `100,00 %` |
| **Total de productos (`paper_products`)** | `1.522` | `0` | **`1.522`** | — |
| **Variantes con espesor (`caliper_um > 0`)** | `1.236` | **`+36`** | **`1.272`** | **`83,46 %`** |
| **Variantes sin espesor (`caliper_um IS NULL`)** | `288` | **`-36`** | **`252`** | **`16,54 %`** |
| — `caliper_source = 'SUPPLIER_IMPORT'` (`REFERENCE_IMPORTED`) | `1.227` | `+3` | **`1.230`** | `80,71 %` |
| — `caliper_source = 'MANUFACTURER_DATASHEET'` (`REFERENCE_IMPORTED`) | `0` | `+32` | **`32`** | `2,10 %` |
| — `caliper_source = 'LIVONIA_REFERENCE_IMPORT'` (`REFERENCE_IMPORTED`) | `9` | `+1` | **`10`** | `0,66 %` |
| — `caliper_source = 'NONE'` (`MISSING`) | `288` | `-36` | **`252`** | `16,54 %` |
| **Variantes con `caliper_confidence_status = 'VERIFIED'`** | `0` | `0` | **`0`** | `0,00 %` |
| **Conflictos históricos protegidos** | `9` | `0` | **`9`** | `100 % intactos` |

---

## 3. Detalle de las 2 Variantes Excluidas de las 38 Propuestas de `RECOVERY-07V`

| `variant_id` | Producto | GSM | Valor Propuesto en `07V` | Motivo de Exclusión en Fase 1 (`RECOVERY-07W`) | Estado Final en `Control` |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `var_dbd5357075534e3b` | *Nevia Plus C1S 80g 71my 52X72cm* | `80` | `71 µm` | En `Paper data base.ods.zip` (`sourceRow #1220`, `fileRowNumber 1224`), las celdas dedicadas de espesor son **`E1224 = "0"`** (`microns`) y **`F1224 = "0"`** (`thicknessMm`). El texto `"71my"` figura únicamente dentro del nombre comercial `C1224` sin ficha técnica PDF independiente del fabricante. | `caliper_um = NULL`, `caliper_source = 'NONE'`, `MISSING` (`DOCUMENTATION_REQUIRED`) |
| `var_737c9a59216f4bf2` | *Priplak Cristal + 0.5 mm 72x102 Transparent* | `455` | `500 µm` | En `Paper data base.ods.zip` (`sourceRow #1399`, `fileRowNumber 1403`), las celdas dedicadas de espesor son **`E1403 = "0"`** (`microns`) y **`F1403 = "0"`** (`thicknessMm`). El texto `"0.5 mm"` figura únicamente dentro del nombre comercial `C1403` sin ficha técnica PDF archivada de Priplak Cristal. | `caliper_um = NULL`, `caliper_source = 'NONE'`, `MISSING` (`DOCUMENTATION_REQUIRED`) |

---

## 4. Entregables Generados y Versionados en `docs/architecture/`

1. [`docs/architecture/RECOVERY_07W_PREFLIGHT.md`](RECOVERY_07W_PREFLIGHT.md)
2. [`docs/architecture/RECOVERY_07W_SOURCE_VALIDATION.csv`](RECOVERY_07W_SOURCE_VALIDATION.csv)
3. [`docs/architecture/RECOVERY_07W_BACKUP_MANIFEST.md`](RECOVERY_07W_BACKUP_MANIFEST.md)
4. [`docs/architecture/RECOVERY_07W_EXECUTION_LOG.md`](RECOVERY_07W_EXECUTION_LOG.md)
5. [`docs/architecture/RECOVERY_07W_BEFORE_AFTER.csv`](RECOVERY_07W_BEFORE_AFTER.csv)
6. [`docs/architecture/RECOVERY_07W_SPINE_BPE_E2E.md`](RECOVERY_07W_SPINE_BPE_E2E.md)
7. [`docs/architecture/RECOVERY_07W_FINAL_REPORT.md`](RECOVERY_07W_FINAL_REPORT.md)

*(Los archivos de backup privados permanecen fuera del repositorio Git en `/opt/printprice-os/backups/paper-materials-recovery-07w/`, y la nota `SECURITY_ROTATION_PENDING` se mantiene abierta).*
