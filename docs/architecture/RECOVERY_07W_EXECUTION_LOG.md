# PAPER-MATERIALS-RECOVERY-07W — Log de Ejecución Transaccional e Idempotencia

**Misión:** `PAPER-MATERIALS-RECOVERY-07W`  
**Inicio de ejecución:** `2026-10-29T10:00:28.586Z`  
**Fin de ejecución:** `2026-10-29T10:00:29.084Z`  
**Duración total:** `498 ms`  
**Entorno:** MySQL `Control` (`212.227.79.67`)  
**Commit base autorizado:** `78e313fd11d377ae019b962e3f959251a6db1128`  
**Matriz validada Fase 1:** `RECOVERY_07W_SOURCE_VALIDATION.csv` (`SHA-256: 59794f81858c5cd7c11aaea6c9aec252f16ae91883071ef4b2ecd4e7d589f450`)  

---

## 1. Resumen de Candidatos Evaluados (38 de `RECOVERY-07V` $\to$ 36 Aplicados, 2 Excluidos)

| Concepto | Cantidad | Detalle |
| :--- | :---: | :--- |
| Total en `RECOVERY_07V_VERIFIED_FOR_WRITE.csv` | `38` | Candidatos procedentes de `RECOVERY-07V`. |
| **Excluidos en Fase 1 (`HOLD_DO_NOT_WRITE`)** | **`2`** | `var_dbd5357075534e3b` (*Nevia Plus C1S 80g 71my 52X72cm*, fila ODS `#1220`/`1224`) y `var_737c9a59216f4bf2` (*Priplak Cristal + 0.5 mm 72x102 Transparent*, fila ODS `#1399`/`1403`): las celdas dedicadas de espesor `E` (`microns`) y `F` (`thicknessMm`) en `Paper data base.ods.zip` contienen `"0"` y el espesor solo aparece en el texto comercial `C1224` / `C1403`. |
| **Aprobados y Actualizados en Fase 3 (`EXECUTE_WRITE`)** | **`36`** | `32` por fichas oficiales de fabricante descargadas y verificadas en PDF (`MANUFACTURER_DATASHEET`), `1` por referencia explícita en celda `R39` de `Spine calculation.xlsx` (`LIVONIA_REFERENCE_IMPORT`), y `3` por formatos hermanos con celdas dedicadas `E` y `F` verificadas en el ODS (`SUPPLIER_IMPORT`). |

---

## 2. Ejecución de Pasada 1 (`PASS_1_SELECTIVE_36_CALIPER_UPDATE`)

Cada una de las 36 variantes fue bloqueada con `SELECT ... FOR UPDATE` y actualizada dentro de una transacción atómica mediante Compare-and-Swap (`WHERE id = ? AND grain_direction = ? AND (caliper_um IS NULL OR caliper_um <= 0)`):

| Métrica de Pasada 1 | Resultado |
| :--- | :---: |
| `totalChecked` | `36` |
| **`calipersApplied`** | **`36`** |
| `datasheetApplied` (`caliper_source = 'MANUFACTURER_DATASHEET'`, `caliper_confidence_status = 'REFERENCE_IMPORTED'`) | `32` |
| `livoniaApplied` (`caliper_source = 'LIVONIA_REFERENCE_IMPORT'`, `caliper_confidence_status = 'REFERENCE_IMPORTED'`) | `1` |
| `siblingApplied` (`caliper_source = 'SUPPLIER_IMPORT'`, `caliper_confidence_status = 'REFERENCE_IMPORTED'`) | `3` |
| `skippedIdempotent` | `0` |

### Desglose de las 36 variantes actualizadas:
- **Favini Burano Pastel & Bright (13 variantes)**:
  - `140 g/m²` $\to$ **`170 µm`** (`0.1700 mm`, bulk `1.2143`): `var_13b509db7a5a7451`, `var_e4f82edf80f8012b`, `var_939baa2efe3449cb`, `var_91206d683ff22395`, `var_3cbab58b9d9dd650`, `var_6a31a00f77eac78d`, `var_5f887ec026691b8a`, `var_d11c0801ff7755b5`, `var_00efa33b21795f15`, `var_1c7627f955b5448a`, `var_42f5cc5ae0637b87`, `var_921f0f007f2db8ed`.
  - `200 g/m²` $\to$ **`234 µm`** (`0.2340 mm`, bulk `1.1700`): `var_16f616d88874c4f5`.
- **Favini Burano Nero Black Nr. 63 (2 variantes)**:
  - `140 g/m²` $\to$ **`172 µm`** (`0.1720 mm`, bulk `1.2286`): `var_3cab347d98e6bafb`.
  - `250 g/m²` $\to$ **`290 µm`** (`0.2900 mm`, bulk `1.1600`): `var_4d8611e0419fa40a`.
- **Antalis / Arjowiggins Curious Metallics (9 variantes)**:
  - `120 g/m²` $\to$ **`157 µm`** (`0.1570 mm`, bulk `1.3083`): `var_60bdb834a734e688`, `var_f1bbba47708846c3`, `var_46ac13d951f62d83`.
  - `300 g/m²` $\to$ **`400 µm`** (`0.4000 mm`, bulk `1.3333`): `var_0fd60daa43c9c4c1`, `var_d1012514b8afd728`, `var_8616f3e654ae65e1`, `var_f112de8410ac56c8`, `var_3c97f45aabbd2894`, `var_5bf7f1cd390daf3a`.
- **Arctic Paper Munkedal — Munken Kristall (2 variantes)**:
  - `170 g/m²` $\to$ **`192 µm`** (`0.1920 mm`, bulk `1.1294`): `var_337668698c5acef2`.
  - `240 g/m²` $\to$ **`271 µm`** (`0.2710 mm`, bulk `1.1292`): `var_586f4ee2a7c797c7`.
- **Holmen Iggesund — Invercote G & Incada Silk (2 variantes)**:
  - *Invercote G 380 64x90* (`380 g/m²`) $\to$ **`505 µm`** (`0.5050 mm`, bulk `1.3289`): `var_d9defc9b19b9adbf`.
  - *INCADA SILK 280 64x92 FSC* (`280 g/m²`) $\to$ **`445 µm`** (`0.4450 mm`, bulk `1.5893`): `var_3810dbfc361594d9`.
- **Billerud — CrownBoard Craft (1 variante)**:
  - *CrownBoard Craft 345 72x102* (`345 g/m²`) $\to$ **`535 µm`** (`0.5350 mm`, bulk `1.5507`): `var_b56fd736fb2364c1`.
- **Mondi — PERGRAPHICA Classic Rough (1 variante)**:
  - *PERGRAPHICA Classic Rough 240 72x102 FSC* (`240 g/m²`) $\to$ **`328 µm`** (`0.3280 mm`, bulk `1.3667`): `var_ebd54628ffb83779`.
- **Umka Cardboard Mill — Umka Color GD2 (2 variantes)**:
  - *Umka Color 300 70x100* (`300 g/m²`) $\to$ **`390 µm`** (`0.3900 mm`, bulk `1.3000`): `var_65a8f7c69b84369c`.
  - *Umka Color 350 70x100* (`350 g/m²`) $\to$ **`450 µm`** (`0.4500 mm`, bulk `1.2857`): `var_bb8139b48c741830`.
- **Referencia Livonia (`Spine calculation.xlsx`, 1 variante)**:
  - *Munken Print White 18 115 72x102 FSC* (`115 g/m²`) $\to$ **`209 µm`** (`0.2090 mm`, bulk `1.8174`, `LIVONIA_REFERENCE_IMPORT`): `var_e9b970adf34027f1`.
- **Formatos hermanos con celdas dedicadas en ODS (`SUPPLIER_IMPORT`, 3 variantes)**:
  - *GALERIE FINE gloss 80 64x90* (`80 g/m²`) $\to$ **`65 µm`** (`0.0650 mm`, bulk `0.8125`, hermano de `var_4754d3a2eeb5d5b2` celda `E522=65`): `var_6c9d63c6a90f9071`.
  - *Maxima Volume 150 102x72 FSC* (`150 g/m²`) $\to$ **`162 µm`** (`0.1620 mm`, bulk `1.0800`, hermano de `var_84b91b1fcfe9a59d` celda `E885=162`): `var_ef95d9c7874f1e50`.
  - *PrintSpeed Laser Jet 120g 45x32* (`120 g/m²`) $\to$ **`133 µm`** (`0.1330 mm`, bulk `1.1083`, hermano de `var_9164f93b039773bd` celda `E1399=133`): `var_015ca99a30bee286`.

---

## 3. Ejecución de Pasada 2 (`PASS_2_IDEMPOTENCY_VERIFICATION`)

Inmediatamente después de la Pasada 1, se ejecutó una segunda pasada completa sobre las mismas 36 variantes para verificar idempotencia estricta:

| Métrica de Pasada 2 | Resultado |
| :--- | :---: |
| `totalChecked` | `36` |
| **`calipersApplied`** | **`0`** |
| `datasheetApplied` | `0` |
| `livoniaApplied` | `0` |
| `siblingApplied` | `0` |
| **`skippedIdempotent`** | **`36`** |

---

## 4. Verificaciones de Integridad Post-Actualización y Checksums

| Control Post-Actualización | Valor Esperado | Valor Verificado | Estado |
| :--- | :---: | :---: | :---: |
| Variantes modificadas respecto a `paper_variants_backup_rec07w_20261029` | `36` | **`36`** | `PASS` |
| Variantes modificadas fuera de las 36 autorizadas (`modifiedOutside36Count`) | `0` | **`0`** | `PASS` |
| Violaciones de invariantes (`product_id`, `gsm`, `width_mm`, `height_mm`, `finish`, `grain_direction`, `fingerprint`) | `0` | **`0`** | `PASS` |
| Diferencias en los 9 conflictos históricos (`conflict9DiffsCount`) | `0` | **`0`** | `PASS` |
| Diferencias en las 2 variantes excluidas en Fase 1 (*Nevia Plus* y *Priplak Cristal*) | `0` | **`0`** | `PASS` |
| Variantes con `caliper_confidence_status = 'VERIFIED'` | `0` | **`0`** | `PASS` |
| Checksum `Control.paper_products` (sin cambios en productos ni clasificaciones) | `1734492320` | **`1734492320`** | `PASS` |
| Checksum `Control.supplier_paper_offers` (sin cambios comerciales) | `3737849396` | **`3737849396`** | `PASS` |
| Checksum `Control.paper_variants` (antes $\to$ después) | `2275212512` $\to$ nuevo | **`2093607442`** | `PASS` |
| Cobertura acumulada con espesor (`with_caliper`) | `1.272` (`83,46 %`) | **`1.272`** (`83,46 %`) | `PASS` |
| Variantes pendientes sin espesor (`without_caliper`) | `252` (`16,54 %`) | **`252`** (`16,54 %`) | `PASS` |
