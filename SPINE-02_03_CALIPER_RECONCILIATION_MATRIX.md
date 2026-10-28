# SPINE-02/03 — Matriz de Reconciliación de Espesor (`caliper_um`) y Procedencia Técnica

**Misión:** `SPINE-02/03 — PAPER CALIPER + CONTROL PLANE SPINE ENGINE`  
**Migración SQL Aditiva:** [`migrations/172_phase197a_paper_caliper_and_livonia_reference.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/172_phase197a_paper_caliper_and_livonia_reference.sql)  
**Dataset Inmutable (375 Pares / 60 Bloques):** [`src/api/services/spine/livoniaPaperReferenceData.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/livoniaPaperReferenceData.js)  
**Servicio de Reconciliación y Procedencia:** [`src/api/services/spine/paperCaliperReconciliationService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/paperCaliperReconciliationService.js)

---

## 1. Modelo de Datos y Separación Estricta de Responsabilidades

En cumplimiento de la Fase 2 (`SPINE-02`), el espesor físico de una variante de papel (`caliper_um`) se modela y gobierna con **cero sobrescritura silenciosa** y **cero estimación por gramaje**:

### 1.1 Extensión Aditiva sobre `paper_variants`
La migración [`172_phase197a_paper_caliper_and_livonia_reference.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/172_phase197a_paper_caliper_and_livonia_reference.sql) añade de forma retrocompatible:
- `caliper_um DECIMAL(8,2) NULL` — Espesor de una hoja en micras ($\mu\text{m}$), con soporte para decimales reales de Livonia (`102.50`, `112.50`, `130.50`, `157.50`).
- `bulk_factor DECIMAL(6,3) NULL` — Factor de mano ($\text{cm}^3/\text{g}$, equivalente a $\text{caliper\_um} / \text{gsm}$).
- `caliper_source ENUM('MEASURED_MICROMETER', 'MANUFACTURER_DATASHEET', 'LIVONIA_REFERENCE_IMPORT', 'SUPPLIER_IMPORT', 'MANUAL_ADMIN', 'NONE') NOT NULL DEFAULT 'NONE'`.
- `caliper_confidence_status ENUM('VERIFIED', 'REFERENCE_IMPORTED', 'PENDING_REVIEW', 'UNVERIFIED', 'CONFLICT', 'MISSING') NOT NULL DEFAULT 'MISSING'`.
- `caliper_verified_at TIMESTAMP NULL`, `caliper_verified_by VARCHAR(128) NULL`, `caliper_revision INT UNSIGNED NOT NULL DEFAULT 1`.

### 1.2 Biblioteca Técnica de Referencia (`paper_technical_caliper_reference`)
Almacena de forma aislada los **375 pares `(gsm, caliper_um)`** distribuidos en **60 bloques de familia** extraídos de la hoja `Papers` de `Livonia print spine calculator 2.0 iekšējā lietošana.xlsx`.
- **Invariante comercial:** Esta tabla es estrictamente una biblioteca técnica de referencia. **No crea ofertas comerciales, no activa variantes en el catálogo público y no modifica tarifas de BPE.**

### 1.3 Bandeja de Reconciliación (`paper_caliper_reconciliation_candidates`)
Clasifica cada variante comercial frente a la biblioteca de referencia en cuatro estados deterministas antes de cualquier aplicación:

| Estado de Reconciliación (`reconciliation_status`) | Condición Exacta en `evaluateVariantCaliperReconciliation` | ¿Permite Auto-Asignación sin Aprobación Explícita? | Acción Gobernada |
| :--- | :--- | :---: | :--- |
| **`SAFE_EXACT_MATCH`** | Coincidencia exacta de `(familia, gsm)` con un único valor de espesor en Livonia, sin anomalía no monótona y sin conflicto con un `caliper_um` previo. | **NO** (`reviewDecision = 'PENDING_REVIEW'`) | Queda lista para aprobación explícita del administrador/tecnólogo (`canAutoApplyOnApproval: true`). |
| **`AMBIGUOUS_MULTIPLE_BULK`** | La familia existe en múltiples manos en Livonia (p. ej. *Munken Premium Cream* `1.3`, `1.5`, `1.75`, `1.95`) y la variante comercial no especifica `bulk_factor`, o pertenece a una columna con transición de mano interna (*Munken Pure* / *Munken Lynx/Polar*). | **NO** (`canAutoApplyOnApproval: false`) | **Rechaza adivinar o promediar.** Requiere que el tecnólogo indique el `bulk_factor` o mida el lote. |
| **`CONFLICT_EXISTING_CALIPER`** | La variante ya posee un `caliper_um` verificado (`MEASURED_MICROMETER` o `MANUFACTURER_DATASHEET`) cuya diferencia con Livonia supera $0.5\,\mu\text{m}$. | **NO** (`canAutoApplyOnApproval: false`) | **Prohibido sobrescribir.** Prevalece siempre el valor verificado en catálogo (`existingCaliperUm`). |
| **`UNMATCHED_IN_REFERENCE`** | La familia o el gramaje no figuran entre los 375 pares de Livonia. | **NO** (`canAutoApplyOnApproval: false`) | Permanece con `caliper_um = NULL` y `caliperConfidenceStatus = 'MISSING'` hasta carga de ficha técnica. |

---

## 2. Demostración Industrial: Mismo Gramaje (`100 gsm`) $\neq$ Mismo Espesor ni Mismo Lomo

Para un bloque interior de **$200\text{ páginas}$**, formato **$170 \times 240\text{ mm}$**, encuadernación **tapa blanda cosida (`SEWN`, perfil `livonia-alegro-softcover@2.0.0`)** y cubierta de $255\,\mu\text{m}$:

| Papel (Todos de **100 gsm**) | Mano (`bulk_factor`) | Espesor Hoja (`caliper_um`) | Grosor Bloque Neto (`netPaperBlockMm`) | Lomo Redondeado (`spineWidthMm`) | Ancho Cubierta Extendida (`flatCoverWidthMm`) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **G-Print 100 gsm** (Estucado mate) | `0.98` | **$98.0\,\mu\text{m}$** | $9.80\text{ mm}$ | **$11.5\text{ mm}$** | **$351.5\text{ mm}$** |
| **Amber Graphic 100 gsm** (Offset blanco) | `1.22` | **$122.0\,\mu\text{m}$** | $12.20\text{ mm}$ | **$14.0\text{ mm}$** | **$354.0\text{ mm}$** |
| **Munken Premium Cream 1.5 — 100 gsm** | `1.50` | **$150.0\,\mu\text{m}$** | $15.00\text{ mm}$ | **$16.5\text{ mm}$** | **$356.5\text{ mm}$** |
| **Munken Premium Cream 1.75 — 100 gsm** | `1.75` | **$175.0\,\mu\text{m}$** | $17.50\text{ mm}$ | **$19.0\text{ mm}$** | **$359.0\text{ mm}$** |
| **Munken Premium Cream 1.95 — 100 gsm** | `1.95` | **$195.0\,\mu\text{m}$** | $19.50\text{ mm}$ | **$21.0\text{ mm}$** | **$361.0\text{ mm}$** |

> **Conclusión verificada en tests (`2.1`):** Con el mismo gramaje comercial de `100 gsm`, el lomo varía entre **$11.5\text{ mm}$** y **$21.0\text{ mm}$** ($+9.5\text{ mm}$ de diferencia). Por ello, `SpineCalculator` rechaza cualquier cálculo que intente derivar el espesor únicamente a partir de `gsm`.

---

## 3. Familias Multi-Bulk y Anomalías Detectadas en la Hoja `Papers` de Livonia

### 3.1 Familias con Múltiples Manos Explícitas (`AMBIGUOUS_MULTIPLE_BULK` si la variante no declara mano)

| Familia en Livonia (`Papers`) | Bloques en Excel | Manos Declaradas (`declaredBulk`) | Gramajes ($\text{gsm}$) | Regla en `paperCaliperReconciliationService.js` |
| :--- | :---: | :--- | :--- | :--- |
| **Munken Premium Cream** | `#25, #26, #27, #28` | `1.3`, `1.5`, `1.75`, `1.95` | `80, 90, 100, 115, 130, 150, 170` | Si la variante comercial no declara `bulk_factor`, se marca como `AMBIGUOUS_MULTIPLE_BULK` con las 4 referencias candidatas y `proposedCaliperUm = null`. |
| **Munken Print Cream** | `#29, #30` | `1.5`, `1.8` | `70, 80, 90, 100, 115, 150` | Requiere `bulk_factor` (`1.5` o `1.8`) para resolver sin ambigüedad. |
| **Munken Print White** | `#31, #32` | `1.5`, `1.8` | `70, 80, 90, 100, 115, 150` | Requiere `bulk_factor` (`1.5` o `1.8`) para resolver sin ambigüedad. |
| **Salzer Eos** | `#39, #40, #41` | `1.2`, `1.3`, `1.5` | `80, 90` | Requiere `bulk_factor` (`1.2`, `1.3` o `1.5`). |
| **Lux Cream** | `#47, #48, #49, #50` | `1.45`, `1.6`, `1.8`, `2.0` | `60, 70, 80, 90, 100` | Requiere `bulk_factor` (`1.45`, `1.6`, `1.8` o `2.0`). |
| **Holmen Book Cream** | `#54, #55, #56` | `1.6`, `1.8`, `2.0` | `52, 55, 60, 65, 70, 80` | Requiere `bulk_factor` (`1.6`, `1.8` o `2.0`). |

### 3.2 Familias con Transición No Monótona de Mano en una Misma Columna
En la hoja `Papers` de Livonia, dos bloques agrupan en una sola columna papeles de mano `1.3` ($80..90\text{ g}$) y mano `1.13` ($100..400\text{ g}$):
1. **Bloque #23 (`Munken Pure`)**: `80g = 105 µm` (bulk `1.31`), `90g = 118 µm` (bulk `1.31`), pero **`100g = 113 µm`** (bulk `1.13`).
2. **Bloque #24 (`Munken Lynx/Polar`)**: `80g = 105 µm` (bulk `1.31`), `90g = 118 µm` (bulk `1.31`), pero **`100g = 113 µm`** (bulk `1.13`).

**Protección implementada:** `NON_MONOTONIC_WARNING_FAMILIES` en [`paperCaliperReconciliationService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/paperCaliperReconciliationService.js#L27-L30) intercepta automáticamente `MUNKEN PURE` y `MUNKEN LYNX/POLAR` cuando no tienen `bulk_factor` declarado y los clasifica como `AMBIGUOUS_MULTIPLE_BULK`, exigiendo confirmación explícita de mano (`1.13` vs `1.3`) antes de asignar el espesor.

---

## 4. Inventario Completo de los 60 Bloques (375 Pares) en `paper_technical_caliper_reference`

| Bloque | Celda Excel | Familia (`family_name`) | Recubrimiento Original | Categoría Canónica | Mano Declarada | Nº Pares | Rango GSM | Rango Espesor ($\mu\text{m}$) | Clasificación de Reconciliación |
| :---: | :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| 1 | `A1` | G-Print | coated matt | `COATED` | — | 12 | 70–300 | 68–309 | `SAFE_EXACT_MATCH` (si familia+gsm coinciden) |
| 2 | `E1` | Tom&Otto Silk | coated matt | `COATED` | — | 11 | 70–300 | 57–270 | `SAFE_EXACT_MATCH` |
| 3 | `I1` | Tom&Otto Gloss | coated glossy | `COATED` | — | 11 | 70–300 | 53–233 | `SAFE_EXACT_MATCH` |
| 4 | `M1` | Galerie Art Bulk | coated matt | `COATED` | — | 6 | 90–170 | 81–167 | `SAFE_EXACT_MATCH` |
| 5 | `Q1` | Galerie Art Silk | coated matt | `COATED` | — | 12 | 80–350 | 69–350 | `SAFE_EXACT_MATCH` |
| 6 | `U1` | Galerie Art Gloss | coated glossy | `COATED` | — | 12 | 80–350 | 62–287 | `SAFE_EXACT_MATCH` |
| 7 | `Y1` | Multiart Silk | coated matt | `COATED` | — | 12 | 80–350 | 70–343 | `SAFE_EXACT_MATCH` |
| 8 | `AC1` | Multiart Gloss | coated glossy | `COATED` | — | 12 | 80–350 | 64–291 | `SAFE_EXACT_MATCH` |
| 9 | `AG1` | GardaPat 13 Kiara | coated matt | `COATED` | `1.3` | 6 | 90–200 | 117–260 | `SAFE_EXACT_MATCH` |
| 10 | `AK1` | GardaPat 13 Bianka | coated matt | `COATED` | `1.3` | 6 | 90–200 | 117–260 | `SAFE_EXACT_MATCH` |
| 11 | `AO1` | GardaPat 13 Klassica | coated matt | `COATED` | `1.3` | 6 | 90–200 | 117–260 | `SAFE_EXACT_MATCH` |
| 12 | `AS1` | GardaMatt Art | coated matt | `COATED` | — | 9 | 90–300 | 82–297 | `SAFE_EXACT_MATCH` |
| 13 | `AW1` | GardaGloss Art | coated glossy | `COATED` | — | 9 | 90–300 | 74–261 | `SAFE_EXACT_MATCH` |
| 14 | `BA1` | GardaMatt Ultra | coated matt | `COATED` | `1.12` | 7 | 90–200 | 101–224 | `SAFE_EXACT_MATCH` |
| 15 | `BE1` | Condat Matt Perigord | coated matt | `COATED` | — | 10 | 90–350 | 80–345 | `SAFE_EXACT_MATCH` |
| 16 | `BI1` | Condat Gloss | coated glossy | `COATED` | — | 10 | 90–350 | 71–287 | `SAFE_EXACT_MATCH` |
| 17 | `BM1` | Magno Volume | coated matt | `COATED` | `1.1` | 8 | 80–200 | 86–216 | `SAFE_EXACT_MATCH` |
| 18 | `BQ1` | Magno Satin | coated matt | `COATED` | — | 12 | 80–350 | 68–333 | `SAFE_EXACT_MATCH` |
| 19 | `BU1` | Magno Gloss | coated glossy | `COATED` | — | 12 | 80–350 | 64–285 | `SAFE_EXACT_MATCH` |
| 20 | `BY1` | Tatami White/Ivory | coated matt | `COATED` | — | 6 | 115–250 | 145–325 | `SAFE_EXACT_MATCH` |
| 21 | `CC1` | Symbol Tatami | coated matt | `COATED` | `1.3` | 6 | 115–250 | 145–325 | `SAFE_EXACT_MATCH` |
| 22 | `CG1` | Symbol Matt Plus | coated matt | `COATED` | — | 7 | 115–300 | 108–297 | `SAFE_EXACT_MATCH` |
| 23 | `A19` | Munken Pure | uncoated | `OFFSET` | `1.3 / 1.13` | 11 | 80–400 | 105–452 | `AMBIGUOUS_MULTIPLE_BULK` (sin mano explícita) |
| 24 | `E19` | Munken Lynx/Polar | uncoated | `OFFSET` | `1.3 / 1.13` | 11 | 80–400 | 105–452 | `AMBIGUOUS_MULTIPLE_BULK` (sin mano explícita) |
| 25–28 | `I19..U19` | Munken Premium Cream | uncoated | `OFFSET` | `1.3, 1.5, 1.75, 1.95` | 20 | 80–170 | 104–332 | `AMBIGUOUS_MULTIPLE_BULK` (requiere mano) |
| 29–30 | `Y19..AC19` | Munken Print Cream | uncoated | `OFFSET` | `1.5, 1.8` | 12 | 70–150 | 105–270 | `AMBIGUOUS_MULTIPLE_BULK` (requiere mano) |
| 31–32 | `AG19..AK19` | Munken Print White | uncoated | `OFFSET` | `1.5, 1.8` | 12 | 70–150 | 105–270 | `AMBIGUOUS_MULTIPLE_BULK` (requiere mano) |
| 33 | `AO19` | Amber Graphic | uncoated | `OFFSET` | `1.22` | 9 | 70–240 | 87–288 | `SAFE_EXACT_MATCH` |
| 34 | `AS19` | Offset / Amber Preprint | uncoated | `OFFSET` | — | 9 | 70–240 | 90–288 | `SAFE_EXACT_MATCH` |
| 35 | `AW19` | Serixo | uncoated | `OFFSET` | — | 7 | 70–150 | 93–195 | `SAFE_EXACT_MATCH` |
| 36 | `BA19` | Soporset | uncoated | `OFFSET` | — | 9 | 60–190 | 79–245 | `SAFE_EXACT_MATCH` |
| 37 | `BE19` | Olin Regular | uncoated | `OFFSET` | — | 9 | 70–300 | 92–375 | `SAFE_EXACT_MATCH` |
| 38 | `BI19` | Cyclus Offset | uncoated | `OFFSET` | — | 8 | 70–250 | 92–338 | `SAFE_EXACT_MATCH` |
| 39–41 | `BM19..BU19` | Salzer Eos | uncoated | `OFFSET` | `1.2, 1.3, 1.5` | 6 | 80–90 | 96–135 | `AMBIGUOUS_MULTIPLE_BULK` (requiere mano) |
| 42 | `BY19` | Ensocoat 2S | coated 2S | `CARTON` | — | 7 | 215–400 | 250–490 | `SAFE_EXACT_MATCH` |
| 43 | `CC19` | Invercote G | coated 1S | `CARTON` | — | 8 | 200–380 | 245–495 | `SAFE_EXACT_MATCH` |
| 44 | `CG19` | Incada Exel | coated 1S | `CARTON` | — | 6 | 220–350 | 350–615 | `SAFE_EXACT_MATCH` |
| 45 | `CK19` | Incada Silk | coated 1S | `CARTON` | — | 6 | 220–350 | 315–545 | `SAFE_EXACT_MATCH` |
| 46 | `CO19` | Arktika | coated 1S | `CARTON` | — | 6 | 200–350 | 260–510 | `SAFE_EXACT_MATCH` |
| 47–50 | `A37..M37` | Lux Cream | uncoated | `OFFSET` | `1.45, 1.6, 1.8, 2.0` | 20 | 60–100 | 87–200 | `AMBIGUOUS_MULTIPLE_BULK` (requiere mano) |
| 51 | `Q37` | Book Paper Cream | uncoated | `OFFSET` | `2.0` | 4 | 60–90 | 120–180 | `SAFE_EXACT_MATCH` |
| 52 | `U37` | Enso Creamy | uncoated | `OFFSET` | `2.0` | 4 | 60–80 | 120–160 | `SAFE_EXACT_MATCH` |
| 53 | `Y37` | Enso Bulky | uncoated | `OFFSET` | `2.0` | 4 | 60–80 | 120–160 | `SAFE_EXACT_MATCH` |
| 54–56 | `AC37..AK37` | Holmen Book Cream | uncoated | `OFFSET` | `1.6, 1.8, 2.0` | 18 | 52–80 | 83–160 | `AMBIGUOUS_MULTIPLE_BULK` (requiere mano) |
| 57 | `AO37` | Holmen TRND | uncoated | `OFFSET` | `2.0` | 4 | 55–80 | 110–160 | `SAFE_EXACT_MATCH` |
| 58 | `AS37` | Stella Press | coated LWC | `COATED` | — | 4 | 54–70 | 49–63 | `SAFE_EXACT_MATCH` |
| 59 | `AW37` | Solaris | coated LWC | `COATED` | — | 4 | 54–70 | 49–63 | `SAFE_EXACT_MATCH` |
| 60 | `BA37` | Primapress | coated LWC | `COATED` | — | 4 | 54–70 | 49–63 | `SAFE_EXACT_MATCH` |
