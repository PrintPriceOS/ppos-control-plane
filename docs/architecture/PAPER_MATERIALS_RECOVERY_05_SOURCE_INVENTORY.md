# PAPER-MATERIALS-RECOVERY-05 — Inventario de Fuentes Técnicas y Reglas de Evidencia

**Proyecto:** PrintPrice OS  
**Misión:** `PAPER-MATERIALS-RECOVERY-05 — Resolución basada en evidencia de atributos y espesores pendientes`  
**Rama:** `feat/paper-materials-recovery-05` (creada desde `feat/spine-03r-caliper-and-engine` @ `9fb66b0af2c045b82f8505195374838448e4ea48`)  
**Alcance de Fase D:** Análisis y preparación documental y algorítmica. **No autoriza escrituras en producción.**

---

## 1. Jerarquía Epistémica de Fuentes Técnicas

Para resolver los cuatro grupos pendientes (**Grupo A**: `501` `STRONG_MATCH_REVIEW`, **Grupo B**: `62` `ATTRIBUTE_CONFLICT`, **Grupo C**: `16` `AMBIGUOUS_MATCH`, **Grupo D**: `353` variantes sin caliper) sin inventar datos ni deducir micras únicamente a partir de `gsm`, se establece la siguiente jerarquía de fuentes auditables:

| Nivel | Código de Fuente (`evidence_type`) | Descripción de la Fuente | Uso Autorizado | Estado de Confianza (`caliper_confidence_status` / `coating_confidence`) |
| :---: | :--- | :--- | :--- | :--- |
| **1** | `ODS_EXPLICIT_SOURCE` | `Paper data base.ods.zip` (`SHA-256: b3262fe...`, `1.573` filas del proveedor original con `CODE`, `NOSAUKUMS`, `MICRONS`, `THICKNESS`, `FORMAT`, `GRAMS`, `COAT`, `SORTIMENT`, `PAPER TYPE`, `PROVISER`). | Conciliación primaria de clasificación y espesor cuando los campos no presentan contradicción ni vacíos. | `REFERENCE_IMPORTED` / `EXPLICIT_SOURCE` |
| **2** | `LIVONIA_TECHNICAL_LIBRARY` | Biblioteca técnica Livonia (`paper_technical_caliper_reference`, `375` referencias importadas en `MIG-172` desde `Spine calculation.xlsx`). | Contraste de espesor físico ($\mu\text{m}$) y factor de mano (`bulk_factor`) por familia comercial y gramaje exacto. | `REFERENCE_IMPORTED` |
| **3** | `OFFICIAL_MILL_DATASHEET` | Fichas técnicas oficiales de fábrica (*Mill Technical Datasheets*) por marca y gramaje exacto: **Arctic Paper** (*Arctic Volume White/Ice*, *G-Print*, *G-Silk*, *Amber Graphic*, *Munken Polar/Pure/Lynx/Kristall/Print 15/18*), **Sappi Europe** (*Galerie Art Gloss/Silk/Matt*, *Algro Design*), **Mondi** (*IQ Print*, *Maestro Print*, *Colorit*), **Stora Enso / Iggesund** (*Ensocoat*, *Invercote*, *Tambrite*, *Performa*), **Guarro Casas / Zanders / Winter & Co.** (*Efalin*, *Geltex*). | Acreditación de `coatingStatus` / `finish` cuando `COAT` está vacío en el ODS pero `PAPER TYPE` y la marca comercial son inequívocos; y acreditación de espesor nominal de fábrica ($\mu\text{m}$) para el par exacto `(familia, gsm)`. | `MANUFACTURER_DATASHEET_DOCUMENTED` / `MILL_DATASHEET_PLUS_ODS` |
| **4** | `SIBLING_FORMAT_ODS_IMPORT` | Variantes hermanas del mismo producto y gramaje exacto en `Control.paper_variants` que difieren únicamente en formato de pliego (`640×900` vs `700×1000` vs `720×1020`) y que ya poseen `caliper_um` importado del ODS. | Transferencia trazable de espesor nominal dentro del mismo `(familia comercial normalizada, gsm)` cuando todas las variantes hermanas con espesor coinciden en un único valor en $\mu\text{m}$. | `SIBLING_FORMAT_ODS_IMPORT` |
| **5** | `PHYSICAL_MICROMETER_ISO534` | Medición física en planta con micrómetro calibrado según norma **ISO 534** sobre pliego real del lote del proveedor. | Obligatorio para liberar perfiles de producción (`VERIFIED`) y para materiales especiales sin ficha técnica pública de espesor (*Reacto CFB/CB*, *Sticotac*, *Kaskad*, cartulinas especiales). | `VERIFIED` |

> **Prohibición expresa**: Queda terminantemente prohibido deducir `caliper_um` multiplicando `gsm` por un factor genérico arbitrario (p. ej. `gsm × 1.0` o `gsm × 1.2`) sin ficha técnica de la familia específica.

---

## 2. Análisis Detallado de los 4 Grupos Pendientes (`713` Variantes Únicas en Revisión)

En total, existen **`713` variantes únicas** en el catálogo de `1.524` que pertenecen al menos a uno de los cuatro grupos pendientes (`579` pendientes de clasificación técnica en Grupos A/B/C y `353` pendientes de espesor en Grupo D, con intersección de `219` variantes que están simultáneamente en A/B/C y D):

### 2.1 Grupo A — `501` Variantes `STRONG_MATCH_REVIEW`

Se subdividen en tres subcategorías deterministas según la evidencia disponible en el ODS y en las fichas técnicas oficiales de fabricante:

1. **Subgrupo A1 — `102` variantes `PT_SILK_WITH_GLOSS_PRODUCT_NAME` (Acreditables con Ficha Técnica + ODS)**:
   - **Causa en el ODS**: La columna `PAPER TYPE` contiene `"Silk"` (usado en la hoja original como categoría agrupadora de estucados brillantes/semimate), pero el nombre comercial del producto (`Maxi Gloss`, `Galerie Art Gloss`, `MultiArt Gloss`, `OMNI GLOSS`) y/o la columna `COAT` (`Gloss`, `krītots`) especifican inequívocamente **papel estucado brillante (`COATED / COATED / GLOSS`)**.
   - **Resolución propuesta**: Acreditar como `paperType = 'COATED'`, `coatingStatus = 'COATED'`, `finish = 'GLOSS'` respaldado por ficha técnica Sappi / UPM / Papyrus (`ACCREDITED_BY_MILL_DATASHEET_AND_ODS_COAT`).

2. **Subgrupo A2 — `246` variantes `DOCUMENTED_MILL_FAMILY_RULE` con Familia de Fábrica Inequívoca (Acreditables con Ficha Técnica + `PAPER TYPE` del ODS)**:
   - **Causa en el ODS**: La fila del ODS tiene `PAPER TYPE` explícito (`Matt`, `Silk`, `Ofset`, `Dizaina`, `Kartons`, `Kappa`), pero la celda `COAT` se dejó en blanco (`<EMPTY>`) o contiene la referencia de color de serie (p. ej. `Nr. 108 high white`, `Nr. 114 dark blue`, `dizaina`).
   - **Evidencia de fábrica**: Pertenecen a familias estándar de fabricante cuya naturaleza de estucado y acabado es fija por especificación de fábrica:
     - *G-Print*, *Arctic Volume White/Ice*, *Galerie Art Matt*, *Invercote Creato Matt* $\to$ `COATED / COATED / MATT` (`63` + `4` variantes).
     - *G-Silk*, *Maxi Satin*, *Galerie Art Silk*, *MultiArt Silk* $\to$ `COATED / COATED / SILK` (`39` variantes).
     - *Amber Graphic*, *IQ Print*, *Serixo*, *Maestro Print*, *MasterBook Extra* $\to$ `OFFSET / UNCOATED / UNCOATED` (`70` variantes).
     - *Olin Design / Colours*, *Keaykolour*, *Sirio Color*, *Burano*, *Efalin FINE/NEW LINEN / WOVE*, *Rainbow* $\to$ `DESIGN / UNCOATED / UNCOATED` (`53` variantes).
     - *Ensocoat*, *Algro Design*, *Invercote* (`7` variantes `CARTON / COATED / OTHER`) y *Kappa* (`10` variantes `CARTON / UNCOATED / UNCOATED`).

3. **Subgrupo A3 — `153` variantes que requieren Verificación Manual de SKU / Proveedor (`HOLD_PENDING_EXPLICIT_COAT_EVIDENCE`)**:
   - Incluye `84` variantes con `UNSPECIFIED_COAT_KEPT_UNKNOWN` (donde el nombre del producto no permite asegurar si tiene recubrimiento especial) y `69` variantes de diseño/especialidades donde la superficie requiere confirmación del catálogo físico de Polap / Antalis / Papyrus. **Se mantienen en `UNKNOWN` sin auto-actualización.**

---

### 2.2 Grupo B — `62` Variantes `ATTRIBUTE_CONFLICT` (Documentadas, NO Auto-Corregibles)

Se han catalogado todas las contradicciones entre `PAPER TYPE`, `COAT` y nombre comercial en `PAPER_MATERIALS_RECOVERY_05_REVIEW_MATRIX.csv`:

| Patrón de Conflicto en el ODS | Variantes Afectadas | Descripción Técnica de la Contradicción | Acción en `RECOVERY-05` |
| :--- | :---: | :--- | :--- |
| `AMBIGUOUS_COAT_VALUE:Jautāt` | `35` | La columna `COAT` contiene literalmente `"Jautāt"` (*"Preguntar"* en letón) en papeles `Dizaina` (`29`), `Group 1` (`4`), `Kartons` (`1`) y `Ofset` (`1`), principalmente *Reacto* autocopiativo y especialidades. | **Bloquear actualización automática (`HOLD`)**; consultar especificación de proveedor (CFB/CB/CF para *Reacto*). |
| `AMBIGUOUS_COAT_VALUE:dizaina` / `Dizaina` | `16` | La columna `COAT` repite `"dizaina"` en lugar de indicar si es estucado o no estucado en familias sin regla de fábrica cerrada. | **Bloquear actualización automática (`HOLD`)**; verificar por código SKU de proveedor. |
| `PT_MATT_WITH_COAT_SILK_CONFLICT` | `2` | *Arctic Volume Ice 130 72x102 FSC* y otra variante tienen `PAPER TYPE = Matt` pero `COAT = silk`. *Arctic Volume Ice* es genuinamente `MATT` según Arctic Paper, por lo que `COAT = silk` es un error tipográfico de la hoja origen. | **Documentado para sign-off humano** antes de corregir a `COATED / MATT`. |
| `SOURCE_TYPE_MATT_WITH_NEKRITOTS_COAT` | `2` | Filas con `PAPER TYPE = Matt` y `COAT = nekrītots` (no estucado). | **Documentado para sign-off humano**. |
| `COAT_KRITOT_NEKRITOT_ON_DUO` | `1` | `PAPER TYPE = Group 1` con `COAT = kritots/nekritot`. | **Documentado para sign-off humano**. |
| Otros valores no canónicos en `COAT` (`mitrumizturīgs`, `caurspīdīgs`, `Sintētiskais`, `POLAP`, `70`) | `6` | Atributos funcionales (resistente a la humedad, translúcido, sintético, nombre de proveedor o número suelto) colocados en la columna `COAT`. | **Documentado para sign-off humano**. |

---

### 2.3 Grupo C — `16` Variantes `AMBIGUOUS_MATCH` (Resolución de Duplicados del ODS)

Las `16` variantes `AMBIGUOUS_MATCH` corresponden a productos que hacen match exacto por `(nombre normalizado, gsm, ancho, alto)` con **2 filas del archivo ODS**. Al auditar los pares de filas del ODS mediante código original (`CODE`), proveedor (`PROVISER`) y espesor (`MICRONS`):

1. **`14` de las `16` variantes (`RESOLVED_BY_PRIMARY_ODS_CODE_AND_AGREEMENT`)**:
   - Ambas filas del ODS coinciden en la clasificación técnica resultante (`DESIGN / UNCOATED / UNCOATED`, `OFFSET / UNCOATED / UNCOATED` o `COATED / COATED / SILK`) y en el espesor, diferenciándose únicamente en que una fila tiene el código SKU completo del proveedor (p. ej. `320489`, `320575`, `323298`, `348985`, `172489`, `172675`, `172389`, `Maxi Satin`) y la fila duplicada es un apunte secundario sin código o con abreviatura.
2. **`1` variante (`var_f30fa00e5c230b37` · `Maestro Print 170 64x90 FSC` — `RESOLVED_ATTR_ONLY_CALIPER_CONFLICT_PRESERVED`)**:
   - Las dos filas del ODS (`Row #701` con código `Maestro Pri...` y `Row #714` sin código) coinciden al `100 %` en clasificación (`Ofset` / `nekrītots` $\to$ `OFFSET / UNCOATED / UNCOATED`), aunque difieren en micras (`198 µm` vs `204 µm`, conflicto ya preservado en `PAPER-CALIPER-RECOVERY-02`). Su clasificación técnica `OFFSET / UNCOATED / UNCOATED` es inequívoca manteniendo su conflicto de espesor intacto.
3. **`1` variante (`var_24529f375c1b6341` · `Munken Pure Rough 100 90x64` — `HOLD_AMBIGUOUS_CONFLICTING_ODS_ROWS`)**:
   - `Row #1189` indica `PAPER TYPE = Matt, COAT = nekrītots` y `Row #1190` indica `PAPER TYPE = Ofset, COAT = <EMPTY>` (ambas con `140 µm`). Requiere validación explícita para clasificar como `DESIGN / UNCOATED / UNCOATED` (acorde a la gama *Munken Pure Rough* de Arctic Paper Munkedal).
