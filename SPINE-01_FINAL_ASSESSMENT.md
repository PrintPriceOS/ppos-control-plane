# SPINE-01 — Dictamen Técnico Final y Hoja de Ruta (`SPINE-01_FINAL_ASSESSMENT`)

**Misión:** `SPINE-01 — LIVONIA SPINE CALCULATOR: REVERSE ENGINEERING & ENGINE CONTRACT`  
**Fecha:** 28 de octubre de 2026  
**Estado:** **`SPINE-01_CONTRACT_CERTIFIED`** (Cero despliegues productivos, cero migraciones ejecutadas, paridad matemática del 100 % frente al archivo original `Livonia print spine calculator 2.0 iekšējā lietošana.xlsx`).

---

## 1. Resumen Ejecutivo de Hallazgos de Ingeniería Inversa

El análisis directo del árbol XML OOXML del libro de Livonia (`xl/worksheets/sheet1..6.xml`, `xl/drawings/vmlDrawing1..5.vml` y `xl/ctrlProps/ctrlProp1..63.xml`) ha permitido extraer con precisión de bit todas las ecuaciones, constantes, tablas escalonadas y controles de formulario:

1. **Confirmación de las 3 precauciones clave señaladas en el planteamiento:**
   - **Naturaleza del ajuste de `+6 mm` en Tapa Blanda (Hojas 1 y 2):** Queda documentalmente demostrado por la celda `E39` (`=C10*2+E14 = 358 mm` en Hoja 1 y `=B30+C30+E30+F30+H30 = 536.5 mm` en Hoja 2) y las etiquetas `C17`/`C19` (`ieskaitot 3mm pārlaidi`) que los `+6 mm` en `E16` y `E18` corresponden **exclusivamente a `3 mm` de sangrado perimetral exterior por cada lado**. En cambio, en Tapa Dura (Hoja 3), el forro exterior (`H18 × H19 = 407 × 283 mm`) **no añade `+6 mm` de sangrado**, sino que suma las **vueltas del forro (`Noloki = 19 mm` o `18 mm`)** sobre los cartones (`Papes izmērs = 165 × 245 mm`) y los cajos (`Rastri = 8 mm`), mientras que la **sobrecubierta (`Supervāks`, `R20 × R21 = 535 × 251 mm`)** sí añade `+6 mm` de sangrado sobre su desarrollo neto (`R40 = 529 mm`).
   - **El gramaje (`gsm`) no determina el espesor (`caliper_um`):** En la hoja `Papers` (60 bloques, 375 variantes), para un mismo gramaje de `100 gsm` encontramos desde `72 µm` (`Magno gloss`) y `98 µm` (`G-Print`) hasta `195 µm` (`Munken Premium Cream bulk 1.95`), lo que en un libro de 200 páginas supone pasar de **`7.2 mm` a `19.5 mm` de bloque** (+170 % de diferencia). Además, una misma marca como `Munken Premium Cream` se fabrica en 4 volúmenes (`bulk 1.3, 1.5, 1.75, 1.95`), por lo que cuando una variante en `paper_variants` carezca de `caliper_um` o `bulk_factor` inequívoco, el sistema no adivinará el espesor.
   - **Discrepancias e incompletitudes internas en Tapa Dura y Flexi (Hojas 3, 4 y 5):**
     - En la Hoja 3 (`Colibri`), la celda `AF13`/`AF14` conserva una guarda textual `IF(AG3="uncoated > 29 mm", "Contact staff", ...)` junto a la nota `AI3` (*"No estucado hasta 29 mm se puede calcular, por encima lo calculan los tecnólogos"*), pero en la versión 2.0 la fórmula de `AG3` fue reemplazada por dos regresiones lineales según el plegado (`16` vs `32` páginas). Nuestro motor conservará la fórmula numérica de `AG3` pero disparará una advertencia explícita (`UNCOATED_BLOCK_OVER_29MM_TECH_REVIEW_RECOMMENDED`) para mantener el control tecnológico.
     - En las Hojas 4 y 5 (`Flexi`), los ejemplos están guardados con `0 páginas`, las ramas de lomo recto llevan la anotación `"pagaidām flexi neizmantojam"` (*"por ahora no usamos flexi [recto]"*) y están desconectadas de la celda de salida `R17`, y la Hoja 5 (`Flexi ar atlokiem`) omite el sangrado horizontal en los extremos de las solapas (`D18 = E39 = 590.5 mm`). Esto respalda al 100 % tu decisión de dejar **Flexi desactivado para liberación automática** hasta disponer de muestras físicas certificadas.

---

## 2. Índice de Entregables Generados en `SPINE-01`

| Entregable | Ruta en Repositorio | Contenido Certificado |
| :--- | :--- | :--- |
| **1. Inventario de Fórmulas Excel** | [`SPINE-01_EXCEL_FORMULA_INVENTORY.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/SPINE-01_EXCEL_FORMULA_INVENTORY.md) | Matriz coordenada por coordenada (`sheet1..6.xml`) y los 63 controles VML (`vmlDrawing1..5.vml`). |
| **2. Mapeo de Espesor (`Papers`)** | [`SPINE-01_PAPER_CALIPER_MAPPING.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/SPINE-01_PAPER_CALIPER_MAPPING.md) | Los 60 bloques y 375 pares `(gsm, µm)` de la hoja `Papers`, anomalías detectadas y extensión propuesta para `paper_variants`. |
| **3. Especificación de Perfiles** | [`SPINE-01_BINDING_PROFILES_SPEC.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/SPINE-01_BINDING_PROFILES_SPEC.md) | Parametrización de `livonia-alegro-softcover@2.0.0`, `livonia-colibri-hardcover@2.0.0` y `livonia-colibri-flexi@2.0.0`. |
| **4. Contrato del Motor** | [`SPINE-01_ENGINE_CONTRACT.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/SPINE-01_ENGINE_CONTRACT.md) | Tipos de entrada/salida, pipeline de 5 funciones puras (`blockThickness`, `bindingAdjustment`, `spineWidth`, `coverGeometry`, `manufacturingValidation`) y redondeo IEEE-754. |
| **5. Integración Control Plane & Budget** | [`SPINE-01_BUDGET_CONTROL_INTEGRATION.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/SPINE-01_BUDGET_CONTROL_INTEGRATION.md) | Endpoints API, tabla `spine_calculation_snapshots`, reglas de invalidación ante `PROPOSE_ALTERNATIVE` y diseño UI en Budget App. |
| **6. Fixtures de Paridad Matemática** | [`SPINE-01_TEST_FIXTURES.json`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/SPINE-01_TEST_FIXTURES.json) | 12 escenarios verificados (los 5 estados almacenados en el Excel + 7 casos de frontera, combinación de papeles, páginas impares y solapas excesivas). |
| **7. Dictamen Final** | [`SPINE-01_FINAL_ASSESSMENT.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/SPINE-01_FINAL_ASSESSMENT.md) | Este documento de síntesis y plan de ejecución para `SPINE-02..05`. |

---

## 3. Secuencia Recomendada para las Fases Siguientes (`SPINE-02` a `SPINE-05`)

1. **`SPINE-02 — Paper Materials Caliper & Bulk Enrichment`:**
   - Migración aditiva en Control Plane para incorporar `bulk_factor`, `caliper_source`, `caliper_confidence_status`, `caliper_verified_at` y `caliper_revision` en `paper_variants`, más la tabla de biblioteca técnica `paper_technical_caliper_reference` con los 60 bloques / 375 registros de Livonia.
   - Exposición de `caliperUm`, `bulkFactor`, `caliperSource` y `caliperConfidenceStatus` en `/api/marketplace/paper-catalog`.
2. **`SPINE-03 — Control Plane SpineCalculationService & Snapshots`:**
   - Implementación del motor puro `spineCalculationEngine.js` validado al 100 % contra [`SPINE-01_TEST_FIXTURES.json`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/SPINE-01_TEST_FIXTURES.json).
   - Endpoints `POST /api/v1/spine/calculate`, `GET /api/v1/spine/profiles`, `GET /api/v1/spine/calculations/:id` y conexión con `orderPaperDecisionService.js` y `orderQuoteRevisionService.js`.
3. **`SPINE-04 — Budget App Reactive Spine & Cover Geometry Panel`:**
   - Creación de `BookSpineGeometryPanel.tsx` con diagrama técnico SVG de cubierta abierta y actualización reactiva en `BookPriceForm.tsx`, `ConfigurationSummary.tsx` y `QuoteRevisionReview.tsx`.
4. **`SPINE-05 — Preflight Cover Dimension Gate`:**
   - Validación automática del PDF de cubierta frente a `flat_cover_width_mm × flat_cover_height_mm` de la instantánea `ACTIVE` en `order_effective_technical_specifications`.

