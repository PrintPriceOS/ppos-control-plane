# PAPER-MATERIALS-RECOVERY-04 — Registro de Ejecución Transaccional e Idempotencia

**Proyecto:** PrintPrice OS  
**Misión:** `PAPER-MATERIALS-RECOVERY-04 — Actualización productiva controlada de 943 variantes`  
**Entorno:** Producción (`212.227.79.67`, MySQL `Control`)  
**Script de ejecución:** `scripts/recover_paper_materials_from_ods.cjs`  
**Matriz autorizada:** `docs/architecture/PAPER_MATERIALS_RECOVERY_03R_ELIGIBLE_943_DIFF.csv`  
**Ventana de ejecución:** `2026-10-28T20:46:59.779Z` $\to$ `2026-10-28T20:47:03.498Z`  
**Resultado:** **PASS (`943` variantes actualizadas en Pasada 1 · `0` filas modificadas en Pasada 2)**

---

## 1. Parámetros y Guardas de Seguridad en Ejecución

La actualización productiva se ejecutó bajo los siguientes invariantes estrictos:

1. **Alcance cerrado (`SAFE_UNIQUE_MATCH`)**: procesamiento exclusivo de las **`943` variantes** de `PAPER_MATERIALS_RECOVERY_03R_ELIGIBLE_943_DIFF.csv`. Ninguna de las `581` variantes excluidas (`501` `STRONG_MATCH_REVIEW`, `62` `ATTRIBUTE_CONFLICT`, `16` `AMBIGUOUS_MATCH`, `2` `ALREADY_VERIFIED`) fue incluida en las sentencias de escritura.
2. **Transacciones de `100` filas con bloqueo pesimista (`SELECT ... FOR UPDATE`) y Compare-and-Swap (CAS)**:
   - Verificación previa por fila de `product_id`, `product_name`, `gsm`, `width_mm`, `height_mm`, `caliper_um`, `caliper_source`, `caliper_confidence_status`, `before_product_category`, `before_product_finish_summary`, `before_variant_finish` y `grain_direction = 'UNKNOWN'`.
3. **Regla especial de productos multivariante (Sección 3)**:
   - Para cada `product_id`, se verificó si todas sus variantes hermanas pertenecen al conjunto elegible de `943` variantes (`allSiblingsEligible`).
   - En `prod_5e98217331d51d14` (*Multicolor Special MCS GD3 400g 530my*), ambas variantes (`var_b2a4e8013433fac1` y `var_70729aed0b243b2e`) pertenecen a las `943` y comparten `CARTON / ONE_SIDE_COATED / OTHER` $\to$ se actualizaron ambas variantes y su fila en `paper_products`.
   - En `prod_74bc2cb3bd5e8a40` (*Efalin FINE LINEN 130 (Light Blue) 120*), la variante elegible `var_85c142a50239e312` (`1020x700`) se actualizó en `paper_variants`, mientras que la fila compartida en `paper_products` **se omitió deliberadamente** (`skippedSharedProduct = 1`) para no afectar a su segunda variante `var_9ebc604670dc6622` (`1020x720`), que permanece en `STRONG_MATCH_REVIEW`.
4. **Inmutabilidad absoluta de Caliper, Grain y Precios**:
   - Columnas modificadas en `paper_variants`: únicamente `finish` y `metadata_json`.
   - Columnas modificadas en `paper_products`: únicamente `category`, `finish_summary` y `metadata_json`.
   - `grain_direction`, `caliper_um`, `caliper_mm`, `bulk_factor`, `caliper_source`, `caliper_confidence_status`, `caliper_revision` y `supplier_paper_offers` no fueron tocados.

---

## 2. Desglose por Lote — Pasada 1 (`PASS_1_SELECTIVE_943_UPDATE`)

- **Inicio:** `2026-10-28T20:46:59.782Z`
- **Fin:** `2026-10-28T20:47:01.797Z`

| Lote | Rango de Filas | Variantes Evaluadas | Variantes Actualizadas (`paper_variants`) | Productos Actualizados (`paper_products`) | Productos Compartidos Omitidos (Sección 3) | Variantes ya al día | Exclusiones / Rollbacks |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Batch 1** | `1 – 100` | `100` | `100` | `100` | `0` | `0` | `0` |
| **Batch 2** | `101 – 200` | `100` | `100` | `100` | `0` | `0` | `0` |
| **Batch 3** | `201 – 300` | `100` | `100` | `99` | `1` (`prod_74bc2cb3bd5e8a40` · *Efalin FINE LINEN*) | `0` | `0` |
| **Batch 4** | `301 – 400` | `100` | `100` | `100` | `0` | `0` | `0` |
| **Batch 5** | `401 – 500` | `100` | `100` | `100` | `0` | `0` | `0` |
| **Batch 6** | `501 – 600` | `100` | `100` | `100` | `0` | `0` | `0` |
| **Batch 7** | `601 – 700` | `100` | `100` | `99` (`prod_5e98217331d51d14` · *MCS GD3* 2 variantes $\to$ 1 producto) | `0` | `0` | `0` |
| **Batch 8** | `701 – 800` | `100` | `100` | `100` | `0` | `0` | `0` |
| **Batch 9** | `801 – 900` | `100` | `100` | `100` | `0` | `0` | `0` |
| **Batch 10** | `901 – 943` | `43` | `43` | `43` | `0` | `0` | `0` |
| **TOTAL PASADA 1** | **`1 – 943`** | **`943`** | **`943`** | **`941`** | **`1`** | **`0`** | **`0`** |

---

## 3. Verificación de Idempotencia — Pasada 2 (`PASS_2_IDEMPOTENCY_VERIFICATION`)

Inmediatamente después de completar la Pasada 1, se ejecutó una segunda pasada completa sobre los `10` lotes (`943` variantes):

- **Inicio:** `2026-10-28T20:47:01.797Z`
- **Fin:** `2026-10-28T20:47:02.687Z`

| Lote | Rango de Filas | Variantes Evaluadas | Variantes Actualizadas (`paper_variants`) | Productos Actualizados (`paper_products`) | Variantes Confirmadas Idempotentes (`alreadyUpToDate`) |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **Batch 1 – 9** | `1 – 900` | `900` | **`0`** | **`0`** | `900` |
| **Batch 10** | `901 – 943` | `43` | **`0`** | **`0`** | `43` |
| **TOTAL PASADA 2** | **`1 – 943`** | **`943`** | **`0`** | **`0`** | **`943`** |

---

## 4. Auditoría SQL Post-Ejecución contra Respaldos (`*_backup_rec03_20261028`)

Al finalizar las dos pasadas, se ejecutó una auditoría cruzada en SQL entre las tablas vivas (`paper_variants`, `paper_products`) y las tablas de respaldo (`paper_variants_backup_rec03_20261028`, `paper_products_backup_rec03_20261028`):

| Verificación SQL Post-Update | Valor Obtenido | Estado |
| :--- | :---: | :---: |
| Variantes modificadas en total (`v.finish <> b.finish OR v.metadata_json <> b.metadata_json`) | **`943`** | **PASS** |
| Variantes modificadas fuera de las `943` elegibles (`modifiedVariantsOutside943Count`) | **`0`** | **PASS** |
| Productos modificados en total (`p.category <> b.category OR p.finish_summary <> b.finish_summary OR p.metadata_json <> b.metadata_json`) | **`941`** | **PASS** |
| Diferencias en columnas de Caliper, Grain o Comerciales (`caliper_um`, `caliper_mm`, `bulk_factor`, `caliper_source`, `caliper_confidence_status`, `caliper_revision`, `grain_direction`, `gsm`, `width_mm`, `height_mm`, `is_reel`, `fingerprint`) | **`0`** | **PASS** |
| Total de variantes con caliper después de la actualización (`with_caliper`) | **`1.171`** | **PASS** |
| Total de variantes sin caliper después de la actualización (`without_caliper`) | **`353`** | **PASS** |
| Conflictos de espesor preservados (`CONFLICT_PRESERVED`) | **`9`** | **PASS** |
| `CHECKSUM TABLE Control.supplier_paper_offers` (Pre vs Post) | `3737849396` $\to$ `3737849396` | **100 % INTACTO** |
| `CHECKSUM TABLE Control.paper_technical_caliper_reference` (Pre vs Post) | `2847849606` $\to$ `2847849606` | **100 % INTACTO** |
| `CHECKSUM TABLE Control.paper_caliper_reconciliation_candidates` (Pre vs Post) | `3402454981` $\to$ `3402454981` | **100 % INTACTO** |
| `CHECKSUM TABLE Control.paper_products` (Pre vs Post) | `2180808459` $\to$ `3691516631` | **ACTUALIZADO (`941` filas)** |
| `CHECKSUM TABLE Control.paper_variants` (Pre vs Post) | `866434577` $\to$ `3803472582` | **ACTUALIZADO (`943` filas)** |

---

## 5. Distribución Técnica Resultante en `Control` (`1.524` Variantes)

### 5.1 Distribución de las `943` Variantes Actualizadas (`SAFE_UNIQUE_MATCH`)

| `paperType` (`category`) | `coatingStatus` | `finish` | Variantes Actualizadas |
| :--- | :--- | :--- | :---: |
| `OFFSET` | `UNCOATED` | `UNCOATED` | `379` |
| `COATED` | `COATED` | `SILK` | `250` |
| `COATED` | `COATED` | `MATT` | `110` |
| `DESIGN` | `UNCOATED` | `UNCOATED` | `82` (`81` con `product.category = DESIGN` + `1` *Efalin FINE LINEN* `var_85c142a50239e312` con `ods_materials_recovery.paper_type = DESIGN`) |
| `CARTON` | `COATED` / `ONE_SIDE_COATED` | `OTHER` | `76` |
| `CARTON` | `COATED` / `ONE_SIDE_COATED` | `MATT` | `20` |
| `DESIGN` | `COATED` | `GLOSS` | `8` |
| `CARTON` | `COATED` | `SEMI_GLOSS` | `6` |
| `DESIGN` | `COATED` | `SEMI_GLOSS` | `5` |
| `CARTON` | `UNCOATED` | `UNCOATED` | `5` |
| `CARTON` | `COATED` | `SILK` | `1` |
| `DESIGN` | `COATED` | `OTHER` | `1` |
| **TOTAL** | — | — | **`943`** |

### 5.2 Estado Global en Base de Datos (`Control.paper_products` + `Control.paper_variants`, `1.524` Variantes)

| `paper_products.category` | `paper_variants.finish` | Variantes en BD | Observación |
| :--- | :--- | :---: | :--- |
| `OFFSET` | `UNCOATED` | `395` | `379` actualizadas en `RECOVERY-04` + `16` ya existentes |
| `COATED` | `SILK` | `322` | `250` actualizadas en `RECOVERY-04` + `72` ya existentes |
| `OTHER` | `UNCOATED` | `264` | Variantes excluidas (`STRONG_MATCH_REVIEW` / `ATTRIBUTE_CONFLICT` / `AMBIGUOUS_MATCH`), servidas por API como `finish: 'UNKNOWN'` / `coatingConfidence: 'UNVERIFIED_DEFAULT'` + `1` *Efalin FINE LINEN* `var_85c142a50239e312` (servida como `DESIGN / UNCOATED` vía `ods_materials_recovery`) |
| `COATED` | `MATT` | `110` | `110` actualizadas en `RECOVERY-04` |
| `CARTON` | `UNCOATED` | `102` | `5` acreditadas como `UNCOATED` en `RECOVERY-04` + `97` excluidas pendientes de revisión |
| `DESIGN` | `UNCOATED` | `97` | `81` actualizadas en `RECOVERY-04` + `16` excluidas |
| `COATED` | `UNCOATED` | `84` | Variantes en revisión (`STRONG_MATCH_REVIEW`) cuyo `finish` por defecto en BD no se expone como `UNCOATED` acreditado |
| `CARTON` | `OTHER` | `76` | `76` actualizadas en `RECOVERY-04` |
| `DIGITAL` | `UNCOATED` | `34` | Variantes excluidas en revisión |
| `CARTON` | `MATT` | `20` | `20` actualizadas en `RECOVERY-04` |
| `DESIGN` | `GLOSS` | `8` | `8` actualizadas en `RECOVERY-04` |
| `CARTON` | `SEMI_GLOSS` | `6` | `6` actualizadas en `RECOVERY-04` |
| `DESIGN` | `SEMI_GLOSS` | `5` | `5` actualizadas en `RECOVERY-04` |
| `CARTON` | `SILK` | `1` | `1` actualizada en `RECOVERY-04` |
| `DESIGN` | `OTHER` | `1` | `1` actualizada en `RECOVERY-04` |
| **TOTAL** | — | **`1.524`** | **`100 %` del catálogo verificado** |

