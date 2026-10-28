# PAPER-MATERIALS-RECOVERY-05 — Plan de Cierre de Brecha de Espesores (Grupo D: 353 Variantes sin Caliper)

**Proyecto:** PrintPrice OS  
**Misión:** `PAPER-MATERIALS-RECOVERY-05 — Resolución basada en evidencia de atributos y espesores pendientes`  
**Alcance:** Las **`353` variantes** (`23,16 %` del catálogo de `1.524`) que permanecieron con `caliper_um IS NULL` tras `PAPER-CALIPER-RECOVERY-02` porque su celda `MICRONS` / `THICKNESS` estaba vacía o en `0` en `Paper data base.ods.zip` (o pertenecían a las `9` variantes con conflicto preservado).  
**Invariante Inviolable:** **Prohibido deducir micras únicamente a partir de `gsm`**. Se distingue estrictamente entre **espesor importado de variante hermana (`SIBLING_FORMAT_ODS_IMPORT`)**, **espesor documentado en ficha técnica oficial de fabricante (`MANUFACTURER_DATASHEET_DOCUMENTED`)**, y **medición física con micrómetro ISO 534 (`VERIFIED`)**.

---

## 1. Segmentación por Prioridad Operativa para Testers en Spine Calculator

Las `353` variantes sin espesor se han clasificado en tres niveles de prioridad según su uso real en el flujo de cálculo de lomo y cubierta de **Spine Calculator**:

| Prioridad para Testers (Spine Calculator) | Variantes (`353`) | Criterio Funcional | Familias Principales |
| :--- | :---: | :--- | :--- |
| **`HIGH_INTERIOR_BOOK_BLOCK` (Prioridad 1 — Bloque interior de libro)** | **`173`** (`49,0 %`) | Papeles de interior (`OFFSET`, `COATED` y papeles `DESIGN` de edición como *Munken*, `70–170 gsm`) utilizados para calcular el espesor del bloque (`netPaperBlockMm`) y el ancho del lomo (`spineWidthMm`). | *G-Silk*, *Galerie Art Silk/Matt*, *MultiArt Silk*, *Amber Graphic*, *Munken Pure / Pure Rough / Polar / Print Cream*, *Serixo*, *Maestro Print*, *Balance Silk*, *Omela Matt* |
| **`MEDIUM_COVER_AND_BOARD` (Prioridad 2 — Cubiertas y Cartulinas)** | **`66`** (`18,7 %`) | Cartulinas gráficas (`CARTON`) y papeles de `200–400 gsm` empleados en cubiertas flexibles con solapas o cosidas (`sewnCoverCaliperMultiplier = 2.0`). | *Invercote*, *Ensocoat*, *Algro Design*, *Burano 250–320g*, *Sirio Color 210–290g*, *Keaykolour 250–300g* |
| **`LOW_SPECIALTY_OR_COVERING` (Prioridad 3 — Recubrimiento de tapa dura, autocopiativos y adhesivos)** | **`114`** (`32,3 %`) | Materiales de forrado de tapa dura (*Efalin*, *Geltex*), papel autocopiativo (*Reacto*) o adhesivos (*Sticotac*) que no forman parte del bloque de páginas de un libro o cuyo espesor de guarda/forro está parametrizado en el perfil de encuadernación (`Colibri Hardcover`). | *Efalin FINE LINEN* (`19`), *Efalin NEW LINEN* (`10`), *Efalin WOVE* (`10`), *Reacto* (`11`), *Geltex* (`8`), *Sticotac* (`3`), *Kaskad* (`4`) |

---

## 2. Clasificación por Vía de Resolución Basada en Evidencia (`353` Variantes)

Al cruzar las `353` variantes sin espesor contra (a) las variantes hermanas del mismo producto y gramaje en `Control.paper_variants` y (b) las fichas técnicas oficiales de fabricante (*Arctic Paper*, *Sappi*, *Mondi*, *UPM*, *Guarro Casas / Zanders*), se obtienen tres tramos de resolución trazables:

| Tramo de Resolución (`caliper_gap_status`) | Variantes (`353`) | Nivel de Provenance Propuesto (`caliper_source` / `caliper_confidence_status`) | Explicación y Evidencia |
| :--- | :---: | :--- | :--- |
| **Tramo D1 — `CANDIDATE_FROM_SIBLING_SHEET_FORMAT_ODS`** | **`67`** (`18,98 %`) | `caliper_source = 'SUPPLIER_IMPORT'`<br>`caliper_confidence_status = 'REFERENCE_IMPORTED'`<br>`metadata_json.caliper_recovery_method = 'SIBLING_FORMAT_ODS_IMPORT'` | El mismo papel y gramaje exacto `(familia comercial, gsm)` **ya tiene espesor acreditado en otra variante de distinto formato de pliego** (`64×90` vs `72×102` vs `102×72`) dentro de `Control.paper_variants`, con `0` discrepancias entre formatos hermanos. Ejemplo: *Amber Graphic 150 80x53* (`var_aac1e2cb08becbdc`) tiene hermanos *Amber Graphic 150 72x102* y *88x63* con **`178 µm`** en el ODS; *Galerie Art Silk 150* y *G-Silk* tienen el espesor exacto en sus formatos B1/B2 hermanos. |
| **Tramo D2 — `CANDIDATE_FROM_OFFICIAL_MILL_DATASHEET`** | **`112`** (`31,73 %`) | `caliper_source = 'MANUFACTURER_DATASHEET'`<br>`caliper_confidence_status = 'REFERENCE_IMPORTED'`<br>`metadata_json.caliper_recovery_method = 'OFFICIAL_MILL_DATASHEET'` | El par `(familia comercial, gsm)` figura en la **ficha técnica oficial publicada por el fabricante** con su espesor nominal en $\mu\text{m}$ según ISO 534: *Munken Pure / Pure Rough / Polar / Print Cream* (Arctic Paper Munkedal), *G-Silk / G-Print / Arctic Volume* (Arctic Paper), *Galerie Art Matt / Silk / Gloss* (Sappi Europe), *Maestro Print / Serixo / IQ Print* (Mondi), *MultiArt Silk / Balance Silk* (Papyrus) y *Efalin / Geltex 115–130g* (Guarro Casas / Zanders). |
| **Tramo D3 — `REQUIRES_MILL_DATASHEET_OR_MICROMETER_MEASUREMENT`** | **`174`** (`49,29 %`) | Permanece `caliper_um = NULL`, `caliper_source = 'NONE'`, `caliper_confidence_status = 'MISSING'` hasta aportar documento o medición ISO 534 | Papeles tintados en masa o especialidades multimarca (*Sirio Color*, *Burano*, *Keaykolour*, *Rainbow*, *Colorit*, *Kaskad*, *Reacto*, *Sticotac*, *Omela*) y los **`9` conflictos de espesor preservados** de `RECOVERY-02`. **No se les asigna ningún espesor estimado a partir de `gsm`.** |

---

## 3. Impacto Cuantitativo Proyectado de los Tramos D1 + D2

Si tras la revisión técnica se autoriza la aplicación de los Tramos **D1 (`67` variantes)** y **D2 (`112` variantes)** —ambos sustentados en evidencia documental del propio catálogo del proveedor o de la ficha técnica oficial del fabricante—:

- **Variantes recuperables con evidencia documental (D1 + D2)**: **`179` variantes** (`67 + 112`).
- **Cobertura total de espesor en el catálogo (`1.524` variantes)**:
  - Actual (`RECOVERY-02` / `RECOVERY-04`): `1.171 / 1.524` (**`76,84 %`**).
  - Con Tramo D1 (`+67`): `1.238 / 1.524` (**`81,23 %`**).
  - Con Tramos D1 + D2 (`+179`): **`1.350 / 1.524` (`88,58 %`)**, cubriendo prácticamente el `100 %` de los papeles estándar de interior de libro (`OFFSET`, `COATED` y gama *Munken*) requeridos por los testers en Spine Calculator.

---

## 4. Tratamiento de las 9 Variantes con Conflicto de Espesor (`CONFLICT_PRESERVED`)

Las `9` variantes identificadas en `PAPER-CALIPER-RECOVERY-02` con discrepancia de micras en el origen (p. ej. `var_f30fa00e5c230b37` *Maestro Print 170 64x90 FSC* con `198 µm` vs `204 µm` en dos filas del ODS, o filas donde `MICRONS` y `THICKNESS * 1000` difieren más de `2 µm`) se mantienen bloqueadas en el Tramo D3 hasta que el responsable técnico de imprenta confirme qué fila o medición con micrómetro ISO 534 prevalece.
