# PAPER-MATERIALS-RECOVERY-04 — Preflight Obligatorio en Producción

**Proyecto:** PrintPrice OS  
**Misión:** `PAPER-MATERIALS-RECOVERY-04 — Actualización productiva controlada de 943 variantes`  
**Entorno:** Producción (`212.227.79.67`, MySQL `Control`)  
**Repositorio:** `PrintPriceOS/ppos-control-plane` (PR #13 · `feat/paper-materials-recovery-03r` · commit `3874c42b180d7ac03ec2974bc746be8b9657a001`)  
**Fecha de ejecución del Preflight:** `2026-10-28T20:45:43.050Z`  
**Estado del Preflight:** **PASS (100 % conforme)**

---

## 1. Verificación de Inventario y Estado Previo en MySQL `Control`

Se ejecutó la auditoría directa en vivo contra la base de datos productiva MySQL `Control` en `212.227.79.67`:

| Indicador Productivo | Valor Esperado (Orden de Misión) | Valor Real en `Control` | Estado |
| :--- | :---: | :---: | :---: |
| Total de productos (`paper_products`) | `1.522` | `1.522` | **PASS** |
| Total de variantes (`paper_variants`) | `1.524` | `1.524` | **PASS** |
| Variantes con caliper acreditado (`caliper_um IS NOT NULL AND caliper_um > 0`) | `1.171` | `1.171` | **PASS** |
| Variantes sin caliper (`caliper_um IS NULL OR caliper_um <= 0`) | `353` | `353` | **PASS** |
| Conflictos de espesor preservados (`paper_caliper_reconciliation_candidates.match_status = 'CONFLICT_PRESERVED'`) | `9` | `9` | **PASS** |
| Ofertas comerciales (`supplier_paper_offers`) | `2` | `2` | **PASS** |
| Procesos concurrentes de importación o escritura en tablas de papel (`INFORMATION_SCHEMA.PROCESSLIST`) | `0` | `0` | **PASS** |
| CI de GitHub Actions sobre commit autorizado `3874c42b180d7ac03ec2974bc746be8b9657a001` (PR #13) | `SUCCESS` | `SUCCESS` (runs `40764969459` y `40764960701`) | **PASS** |

---

## 2. Integridad de Respaldos Pre-Intervención y `CHECKSUM TABLE`

Se verificó la existencia, conteo exacto de filas y suma de verificación (`CHECKSUM TABLE`) de las tablas productivas y de sus respaldos previos (`*_backup_rec03_20261028`) en `Control`:

| Tabla en MySQL `Control` | Filas en Tabla Activa | Filas en Tabla Backup (`*_backup_rec03_20261028`) | `CHECKSUM TABLE` Activa (Pre-Update) | `CHECKSUM TABLE` Backup | Estado |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `paper_products` | `1.522` | `1.522` | `2180808459` | `2180808459` | **100 % IDÉNTICO** |
| `paper_variants` | `1.524` | `1.524` | `866434577` | `866434577` | **100 % IDÉNTICO** |
| `supplier_paper_offers` | `2` | `2` | `3737849396` | `3737849396` | **100 % IDÉNTICO** |
| `paper_technical_caliper_reference` | `375` | `375` | `2847849606` | `2847849606` | **100 % IDÉNTICO** |
| `paper_caliper_reconciliation_candidates` | `1.524` | `1.524` | `3402454981` | `3402454981` | **100 % IDÉNTICO** |

Además, se mantiene disponible el script determinista de reversión por fila (`docs/architecture/PAPER_MATERIALS_RECOVERY_03R_ROLLBACK.sql`).

---

## 3. Ejecución en `Dry-Run` y Comparación Fila por Fila contra `PAPER_MATERIALS_RECOVERY_03R_ELIGIBLE_943_DIFF.csv`

Antes de aplicar cualquier cambio, se contrastaron las `943` filas de la matriz aprobada `PAPER_MATERIALS_RECOVERY_03R_ELIGIBLE_943_DIFF.csv` contra el estado vivo en `Control.paper_variants` y `Control.paper_products`:

- **Filas en `PAPER_MATERIALS_RECOVERY_03R_ELIGIBLE_943_DIFF.csv`**: `943`
- **Coincidencias exactas de identidad y snapshot (`exactSnapshotMatches`)**: **`943 / 943` (`100 %`)**
  - `product_id`, `product_name`, `gsm`, `width_mm`, `height_mm`
  - `caliper_um`, `caliper_source`, `caliper_confidence_status`
  - `before_product_category`, `before_product_finish_summary`, `before_variant_finish`, `before_grain_direction` (`UNKNOWN`)
- **Desviaciones o drifts respecto al snapshot (`snapshotDriftsCount`)**: **`0`**

---

## 4. Auditoría de la Regla Especial para Productos Multivariante (Sección 3)

De las `1.524` variantes distribuidas en `1.522` productos en `Control`, únicamente **`2` productos** poseen `2` variantes:

1. **`prod_5e98217331d51d14` (`Multicolor Special MCS GD3 400g 530my 70x100`)**:
   - Variantes asociadas: `var_b2a4e8013433fac1` (`700x1000`, `400 gsm`, `530 µm`) y `var_70729aed0b243b2e` (`1000x700`, `400 gsm`, `530 µm`).
   - Estado en la matriz: **ambas variantes (`2/2`) pertenecen al subconjunto elegible `SAFE_UNIQUE_MATCH` (`943`)** y comparten exactamente la misma clasificación técnica del ODS (`Kartons` / `krītot/nekrītot` $\to$ `CARTON` / `ONE_SIDE_COATED` / `OTHER`).
   - Decisión gobernada: **Autorizada la actualización tanto de ambas filas en `paper_variants` como de la fila compartida en `paper_products`**.

2. **`prod_74bc2cb3bd5e8a40` (`Efalin FINE LINEN 130 (Light Blue) 120 102x70`)**:
   - Variantes asociadas:
     - `var_85c142a50239e312` (`1020x700`, `120 gsm`, `162 µm`) $\to$ **`SAFE_UNIQUE_MATCH`** (`Dizaina` / `nekrītots` $\to$ `DESIGN` / `UNCOATED` / `UNCOATED`).
     - `var_9ebc604670dc6622` (`1020x720`, `120 gsm`, `162 µm`) $\to$ **`STRONG_MATCH_REVIEW`** (excluida de esta intervención).
   - Decisión gobernada conforme a la Sección 3 (*"Para Efalin FINE LINEN, conservar la segunda variante pendiente de revisión. Si una modificación en paper_products pudiera afectar a una variante excluida de la misión, no efectuar ese cambio compartido hasta acreditar su compatibilidad y autorización"*):
     - **Se actualiza exclusivamente la variante elegible `var_85c142a50239e312` en `paper_variants`** (registrando `finish = 'UNCOATED'` y `metadata_json.ods_materials_recovery.paper_type = 'DESIGN'`, `coating_status = 'UNCOATED'`).
     - **NO se modifica la fila compartida `prod_74bc2cb3bd5e8a40` en `paper_products`** (`category = 'OTHER'` y `finish_summary = 'UNCOATED'` permanecen intactos), garantizando que la segunda variante `var_9ebc604670dc6622` (`1020x720`) no sufra ninguna alteración colateral.
     - Por tanto, sobre `943` variantes elegibles (que abarcan `942` productos distintos), se actualizan **`943` filas en `paper_variants`** y **`941` filas en `paper_products`** (`942 - 1 = 941`).

