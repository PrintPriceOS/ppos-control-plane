# RECOVERY-10V — Conciliación en Vivo de Evidencias Productivas (`MySQL Control` + `https://control.printprice.pro`)

**Proyecto:** PrintPrice OS  
**Repositorio:** `PrintPriceOS/ppos-control-plane`  
**Servidor Productivo:** `212.227.79.67` (`/opt/printprice-os/ppos-control-plane`)  
**Aplicación:** `https://control.printprice.pro`  
**Base de Datos:** MySQL `Control` (`8.0.46-0ubuntu0.24.04.4`)  
**Commit Auditado de `RECOVERY-10`:** `3ec340cf3d616245d366ca899b3119cf9231a76c` (código productivo desplegado desde `c99c5fbc6839e3817bddd6f9faf65ecf1a398d6a`)  
**Commit de Publicación `RECOVERY-10V`:** `cfc204a9b5a948ecd0255bb6b2c89fa8ece27c31` (más el commit de cierre de esta línea)  
**Modo de Ejecución:** **`STRICT_READ_ONLY_VERIFICATION` (`0` migraciones, `0` restauraciones, `0` cambios de código, `0` escrituras en catálogo)**  
**Fecha/Hora de Verificación en Vivo:** `2026-10-29T14:31:08.477Z`  
**Estado de Conciliación:** **`CONCILIADO Y CERTIFICADO (`RECOVERY_10V_PRODUCTION_CERTIFIED`)`**

---

## 1. Causa Raíz de la Discrepancia Detectada y Alcance de la Conciliación

Durante el cierre conversacional de `PAPER-MATERIALS-RECOVERY-10` se produjo una divergencia **exclusivamente entre el resumen conversacional en el chat** y **los 7 documentos oficiales publicados en GitHub (`docs/architecture/RECOVERY_10_*.md`)**:

- **Los 7 informes versionados en GitHub (`3ec340cf3d616245d366ca899b3119cf9231a76c`) fueron generados directamente a partir de los JSON de salida reales del servidor (`preflight_rec10_out.json`, `phase2_backup_out.json`, `phase3_4_out.json`, `phase5_api_smoke_out.json`, `phase6_spine_out.json`, `phase6_browser_e2e_out.json`) y contienen en todo momento los nombres de tabla, checksums, códigos HTTP/error y cálculos Spine/BPE exactos de producción.**
- **El mensaje de resumen en el chat**, por el contrario, fue redactado justo después de una compactación automática de contexto cuyo resumen intermedio contenía nombres de tablas preliminares e imprecisiones (`paper_technical_evidence_documents`, `supplier_paper_variants`, checksum `a3d4a5a0...`, etc.).

Para eliminar cualquier duda con rigor forense, en `RECOVERY-10V` se ha ejecutado una **verificación en vivo estrictamente de solo lectura** contra `212.227.79.67` y `MySQL Control`, contrastando punto por punto:
1. La **Realidad Productiva en Vivo (`MySQL Control` + `PM2` + `HTTPS`)**,
2. Los **7 Informes Oficiales Publicados en GitHub (`3ec340cf3d616245d366ca899b3119cf9231a76c`)**, y
3. El **Resumen Conversacional Previo del Chat (corregido en esta orden)**.

---

## 2. Verificación de Base de Datos en Modo Solo Lectura (`MySQL Control`)

### 2.1 Las Tres Tablas Realmente Creadas por la Migración `174`

**Consulta ejecutada (`read-only`):**
```sql
SELECT TABLE_NAME, ENGINE, TABLE_COLLATION, TABLE_ROWS, CREATE_TIME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'Control'
  AND TABLE_NAME IN (
    'paper_variant_caliper_evidence',
    'paper_variant_caliper_audit_log',
    'paper_variant_classification_evidence'
  )
ORDER BY TABLE_NAME;
```

**Resultado exacto en producción (`2026-10-29T14:31:08.477Z`):**

| `TABLE_NAME` | `ENGINE` | `TABLE_COLLATION` | `TABLE_ROWS` | `CREATE_TIME` | Coincide con `RECOVERY_10_MIGRATION_EXECUTION.md` |
|---|---|---|---:|---|---|
| **`paper_variant_caliper_audit_log`** | `InnoDB` | `utf8mb4_unicode_ci` | `0` | `2026-10-29T12:15:53.000Z` | **SÍ (100% Exacto)** |
| **`paper_variant_caliper_evidence`** | `InnoDB` | `utf8mb4_unicode_ci` | `0` | `2026-10-29T12:15:53.000Z` | **SÍ (100% Exacto)** |
| **`paper_variant_classification_evidence`** | `InnoDB` | `utf8mb4_unicode_ci` | `0` | `2026-10-29T12:15:53.000Z` | **SÍ (100% Exacto)** |

Adicionalmente, se ejecutó `SELECT COUNT(*) FROM ...` sobre cada una de las 3 tablas confirmando **`0` filas residuales** tras la limpieza gobernada del smoke test de Fase 5 (`paper_variant_caliper_evidence = 0`, `paper_variant_caliper_audit_log = 0`, `paper_variant_classification_evidence = 0`), y se comprobó que las tablas citadas por error en el resumen conversacional (`paper_technical_evidence_documents`, `paper_variant_accreditation_actions`, `paper_physical_measurement_protocols`, `supplier_paper_variants`, `paper_supplier_prices`, `paper_market_Reference_prices`) **no existen** (`erroneousChatSummaryTablesPresent: []`).

---

### 2.2 Las Seis Claves Foráneas y sus Reglas de Eliminación (`ON DELETE RESTRICT`)

**Consulta ejecutada (`read-only`):**
```sql
SELECT
  rc.CONSTRAINT_NAME,
  rc.TABLE_NAME,
  kcu.COLUMN_NAME,
  rc.REFERENCED_TABLE_NAME,
  kcu.REFERENCED_COLUMN_NAME,
  rc.DELETE_RULE,
  rc.UPDATE_RULE
FROM information_schema.REFERENTIAL_CONSTRAINTS rc
JOIN information_schema.KEY_COLUMN_USAGE kcu
  ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
 AND rc.TABLE_NAME = kcu.TABLE_NAME
 AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
WHERE rc.CONSTRAINT_SCHEMA = 'Control'
  AND rc.TABLE_NAME IN (
    'paper_variant_caliper_evidence',
    'paper_variant_caliper_audit_log',
    'paper_variant_classification_evidence'
  )
ORDER BY rc.CONSTRAINT_NAME;
```

**Resultado exacto en producción (`allSixFksRestrict: true`):**

| `CONSTRAINT_NAME` | `TABLE_NAME` | `COLUMN_NAME` | `REFERENCED_TABLE_NAME` | `REFERENCED_COLUMN_NAME` | `DELETE_RULE` | `UPDATE_RULE` | Coincide con `RECOVERY_10_MIGRATION_EXECUTION.md` |
|---|---|---|---|---|---|---|---|
| **`fk_pvcal_evidence`** | `paper_variant_caliper_audit_log` | `evidence_id` | `paper_variant_caliper_evidence` | `evidence_id` | **`RESTRICT`** | `NO ACTION` | **SÍ (100% Exacto)** |
| **`fk_pvcal_variant`** | `paper_variant_caliper_audit_log` | `variant_id` | `paper_variants` | `id` | **`RESTRICT`** | `NO ACTION` | **SÍ (100% Exacto)** |
| **`fk_pvce_product`** | `paper_variant_caliper_evidence` | `product_id` | `paper_products` | `id` | **`RESTRICT`** | `NO ACTION` | **SÍ (100% Exacto)** |
| **`fk_pvce_variant`** | `paper_variant_caliper_evidence` | `variant_id` | `paper_variants` | `id` | **`RESTRICT`** | `NO ACTION` | **SÍ (100% Exacto)** |
| **`fk_pvcle_product`** | `paper_variant_classification_evidence` | `product_id` | `paper_products` | `id` | **`RESTRICT`** | `NO ACTION` | **SÍ (100% Exacto)** |
| **`fk_pvcle_variant`** | `paper_variant_classification_evidence` | `variant_id` | `paper_variants` | `id` | **`RESTRICT`** | `NO ACTION` | **SÍ (100% Exacto)** |

---

### 2.3 Versión, Estado y Checksum de la Migración `174` en `schema_versions`

**Consulta ejecutada (`read-only`):**
```sql
SELECT version, record_type, migration_path, checksum, state, applied_at
FROM schema_versions
WHERE version LIKE '174_%' OR version LIKE '173_%' OR version LIKE '172_%'
ORDER BY version DESC;
```

**Resultado exacto en producción:**

| `version` | `record_type` | `migration_path` | `checksum` (`SHA-256`) | `state` | `applied_at` | Coincide con `RECOVERY_10_MIGRATION_EXECUTION.md` |
|---|---|---|---|---|---|---|
| **`174_phase197c_paper_evidence_and_technical_accreditation`** | `MIGRATION` | `migrations/174_phase197c_paper_evidence_and_technical_accreditation.sql` | **`d1a400efe6962f0ff88beb7114ed1bb8603fff74ea7b4aa840c6ec64025e7144`** | **`APPLIED`** | `2026-10-29T12:15:54.000Z` | **SÍ (100% Exacto)** |
| `173_phase197b_spine_binding_profiles_and_snapshots` | `MIGRATION` | `migrations/173_phase197b_spine_binding_profiles_and_snapshots.sql` | `29275551c2fc770880a4dfa66121f29859852e97bf3ec055a1118f1261b7a9ae` | `APPLIED` | `2026-10-28T17:03:53.000Z` | **SÍ (100% Exacto)** |
| `172_phase197a_paper_caliper_and_livonia_reference` | `MIGRATION` | `migrations/172_phase197a_paper_caliper_and_livonia_reference.sql` | `96f083c4f4e263bcc4d1616ac10a76d6dbe4e2eff04bc1d0eac04453a56daa5c` | `APPLIED` | `2026-10-28T17:03:53.000Z` | **SÍ (100% Exacto)** |

---

### 2.4 Checksums Reales de `paper_products`, `paper_variants` y `supplier_paper_offers`

**Consulta ejecutada (`read-only`, antes y después de la verificación funcional):**
```sql
CHECKSUM TABLE
  Control.paper_products,
  Control.paper_variants,
  Control.supplier_paper_offers,
  Control.paper_technical_caliper_reference,
  Control.paper_caliper_reconciliation_candidates;
```

**Resultado exacto en producción (`zeroWritesVerified: true`):**

| Tabla Real en `MySQL Control` | Checksum Pre-Despliegue (Fase 1) | Checksum Actual en Vivo (`RECOVERY-10V`) | Coincide con `RECOVERY_10_MIGRATION_EXECUTION.md` y `RECOVERY_10_SPINE_BPE_REGRESSION.md` |
|---|---:|---:|---|
| **`Control.paper_products`** | `1734492320` | **`1734492320`** | **SÍ (100% Exacto)** |
| **`Control.paper_variants`** | `2093607442` | **`2093607442`** | **SÍ (100% Exacto)** |
| **`Control.supplier_paper_offers`** | `3737849396` | **`3737849396`** | **SÍ (100% Exacto)** |
| **`Control.paper_technical_caliper_reference`** | `2847849606` | **`2847849606`** | **SÍ (100% Exacto)** |
| **`Control.paper_caliper_reconciliation_candidates`** | `3402454981` | **`3402454981`** | **SÍ (100% Exacto)** |

---

### 2.5 Conteos del Catálogo (`1.524 / 1.272 / 252`) y los Nueve Conflictos Históricos

**Consulta ejecutada (`read-only`):**
```sql
SELECT
  COUNT(*) AS total_variants,
  SUM(CASE WHEN caliper_um IS NOT NULL AND caliper_um > 0 THEN 1 ELSE 0 END) AS with_caliper,
  SUM(CASE WHEN caliper_um IS NULL OR caliper_um <= 0 THEN 1 ELSE 0 END) AS missing_caliper,
  SUM(CASE WHEN id IN (
    'var_2b0314c68f5a97c7','var_4178aecbfa53dcf8','var_5f5cae75e6f45671',
    'var_7b7e3a2a2a4a0313','var_c699e6a51cd6b41f'
  ) AND caliper_um = 122.00
    AND caliper_source = 'LIVONIA_REFERENCE_IMPORT'
    AND caliper_confidence_status = 'REFERENCE_IMPORTED' THEN 1 ELSE 0 END) AS amber_graphic_122um_count,
  SUM(CASE WHEN id IN (
    'var_06e1d1681e4f0989','var_9dabfd7ac5eff6ca','var_ae7dbf443ceab19a','var_e2f2e68304e9d4a1'
  ) AND caliper_um = 225.00
    AND caliper_source = 'LIVONIA_REFERENCE_IMPORT'
    AND caliper_confidence_status = 'REFERENCE_IMPORTED' THEN 1 ELSE 0 END) AS galerie_art_matt_225um_count,
  SUM(CASE WHEN id IN (
    'var_2b0314c68f5a97c7','var_4178aecbfa53dcf8','var_5f5cae75e6f45671',
    'var_7b7e3a2a2a4a0313','var_c699e6a51cd6b41f','var_06e1d1681e4f0989',
    'var_9dabfd7ac5eff6ca','var_ae7dbf443ceab19a','var_e2f2e68304e9d4a1'
  ) AND (caliper_um IS NULL OR caliper_um <= 0) THEN 1 ELSE 0 END) AS historical_9_in_missing_252
FROM paper_variants;
```

**Resultado exacto en producción:**
- `total_variants`: **`1524`**
- `with_caliper`: **`1272`** (`83,46%`)
- `missing_caliper`: **`252`** (`16,54%`)
- `amber_graphic_122um_count`: **`5`**
- `galerie_art_matt_225um_count`: **`4`**
- `historical_9_in_missing_252`: **`0`**

**Verificación individual de los 9 conflictos históricos (`paper_variants` + `paper_caliper_reconciliation_candidates`):**

| # | `variant_id` | `product_id` | `product_name` | `gsm` | Formato (`mm`) | `caliper_um` | `caliper_source` | `caliper_confidence_status` | Nota de Conflicto Preservada |
|---:|---|---|---|---:|---|---:|---|---|---|
| 1 | `var_2b0314c68f5a97c7` | `prod_6b947230ea5a4912` | `Amber Graphic 100 102x72` | 100 | `1020x720` | **`122.00`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 15 has 119.00 um vs existing Livonia 122.00 um; existing preserved]` |
| 2 | `var_7b7e3a2a2a4a0313` | `prod_054ee8c967a27de8` | `Amber Graphic 100 64x90 FSC` | 100 | `640x900` | **`122.00`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 16 has 119.00 um vs existing Livonia 122.00 um; existing preserved]` |
| 3 | `var_4178aecbfa53dcf8` | `prod_cdd3b22491fa9ecc` | `Amber Graphic 100 72x102 FSC` | 100 | `720x1020` | **`122.00`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 17 has 119.00 um vs existing Livonia 122.00 um; existing preserved]` |
| 4 | `var_c699e6a51cd6b41f` | `prod_936f69acbe1c2a6d` | `Amber Graphic 100 88x63` | 100 | `880x630` | **`122.00`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 18 has 119.00 um vs existing Livonia 122.00 um; existing preserved]` |
| 5 | `var_5f5cae75e6f45671` | `prod_ed3fbeb4b1a89563` | `Amber Graphic 100 90x64 FSC` | 100 | `900x640` | **`122.00`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 19 has 119.00 um vs existing Livonia 122.00 um; existing preserved]` |
| 6 | `var_ae7dbf443ceab19a` | `prod_d84abf47ed966f7e` | `Galerie Art Matt 250 46x64 FSC` | 250 | `460x640` | **`225.00`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 462 has 257.00 um vs existing Livonia 225.00 um; existing preserved]` |
| 7 | `var_9dabfd7ac5eff6ca` | `prod_f15422a92558577d` | `Galerie Art Matt 250 64x90 FSC` | 250 | `640x900` | **`225.00`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 463 has 257.00 um vs existing Livonia 225.00 um; existing preserved]` |
| 8 | `var_06e1d1681e4f0989` | `prod_d02da3987156443d` | `Galerie Art Matt 250 72x102 FSC` | 250 | `720x1020` | **`225.00`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 464 has 257.00 um vs existing Livonia 225.00 um; existing preserved]` |
| 9 | `var_e2f2e68304e9d4a1` | `prod_3ec85f555b572ac8` | `Galerie Art Matt 250 90x64 FSC` | 250 | `900x640` | **`225.00`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 465 has 257.00 um vs existing Livonia 225.00 um; existing preserved]` |

---

## 3. Matriz de Conciliación Documental: Resumen Conversacional vs. Informes en GitHub vs. Producción Real

La siguiente tabla concilia todas las discrepancias entre el resumen conversacional anterior y los 4 documentos auditados (`RECOVERY_10_MIGRATION_EXECUTION.md`, `RECOVERY_10_API_SECURITY_E2E.md`, `RECOVERY_10_SPINE_BPE_REGRESSION.md`, `RECOVERY_10_FINAL_REPORT.md`):

| Concepto Auditado | Lo que decía por error el Resumen Conversacional en el Chat | Lo que está publicado en GitHub (`RECOVERY_10_*.md` @ `3ec340cf`) | Resultado Real en Producción (`MySQL Control` / `212.227.79.67`) | Estado del Documento en GitHub |
|---|---|---|---|---|
| **1. Tres tablas creadas por Migración 174** | `paper_technical_evidence_documents`, `paper_variant_accreditation_actions`, `paper_physical_measurement_protocols` *(incorrecto)* | `paper_variant_caliper_evidence`, `paper_variant_caliper_audit_log`, `paper_variant_classification_evidence` (`RECOVERY_10_MIGRATION_EXECUTION.md` §3.1) | `paper_variant_caliper_evidence`, `paper_variant_caliper_audit_log`, `paper_variant_classification_evidence` | **CORRECTO EN GITHUB (No requiere cambio)** |
| **2. Seis claves foráneas (`ON DELETE RESTRICT`)** | Mencionaba 6 FKs sin detallar los nombres reales en el chat | `fk_pvcal_evidence`, `fk_pvcal_variant`, `fk_pvce_product`, `fk_pvce_variant`, `fk_pvcle_product`, `fk_pvcle_variant` con `DELETE_RULE = 'RESTRICT'` (`RECOVERY_10_MIGRATION_EXECUTION.md` §3.2) | Exactamente esas 6 FKs con `DELETE_RULE = 'RESTRICT'` y `UPDATE_RULE = 'NO ACTION'` | **CORRECTO EN GITHUB (No requiere cambio)** |
| **3. Checksum de Migración 174 en `schema_versions`** | `a3d4a5a0bf5fa603ebfc4649c00e557eb5896df26a404c0056c2ebedcf091d1d` *(incorrecto)* | `d1a400efe6962f0ff88beb7114ed1bb8603fff74ea7b4aa840c6ec64025e7144` (`RECOVERY_10_MIGRATION_EXECUTION.md` §2.4 y `RECOVERY_10_BACKUP_MANIFEST.md` §1) | `d1a400efe6962f0ff88beb7114ed1bb8603fff74ea7b4aa840c6ec64025e7144` (`state: APPLIED`, `2026-10-29T12:15:54.000Z`) | **CORRECTO EN GITHUB (No requiere cambio)** |
| **4. Nombres de tablas de los 3 checksums de catálogo/ofertas** | `supplier_paper_variants` (`1734492320`), `paper_supplier_prices` (`2093607442`), `paper_market_Reference_prices` (`3737849396`) *(nombres incorrectos)* | `Control.paper_products` (`1734492320`), `Control.paper_variants` (`2093607442`), `Control.supplier_paper_offers` (`3737849396`) (`RECOVERY_10_MIGRATION_EXECUTION.md` §3.4 y `RECOVERY_10_SPINE_BPE_REGRESSION.md` §3) | `Control.paper_products` = `1734492320`, `Control.paper_variants` = `2093607442`, `Control.supplier_paper_offers` = `3737849396` | **CORRECTO EN GITHUB (No requiere cambio)** |
| **5. Tamaño de la cola en `GET /missing-materials`** | `261` ítems (`252 + 9`) *(incorrecto)* | `252` ítems (`itemsReturnedCount: 252`, `missingCaliperTotal: 252`, `historicalConflictsPreserved: 9` excluidos de los 252 ausentes) (`RECOVERY_10_API_SECURITY_E2E.md` §1 y `RECOVERY_10_UI_BROWSER_E2E.md` §1) | `itemsCount: 252`, `missingCaliperTotal: 252`, `historicalConflictsPreserved: 9` (`0` de los 9 están en los 252 ausentes) | **CORRECTO EN GITHUB (No requiere cambio)** |
| **6. Códigos de error en Smoke API (Fase 5)** | `400 INVALID_PDF_MAGIC_BYTES`, `422 UNSAFE_PDF_CONTENT_DETECTED`, `404 DOCUMENT_NOT_FOUND`, `403 INSUFFICIENT_ROLE_...`, `403 SEPARATION_OF_DUTIES_VIOLATION` *(códigos incorrectos en el chat)* | `422 INVALID_PDF_MAGIC_SIGNATURE`, `422 PDF_ACTIVE_CONTENT_FORBIDDEN`, `413 DOCUMENT_SIZE_LIMIT_EXCEEDED`, `404 EVIDENCE_NOT_FOUND`, `403 FORBIDDEN`, `403 SOD_SELF_APPROVAL_FORBIDDEN` (`RECOVERY_10_API_SECURITY_E2E.md` §1) | Exactamente los códigos publicados en `RECOVERY_10_API_SECURITY_E2E.md` (verificados en `phase5_api_smoke_out.json`) | **CORRECTO EN GITHUB (No requiere cambio)** |
| **7. Casos de regresión Spine (`POST /api/v1/spine/calculate`)** | Citaba `Amber 100g 192 pp sewn -> 12.5 mm / 15.0 mm` y `422 SPINE_CALCULATION_NOT_AVAILABLE` *(de una misión previa)* | `200` páginas (`148x210 mm`, `SOFTCOVER_STANDARD`): Munken Cream 15 (`150 µm`, `GLUED`) -> `15.0 / 16.0 mm`; Amber 150 (`178 µm`, `GLUED`) -> `17.8 / 18.5 mm`; Conflicto #1 Amber 100 (`122 µm`, `SEWN`) -> `12.2 / 13.5 mm`; Conflicto #6 Galerie 250 (`225 µm`, `GLUED`) -> `22.5 / 23.5 mm`; Munken White 18 115g (`209 µm`, `GLUED`) -> `20.9 / 22.0 mm`; Variante sin espesor `var_d6440696e5e27b83` -> HTTP `200`, `validationStatus: INVALID_BLOCKED`, `spineWidthMm: null`, `canReleaseToManufacturing: false` (`RECOVERY_10_SPINE_BPE_REGRESSION.md` §1) | Re-verificados en vivo en modo solo lectura (`persistSnapshot: false`): 100% idénticos a `RECOVERY_10_SPINE_BPE_REGRESSION.md` | **CORRECTO EN GITHUB (No requiere cambio)** |
| **8. Verificación económica BPE (`https://budget.printprice.pro`)** | Citaba 4 ofertas (`1.078,34 €`, `1.224,78 €`, `1.375,37 €`, `1.547,96 €`) *(de `SPINE-06R`)* | Oferta de referencia **`2.169,88 €`** con **`0,00 €` de desviación** y checksum `supplier_paper_offers = 3737849396` intacto (`RECOVERY_10_SPINE_BPE_REGRESSION.md` §2 y `RECOVERY_10_FINAL_REPORT.md` §1) | `https://budget.printprice.pro/api/health` -> `200 OK`, oferta de referencia `2.169,88 €` (`0,00 €` drift), checksum `3737849396` intacto | **CORRECTO EN GITHUB (No requiere cambio)** |
| **9. Capacidad de disco reportada en Fase 1** | Citaba `363 GiB libres (8% uso)` *(de otro entorno)* | `/dev/vda1`: `232G` total, `170G` usado, **`62G` disponible (`74%` uso)** (`RECOVERY_10_PRODUCTION_PREFLIGHT.md` §5) | `/dev/vda1`: `232G` total, `170G` usado, `62G` disponible (`74%` uso) | **CORRECTO EN GITHUB (No requiere cambio)** |

**Conclusión de la Conciliación Documental:** Los 7 documentos publicados en GitHub bajo `docs/architecture/RECOVERY_10_*.md` en el commit `3ec340cf3d616245d366ca899b3119cf9231a76c` **ya contenían los datos exactos y verdaderos de producción** y no presentan ninguna discrepancia frente a la base de datos `MySQL Control` ni frente a los servicios en vivo.

---

## 4. Comprobación Funcional en Modo Solo Lectura (`0` Escrituras)

Sin modificar ningún dato real en `MySQL Control` (`zeroWritesVerified: true`), se verificaron en vivo los 7 puntos funcionales requeridos:

1. **Estado de PM2 y Commit Ejecutado:**
   - Repositorio `/opt/printprice-os/ppos-control-plane`: `gitHead = "3ec340cf3d616245d366ca899b3119cf9231a76c"` (código productivo idéntico a `c99c5fbc6839e3817bddd6f9faf65ecf1a398d6a`), `gitStatusClean = true` (`""`).
   - Proceso PM2 `ppos-control-plane`: `pm_id: 0`, `pid: 3800466`, `status: "online"`, `username: "root"`, `node_version: "20.20.2"`, `exec_path: "/opt/printprice-os/ppos-control-plane/server.js"`.
   - Salud del servicio:
     - `GET http://127.0.0.1:8081/live` -> HTTP `200` `{"status":"UP"}`
     - `GET http://127.0.0.1:8081/ready` -> HTTP `200` `{"status":"READY","service":"ppos-control-plane","schema":{"status":"READY","manifestVersion":1}}`

2. **Acceso al Módulo de Acreditación (Solo Lectura):**
   - Barrera sin autenticación (`GET https://control.printprice.pro/api/v1/paper-suppliers/accreditation/missing-materials`): bloqueado con HTTP **`401 Unauthorized`**.
   - Consulta de solo lectura (`paperEvidenceService.listMissingCaliperMaterials`):
     - `catalogTotalVariants: 1524`, `withCaliperCount: 1272`, `missingCaliperTotal: 252`, `itemsCount: 252`
     - `physicalMicrometerTrackCount: 145`, `supplierDatasheetTrackCount: 102`, `conflictHoldTrackCount: 5`
     - `historicalConflictsPreserved: 9` (`0` incluidos en los `252` ausentes)
     - `pendingClassificationTotal: 337`
     - `canReleaseToManufacturing: false`

3. **Acceso Privado a los PDFs:**
   - Directorio `/var/lib/ppos/private_evidence_store`: permisos `0700`, propietario `0:0` (`root:root`), `entriesCount: 0` (limpio tras el smoke test), `0` referencias en configuraciones de Nginx/Apache.
   - Barrera sin autenticación (`GET https://control.printprice.pro/api/v1/paper-suppliers/accreditation/evidences/evd_cal_0000000000000000/document`): bloqueado con HTTP **`401 Unauthorized`**.

4. **Integridad de Catálogo y Ofertas:**
   - `paper_products`: `1,522` productos (`CHECKSUM = 1734492320`).
   - `paper_variants`: `1,524` variantes (`CHECKSUM = 2093607442`).
   - `supplier_paper_offers`: `2` ofertas activas para `supp-test-mill-01` (`CHECKSUM = 3737849396`).

5. **Cálculo Spine con Referencias Conocidas (`persistSnapshot: false`, `0` escrituras):**
   - `var_3d45d076a5d30a41` (`Munken Print Cream 15 100 72x102 FSC`, `150.00 µm`, 200 pp, `GLUED`): bloque **`15.0 mm`**, lomo **`16.0 mm`**, `canReleaseToManufacturing: false`.
   - `var_245413622bc57123` (`Amber Graphic 150 72x102 FSC`, `178.00 µm`, 200 pp, `GLUED`): bloque **`17.8 mm`**, lomo **`18.5 mm`**, `canReleaseToManufacturing: false`.
   - `var_2b0314c68f5a97c7` (Conflicto histórico #1 `Amber Graphic 100 102x72`, `122.00 µm`, 200 pp, `SEWN`): bloque **`12.2 mm`**, lomo **`13.5 mm`**, `canReleaseToManufacturing: false`.
   - `var_06e1d1681e4f0989` (Conflicto histórico #6 `Galerie Art Matt 250 72x102 FSC`, `225.00 µm`, 200 pp, `GLUED`): bloque **`22.5 mm`**, lomo **`23.5 mm`**, `canReleaseToManufacturing: false`.
   - `var_e9b970adf34027f1` (`Munken Print White 18 115 72x102 FSC`, `209.00 µm`, 200 pp, `GLUED`): bloque **`20.9 mm`**, lomo **`22.0 mm`**, `canReleaseToManufacturing: false`.
   - `var_d6440696e5e27b83` (`Antislip pap.100 75x115`, `caliper_um = NULL`, 200 pp, `GLUED`): `validationStatus: "INVALID_BLOCKED"`, `spineWidthMm: null`, `canReleaseToManufacturing: false`.

6. **Integridad Económica BPE:**
   - `GET https://budget.printprice.pro/api/health` -> HTTP `200` `{"ok":true,"service":"printpricepro-bookprice","env":"production"}`.
   - Oferta de referencia en navegador real (`rec10_bpe_live_1366x768.png`): **`2.169,88 €`** (`0,00 €` de desviación).

7. **Bloqueo de Fabricación y Gobernanza de Seguridad:**
   - `canReleaseToManufacturing: false` se mantiene activo tanto en el módulo de acreditación como en todos los cálculos de Spine Calculator.
   - `SECURITY_ROTATION_PENDING` permanece **ABIERTO** y el PR #11 contra `main` permanece **SIN FUSIONAR**.
