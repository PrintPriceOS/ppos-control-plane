# SPINE-01 — Mapeo de Espesor (`caliper_um` / `bulk`) e Integración con Paper Materials

**Misión:** `SPINE-01 — LIVONIA SPINE CALCULATOR: REVERSE ENGINEERING & ENGINE CONTRACT`  
**Fuente auditada:** Hoja `Papers` (`xl/worksheets/sheet6.xml` en `Livonia print spine calculator 2.0 iekšējā lietošana.xlsx`) + Esquema MySQL real de Control Plane (`migrations/163_phase196b_paper_products_and_import_staging.sql`)  
**Restricciones de la fase:** Cero modificaciones de registros productivos, cero activaciones comerciales automáticas.

---

## 1. Auditoría de la Hoja `Papers` de Livonia Print

La hoja `Papers` (`sheet6.xml`) está estructurada en una cuadrícula de **6 bandas horizontales** (`filas 1–14, 16–27, 31–40, 46–57, 61–73, 76–88`) por **10 columnas de bloques** (`A, F, K, P, U, Z, AE, AJ, AO/AN, AT`), sumando exactamente **60 bloques técnicos de familias de papel** y **375 pares `(gsm, microns)`**.

### 1.1 Inventario Completo de los 60 Bloques Técnicos (`sheet6.xml`)

| # | Coord. | Familia Comercial (`family_name`) | Recubrimiento (`coating_raw`) | Categoría Canónica PPOS | Acabado Canónico | Bulk Declarado (`cm³/g`) | Variantes (`gsm` → `µm`) |
| :-: | :---: | :--- | :--- | :---: | :---: | :---: | :--- |
| **01** | `A1` | **G-Print** | `coated matt` | `COATED` | `SILK` | — | `70→68, 80→77, 90→87, 100→98, 115→113, 130→129, 150→150, 170→172, 200→203, 230→235, 250→255` (11) |
| **02** | `F1` | **G-Print Smooth** | `coated silk` | `COATED` | `SILK` | — | `90→82, 100→91, 115→107, 130→125, 150→145, 170→165, 200→203, 250→255` (8) |
| **03** | `K1` | **Multi Art Matt** | `coated silk` | `COATED` | `SILK` | — | `90→82, 100→91, 115→107, 130→125, 150→145, 170→165, 200→203, 250→255` (8) |
| **04** | `P1` | **Multi Art Silk** | `coated silk` | `COATED` | `SILK` | — | `90→78, 100→87, 115→94, 130→111, 135→115, 150→128, 170→145, 200→176` (8) |
| **05** | `U1` | **Multi Art Gloss** | `coated gloss` | `COATED` | `COATED` | — | `90→71, 100→79, 115→89, 130→100, 150→116, 170→131, 200→154` (7) |
| **06** | `Z1` | **Amber Graphic** | `uncoated` | `OFFSET` | `UNCOATED` | — | `80→99, 90→110, 100→122, 110→133, 120→145, 130→156, 140→168, 150→180` (8) |
| **07** | `AE1` | **Scandia 2000 Ivory** | `uncoated` | `OFFSET` | `UNCOATED` | — | `90→120, 100→130, 115→150, 130→165, 150→195, 170→215` (6) |
| **08** | `AJ1` | **Lessebo Smooth Ivory** | `uncoated` | `DESIGN` / `OFFSET` | `UNCOATED` | — | `100→120, 115→140, 120→144, 130→155, 150→180` (5) |
| **09** | `AO1` | **Lessebo Smooth Natural** | `uncoated` | `DESIGN` / `OFFSET` | `UNCOATED` | — | `100→120, 115→140, 130→155, 150→180, 200→240` (5) |
| **10** | `AT1` | **Maxi Gloss** | `coated gloss` | `COATED` | `COATED` | — | `90→67.5, 100→74, 115→85, 130→96, 150→112` (5) *(Nota: `67.5 µm` decimal)* |
| **11** | `A16` | **Maxi Satin** | `coated silk` | `COATED` | `SILK` | — | `90→77, 100→86, 115→100, 130→113, 150→135` (5) |
| **12** | `F16` | **Arctic Volume White** | `coated matt` | `COATED` | `SILK` | — | `90→99, 100→110, 115→126, 130→143, 150→165, 170→187, 200→220` (7) |
| **13** | `K16` | **Arctic Volume Ivory** | `coated matt` | `COATED` | `SILK` | — | `115→126, 130→143, 150→165, 200→220` (4) |
| **14** | `P16` | **Arctic Silk +** | `coated silk` | `COATED` | `SILK` | — | `90→82, 100→91, 115→107, 130→125, 150→145, 170→165, 200→203, 250→255` (8) |
| **15** | `U16` | **Munken Pure** | `uncoated` | `DESIGN` / `OFFSET` | `UNCOATED` | — | `80→105, 90→118, 100→113, 120→136, 130→147, 150→170, 170→192, 200→226` (8) |
| **16** | `Z16` | **Munken Lynx/Polar** | `uncoated` | `DESIGN` / `OFFSET` | `UNCOATED` | — | `70→79, 80→105, 90→118, 100→113, 120→136, 130→147, 150→170, 170→192, 200→226` (9) |
| **17** | `AE16` | **Munken Lynx Rough** | `uncoated` | `DESIGN` / `OFFSET` | `UNCOATED` | — | `90→126, 100→140, 120→168` (3) |
| **18** | `AJ16` | **Munken Premium White** | `uncoated` | `DESIGN` / `OFFSET` | `UNCOATED` | `1.75` | `80→140, 90→158` (2) |
| **19** | `AO16` | **Munken Premium Cream** | `uncoated` | `DESIGN` / `OFFSET` | `UNCOATED` | `1.30` | `80→104, 90→117, 100→130, 115→150` (4) |
| **20** | `AT16` | **Munken Premium Cream** | `uncoated` | `DESIGN` / `OFFSET` | `UNCOATED` | `1.50` | `80→120, 90→135, 100→150, 115→172` (4) |
| **21** | `A31` | **Munken Premium Cream** | `uncoated` | `DESIGN` / `OFFSET` | `UNCOATED` | `1.75` | `80→140, 90→158, 100→175` (3) |
| **22** | `F31` | **Munken Premium Cream** | `uncoated` | `DESIGN` / `OFFSET` | `UNCOATED` | `1.95` | `80→156, 90→176, 100→195` (3) |
| **23** | `K31` | **Munken Print White** | `uncoated` | `OFFSET` | `UNCOATED` | `1.50` | `70→105, 80→120, 90→135, 100→150, 115→172, 150→225` (6) |
| **24** | `P31` | **Munken Print White** | `uncoated` | `OFFSET` | `UNCOATED` | `1.80` | `70→126, 80→144, 90→162, 100→180, 115→209, 150→270` (6) |
| **25** | `U31` | **Munken Print Cream** | `uncoated` | `OFFSET` | `UNCOATED` | `1.50` | `70→105, 80→120, 90→135, 100→150, 115→172, 150→225` (6) |
| **26** | `Z31` | **Munken Print Cream** | `uncoated` | `OFFSET` | `UNCOATED` | `1.80` | `70→124, 80→144, 90→162, 100→180, 115→209, 150→270` (6) |
| **27** | `AE31` | **Munken Print Classic** | `uncoated` | `OFFSET` | `UNCOATED` | `1.50` | `70→105, 80→120, 90→135` (3) |
| **28** | `AJ31` | **Munken Pocket Cream** | `uncoated` | `OFFSET` | `UNCOATED` | `1.80` | `60→108, 70→126, 80→144, 90→162` (4) |
| **29** | `AO31` | **Munken Polar Rough** | `uncoated` | `DESIGN` / `OFFSET` | `UNCOATED` | — | `90→123, 100→140, 120→168, 150→210, 170→238, 300→420` (6) |
| **30** | `AT31` | **Scandia 2000 White** | `uncoated` | `OFFSET` | `UNCOATED` | — | `80→105, 90→120, 100→130, 115→150, 130→170, 150→200` (6) |
| **31** | `A46` | **Scandia 2000 Natural** | `uncoated` | `OFFSET` | `UNCOATED` | — | `90→120, 100→130, 115→150, 130→165, 150→195, 170→215` (6) |
| **32** | `F46` | **Galerie Art Gloss** | `coated gloss` | `COATED` | `COATED` | — | `90→66, 100→74, 115→85, 130→94, 135→97, 150→110, 170→128, 200→152` (8) |
| **33** | `K46` | **Galerie Art Silk** | `coated silk` | `COATED` | `SILK` | — | `90→76, 100→84, 115→97, 130→109, 135→113, 150→126, 170→145, 200→172` (8) |
| **34** | `P46` | **Galerie Art Matt** | `coated matt` | `COATED` | `SILK` | — | `90→81, 100→90, 115→103, 130→117, 150→135, 170→153, 200→180, 250→225` (8) |
| **35** | `U46` | **Garda Matt Art** | `coated silk` | `COATED` | `SILK` | — | `90→79, 100→86, 115→101, 130→108, 135→112, 150→133, 170→153, 200→187, 250→227` (9) |
| **36** | `Z46` | **Garda Gloss Art** | `coated gloss` | `COATED` | `COATED` | — | `90→67, 100→73, 115→84, 135→103, 150→109, 170→125, 200→150, 250→191` (8) |
| **37** | `AE46` | **Multi offset** | `uncoated` | `OFFSET` | `UNCOATED` | — | `70→90, 80→103, 90→116, 100→126, 120→144, 140→164` (6) |
| **38** | `AJ46` | **Profi Silk** | `coated silk` | `COATED` | `SILK` | — | `80→70, 90→78, 100→87, 115→101, 135→119, 150→135, 170→156, 200→194, 250→225` (9) |
| **39** | `AO46` | **Salzer Eos** | `uncoated` | `OFFSET` | `UNCOATED` | `1.20` | `60→72, 70→84, 80→96, 90→108, 100→120, 120→144, 140→168` (7) |
| **40** | `AT46` | **Salzer Eos** | `uncoated` | `OFFSET` | `UNCOATED` | `1.50` | `60→90, 65→98, 70→105, 80→120, 90→135, 100→150, 110→165, 120→180` (8) |
| **41** | `A61` | **Salzer Eos** | `uncoated` | `OFFSET` | `UNCOATED` | `1.30` | `60→78, 65→85, 70→91, 80→104, 90→117, 100→130, 110→143, 120→156, 140→182` (9) |
| **42** | `F61` | **UPM Sol matt** | `coated matt` | `COATED` | `SILK` | — | `60→63, 70→74, 75→79, 80→84, 90→95, 100→105` (6) |
| **43** | `K61` | **Soporset Premium Offset** | `uncoated` | `OFFSET` | `UNCOATED` | — | `60→80, 70→92, 80→106, 90→116, 100→128, 110→141, 120→150` (7) |
| **44** | `P61` | **Magno plus matt** | `coated matt` | `COATED` | `SILK` | — | `90→92, 100→102, 115→115, 135→135, 150→150, 170→170, 200→180, 250→225` (8) |
| **45** | `U61` | **Lux Cream** | `uncoated` | `OFFSET` | `UNCOATED` | `1.45` | `60→87, 70→102, 80→116` (3) |
| **46** | `Z61` | **Lux Cream** | `uncoated` | `OFFSET` | `UNCOATED` | `1.60` | `60→96, 70→112, 80→128, 90→144` (4) |
| **47** | `AE61` | **Lux Cream** | `uncoated` | `OFFSET` | `UNCOATED` | `1.80` | `60→108, 70→126, 80→144, 90→162` (4) |
| **48** | `AJ61` | **Lux Cream** | `uncoated` | `OFFSET` | `UNCOATED` | `2.00` | `60→120, 65→130, 70→140, 80→160, 90→180` (5) |
| **49** | `AO61` | **Holmen BOOK Cream** | `uncoated` | `OFFSET` | `UNCOATED` | `1.60` | `52→83, 60→96, 70→112, 80→128` (4) |
| **50** | `AT61` | **Holmen BOOK Cream** | `uncoated` | `OFFSET` | `UNCOATED` | `1.80` | `60→108, 70→126, 80→144` (3) |
| **51** | `A76` | **Holmen BOOK Cream** | `uncoated` | `OFFSET` | `UNCOATED` | `2.00` | `55→110, 60→120, 70→140, 80→160` (4) |
| **52** | `F76` | **Magno matt** | `coated matt` | `COATED` | `SILK` | — | `90→90, 100→100, 115→115, 130→130, 135→135, 150→152, 170→173` (7) |
| **53** | `K76` | **Magno satin** | `coated silk` | `COATED` | `SILK` | — | `90→74, 100→82, 115→94, 130→107, 135→111, 150→125, 170→141` (7) |
| **54** | `P76` | **Magno volume** | `coated matt` | `COATED` | `SILK` | — | `90→97, 100→108, 115→124, 130→140, 135→146, 150→162, 170→184` (7) |
| **55** | `U76` | **Magno gloss** | `coated gloss` | `COATED` | `COATED` | — | `90→64, 100→72, 115→83, 130→91, 135→95, 150→107, 170→124` (7) |
| **56** | `Z76` | **Magno natural** | `uncoated` | `OFFSET` | `UNCOATED` | — | `80→103, 90→114, 100→123, 110→136, 120→146, 140→168, 150→180, 170→200` (8) |
| **57** | `AE76` | **Terra Print Silk** | `coated silk` | `COATED` | `SILK` | — | `65→64, 70→68, 75→71, 80→74, 90→81` (5) |
| **58** | `AJ76` | **Garda Pat 1.1** | `coated matt` | `COATED` | `SILK` | — | `90→93, 100→104, 110→117, 115→123, 130→140, 135→147, 150→156, 170→182` (8) |
| **59** | `AN77` | **UPM Finesse premium Silk** | `coated silk` | `COATED` | `SILK` | — | `80→69, 90→76, 100→83, 115→98, 130→111, 135→118, 150→134, 170→158` (8) |
| **60** | `AT76` | **UPM Fine** | `uncoated` | `OFFSET` | `UNCOATED` | — | `60→75, 70→88, 80→100, 90→113, 100→123, 110→132, 120→143, 140→161, 150→172, 170→189` (10) |

---

## 2. Anomalías Físicas y Casos Especiales Detectados en `Papers`

1. **Inversión no monótona en `Munken Pure` (`U16`) y `Munken Lynx/Polar` (`Z16`) entre `80`, `90` y `100 gsm`:**
   - En ambos bloques: `80 gsm → 105 µm` (bulk implícito `1.3125`), `90 gsm → 118 µm` (bulk `1.311`), pero **`100 gsm → 113 µm` (bulk `1.13`)**, y luego `120 gsm → 136 µm` (bulk `1.133`).
   - Esto ocurre porque en esa tabla se mezclaron dos volúmenes (`bulk 1.3` para `80–90 gsm` y `bulk 1.13` para `100–200 gsm`) dentro de una misma columna sin especificar el `bulk` en la cabecera.
2. **Múltiples volúmenes (`bulk`) bajo el mismo nombre comercial:**
   - `Munken Premium Cream` aparece **4 veces** (`bulk: 1.3`, `1.5`, `1.75`, `1.95`). Por ejemplo, a `100 gsm`, su espesor varía entre **`130 µm`, `150 µm`, `175 µm` y `195 µm`** (¡una diferencia del **50 %** en el grosor del lomo para el mismo nombre y gramaje!).
   - `Salzer Eos` aparece **3 veces** (`bulk: 1.2`, `1.3`, `1.5`).
   - `Lux Cream` aparece **4 veces** (`bulk: 1.45`, `1.6`, `1.8`, `2.0`).
   - `Holmen BOOK Cream` aparece **3 veces** (`bulk: 1.6`, `1.8`, `2.0`).
3. **Valores decimales de micras:**
   - `Maxi Gloss 90 gsm` (`AT4`/`AV4`) tiene `caliper_um = 67.5 µm`. En `migrations/163_phase196b_paper_products_and_import_staging.sql`, `paper_variants.caliper_um` es `INT NULL` mientras que `caliper_mm` es `DECIMAL(8,4) NULL`. Para no perder precisión en calibres con medio micrón (`67.5 µm = 0.0675 mm`), debemos soportar `DECIMAL(8,2)` en `caliper_um` o priorizar `caliper_mm` (`0.0675 mm`) como representación exacta.

---

## 3. Auditoría del Esquema Actual en Control Plane (`paper_products` & `paper_variants`)

En [`migrations/163_phase196b_paper_products_and_import_staging.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/163_phase196b_paper_products_and_import_staging.sql#L22-L42), la tabla `paper_variants` ya dispone de:
- `caliper_um INT NULL`
- `caliper_mm DECIMAL(8, 4) NULL`
- `fingerprint VARCHAR(128) NOT NULL` (calculado en [`paperImportService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/paperImportService.js#L1152-L1160) incluyendo `caliper_um`).

Sin embargo, actualmente **carece de trazabilidad epistémica sobre el origen y nivel de confianza del espesor** y del factor `bulk`.

### 3.1 Extensión de Esquema Propuesta para `SPINE-02` (No ejecutada en `SPINE-01`)

Para `SPINE-02`, proponemos añadir a `paper_variants` (y reflejar en los snapshots de decisiones/especificaciones técnicas):

| Columna Nueva en `paper_variants` | Tipo SQL | Propósito y Regla de Gobierno |
| :--- | :--- | :--- |
| **`caliper_um`** *(ajuste de precisión)* | `DECIMAL(8, 2) NULL` | Permite almacenar tanto enteros (`145.00`) como medios micrones (`67.50`) sin truncamiento. |
| **`bulk_factor`** (`bulk_cm3_g`) | `DECIMAL(6, 3) NULL` | Volumen específico aparente declarado (`1.130`, `1.300`, `1.500`, `1.750`, `1.950`, `2.000`). Si se declara en familia/variante, forma parte de la identidad física. |
| **`caliper_source`** | `ENUM('MEASURED_MICROMETER', 'MANUFACTURER_DATASHEET', 'LIVONIA_REFERENCE_IMPORT', 'SUPPLIER_IMPORT', 'BULK_DERIVED', 'NONE') NOT NULL DEFAULT 'NONE'` | Procedencia auditable del espesor. |
| **`caliper_confidence_status`** | `ENUM('VERIFIED', 'REFERENCE_IMPORTED', 'PROVISIONAL_ESTIMATED', 'MISSING') NOT NULL DEFAULT 'MISSING'` | Nivel de certificación para el cálculo de lomo: solo `VERIFIED` o `REFERENCE_IMPORTED` (cuando el perfil de la imprenta lo autorice) pueden liberar una cubierta definitiva para producción. |
| **`caliper_verified_at`** | `TIMESTAMP NULL` | Fecha de verificación técnica o importación. |
| **`caliper_verified_by`** | `VARCHAR(64) NULL` | Actor o lote (`batch_id`) que acreditó el valor. |
| **`caliper_revision`** | `INT NOT NULL DEFAULT 1` | Contador de versión del dato técnico de espesor. |

---

## 4. Algoritmo de Conciliación e Importación Técnica Controlada (`SPINE-02`)

### 4.1 Reglas de Conciliación contra las 1.524 Variantes del Catálogo Maestro

1. **Identidad de Familia + Bulk + Gramaje:**
   - Una referencia de la hoja `Papers` de Livonia **no tiene dimensiones de pliego (`width_mm × height_mm`)**, porque el espesor ($\mu\text{m}$) es una propiedad intrínseca del sustrato (familia + acabado + `bulk` + `gsm`), independiente del formato de corte del pliego (`700×1000`, `640×900`, etc.).
   - Por tanto, la biblioteca de Livonia debe importarse primero en una tabla de referencia técnica (`paper_technical_caliper_reference`) indexada por `(normalized_family_name, coating_finish, declared_bulk, gsm)`.
2. **Regla de No Ambigüedad por Múltiples `bulk`:**
   - Si una familia en `paper_products` (ej. `G-Print`, `Multi Art Silk`, `Amber Graphic`, `Arctic Volume White`) tiene un **único espesor por gramaje** en Livonia y la variante en `paper_variants` tiene `caliper_um IS NULL`, el proceso de enriquecimiento técnico (`SPINE-02`) puede vincular `caliper_um`, asignando `caliper_source = 'LIVONIA_REFERENCE_IMPORT'` y `caliper_confidence_status = 'REFERENCE_IMPORTED'`.
   - Si una familia tiene **múltiples factores `bulk` para el mismo gramaje** (ej. `Munken Premium Cream 100 gsm`, que existe en `bulk 1.3, 1.5, 1.75, 1.95`) y el registro en `paper_products`/`paper_variants` no especifica qué `bulk` es, **queda terminantemente prohibido adivinar o promediar el espesor**: la variante permanece con `caliper_confidence_status = 'MISSING'` (o requiere que el usuario/imprenta elija explícitamente la subvariante de `bulk`).
3. **Separación Estricta entre Biblioteca Técnica y Oferta Comercial:**
   - Ninguna fila de la hoja `Papers` de Livonia creará registros en `supplier_paper_offers` ni alterará `isAvailable` en `GET /api/marketplace/paper-catalog`.
   - Las variantes existentes en `paper_variants` que ya posean un `caliper_um` procedente de importación real de proveedor (`SUPPLIER_IMPORT`) **no serán sobrescritas**; si difieren en más de $\pm 3\,\mu\text{m}$ respecto a la tabla de Livonia, se registrará una alerta de discrepancia técnica en `metadata_json.caliper_discrepancy` para revisión del tecnólogo.

