# PAPER-MATERIALS-RECOVERY-08 — Dictamen e Informe Ejecutivo del Programa de Acreditación Técnica (`RECOVERY_08_FINAL_ASSESSMENT.md`)

**Proyecto:** PrintPrice OS (`PrintPriceOS/ppos-control-plane`)  
**Misión:** `PAPER-MATERIALS-RECOVERY-08` — Programa de acreditación técnica de materiales pendientes  
**Referencia Base:** `PAPER-MATERIALS-RECOVERY-07W` — commit `ba6211c6ff45292fa9f4595710d4b7890be51d26`  
**Modo de Base de Datos Productiva (`MySQL Control`):** **100 % SOLO LECTURA (`0` escrituras productivas)**  
**Veredicto Final:** **`RECOVERY_08_READY_FOR_IMPLEMENTATION`**

---

## 1. Resumen Ejecutivo y Cumplimiento de Restricciones

Se ha completado el programa técnico y operativo para acreditar de forma trazable y sin inferencias artificiales las **`252` variantes de papel y recubrimiento que permanecen sin espesor (`caliper_um IS NULL`)** tras `PAPER-MATERIALS-RECOVERY-07W`, así como el inventario independiente de las variantes con clasificación técnica pendiente (`OTHER / UNKNOWN`).

### 1.1. Verificación en Vivo en `MySQL Control` (Modo Solo Lectura — Fase 1)

| Indicador de Catálogo en `MySQL Control` | Valor Verificado | Porcentaje / Estado |
| :--- | :---: | :--- |
| **Total de variantes (`paper_variants`)** | **`1.524`** | `100,00 %` |
| **Variantes con espesor acreditado (`caliper_um IS NOT NULL`)** | **`1.272`** | `83,46 %` |
| **Variantes sin espesor (`caliper_um IS NULL`)** | **`252`** | `16,54 %` |
| **Conflictos históricos protegidos (`LIVONIA_REFERENCE_IMPORT`)** | **`9`** | `100 % intactos` (`checksum = 2093607442`) |
| **Variantes con `caliper_confidence_status = 'VERIFIED'`** | **`0`** | Separación estricta mantenida |
| **Variantes con dirección de fibra distinta de `UNKNOWN`** | **`2`** | Sin inferencias por formato |
| **Escrituras ejecutadas en `MySQL Control` durante `RECOVERY-08`** | **`0`** | Solo lectura verificado |
| **Correos o solicitudes externas enviadas automáticamente** | **`0`** | Plantillas listas para revisión humana |
| **Desbloqueos de fabricación (`canReleaseToManufacturing`)** | **`0` (`false`)** | Bloqueo industrial mantenido |
| **Estado de `SECURITY_ROTATION_PENDING`** | **`OPEN`** | Abierto hasta rotación de credenciales |

---

## 2. Fase 1 — Inventario Definitivo de las 252 Variantes sin Espesor

El inventario completo se ha publicado en [`RECOVERY_08_MISSING_MATERIALS_INVENTORY.csv`](./RECOVERY_08_MISSING_MATERIALS_INVENTORY.csv) (`252` filas exactas). Proviene de las `250` variantes documentadas en `RECOVERY-07V` más las `2` variantes retenidas en la Fase 1 de `RECOVERY-07W` (*Nevia Plus C1S 80g 71my* [`var_dbd5357075534e3b`] y *Priplak Cristal + 0.5 mm* [`var_737c9a59216f4bf2`]) por tener `"0"` en sus celdas de espesor de la hoja ODS.

### 2.1. Distinción por Vía de Acreditación Técnica (`Accreditation Track`)

| Vía de Acreditación (`accreditation_track`) | Estado (`accreditation_status`) | Variantes | % sobre 252 | Requisito Obligatorio para Acreditación |
| :--- | :--- | :---: | :---: | :--- |
| **`PHYSICAL_MICROMETER_TRACK`** | `PHYSICAL_MEASUREMENT_REQUIRED` | **`145`** | `57,54 %` | **Medición física por lote con micrómetro `ISO 534:2011`** (`10` lecturas en hoja individual tras acondicionamiento `ISO 187`) + firma de operador y tecnólogo. La ficha del fabricante sirve sólo como referencia nominal. |
| **`DATASHEET_REQUEST_TRACK`** | `DOCUMENTATION_REQUIRED` | **`102`** | `40,48 %` | **Ficha Técnica Oficial (TDS PDF)** emitida por el fabricante/proveedor acreditando espesor nominal en `µm`, norma `ISO 534`, tolerancia y confirmación de invarianza entre colores. |
| **`CONFLICT_RECONCILIATION_TRACK`** | `CONFLICT_HOLD` | **`5`** | `1,98 %` | **Arbitraje escrito de fabricante/proveedor** (Arctic Paper Munkedal y Mondi) o medición micrométrica de lote para dirimir la discrepancia (`> 5 %`) entre celda ODS y TDS estándar. |
| **TOTAL PENDIENTE DE ESPESOR** | — | **`252`** | **`100,00 %`** | **Cero estimaciones por gramaje permitidas** |

### 2.2. Distribución por Prioridad y Aplicación Industrial

| Nivel de Aplicación Industrial (`industrial_priority_tier`) | Variantes | `DOCUMENTATION_REQUIRED` | `PHYSICAL_MEASUREMENT_REQUIRED` | `CONFLICT_HOLD` | Impacto en Motores de PrintPrice OS |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **`P1_INTERIOR_BOOK_PAPER`** (Papel interior de bloque de libro) | **`29`** | 24 | 0 | 5 | Impacto directo en el cálculo del bloque (`paperThicknessMm`) en Spine Calculator. |
| **`P2_COVER_BOARD_AND_CARD`** (Cubiertas flexibles, cartulinas y envase) | **`54`** | 53 | 1 | 0 | Impacto en espesor de cubierta rústica, solapas y hendidos de portada. |
| **`P3_SPECIALTY_AND_COVERING`** (Recubrimientos de tapa dura, verjurados, autoadhesivos, NCR) | **`169`** | 25 | 144 | 0 | Impacto en forro de tapa dura (*case-binding covering*), papelería corporativa y etiquetas. |
| **TOTAL** | **`252`** | **`102`** | **`145`** | **`5`** | — |

---

## 3. Fase 2 — Programa de Documentación de Proveedores y Fabricantes

Se han generado:
- [`RECOVERY_08_SUPPLIER_REQUEST_MATRIX.csv`](./RECOVERY_08_SUPPLIER_REQUEST_MATRIX.csv): `252` filas (`REQ08-001` a `REQ08-252`) que vinculan cada `variant_id` y código `ods_code` con su canal de proveedor, molino fabricante, gramaje, formato, acabado y los **7 requisitos metrológicos obligatorios**.
- [`RECOVERY_08_SUPPLIER_EMAIL_TEMPLATES.md`](./RECOVERY_08_SUPPLIER_EMAIL_TEMPLATES.md): 6 plantillas técnicas listas para envío manual (sin ningún envío automático realizado) dirigidas a:
  1. **Antalis** (`171` variantes: *Keaykolour*, *Pop'Set*, *Rives*, *Conqueror Laid*, *Olin Design Smooth*, *Sirio Color / Pearl / Ultra Black*, *Arena*, *Materica*, *Burano*, *Colorit*, *Kaskad*, *Rainbow*, *Serixo*, *Print Speed*, *Nautilus SuperWhite*, *Priplak*, *Nevia Plus C1S*, *Efalin*, *Wibalin*, *Sticotac*, *Reacto NCR* y los `5` casos en `CONFLICT_HOLD`).
  2. **Papyrus / OptiGroup** (`13` variantes: *MultiDesign Original*, *Balance Pure*, *Balance Silk*, *Galerie Art Silk*, *Ensocoat*, *Omela Matt*, *Serimatt*).
  3. **Polap / Guarro Casas (Fedrigoni Special Papers)** (`53` variantes: `44` *Geltex* `115 g/m²` y `9` *Efalin* `120 g/m²`).
  4. **Igepa / Reflex-Zanders / Winter & Company / Peyer Graphic** (`62` variantes co-solicitadas de recubrimiento editorial: *Efalin* `41`, *Wibalin* `15`, *Surbalin* `5`, *Gmund* `1`).
  5. **Dardedze hologrāfija / Oldi / Cits** (`15` variantes regionales y de embalaje).
  6. **Arctic Paper Munkedal & Mondi** (`5` variantes en arbitraje `CONFLICT_HOLD`: *Munken Polar 90g*, *Munken Pure Rough 150g*, *IQ Print 70g*, *Maestro Print 90g x2*).

---

## 4. Fase 3 — Protocolo de Medición Física con Micrómetro (`ISO 534`)

El documento [`RECOVERY_08_PHYSICAL_MEASUREMENT_PROTOCOL.md`](./RECOVERY_08_PHYSICAL_MEASUREMENT_PROTOCOL.md) establece el procedimiento estándar de laboratorio (`SOP-PPOS-METROLOGY-08`) para las **`145` variantes en `PHYSICAL_MEASUREMENT_REQUIRED`**:
- **Instrumento**: Micrómetro de peso muerto conforme a `ISO 534:2011` (plato circular de `200 mm²` / `Ø 16,0 mm`, presión estática de `100 kPa ± 1 kPa`, resolución `1 µm`, certificado ISO 17025 vigente).
- **Acondicionamiento**: Atmósfera normalizada `ISO 187` (`23,0 °C ± 1,0 °C`, `50,0 % ± 2,0 % HR`) durante `4–8 h`.
- **Muestreo**: `10` lecturas en **hoja individual** (*single-sheet method*) sobre `5` pliegos del lote para impedir el falso adelgazamiento por encaje de gofrado (*embossing nesting*) en *Efalin*, *Geltex*, *Wibalin*, *Surbalin*, *Conqueror Laid* y *Constellation*, y desglose de frontal puro (`facestock_only_um`) frente a laminado total (`total_laminate_um`) en autoadhesivos *Sticotac / Raflamatt*.
- **Separación metrológica**: El valor nominal de la ficha del fabricante (`nominal_datasheet_caliper_um`, `MANUFACTURER_DATASHEET`) y el valor físico medido sobre el lote (`measured_batch_caliper_um`, `MEASURED_MICROMETER`) se conservan en columnas diferenciadas.

---

## 5. Fase 4 — Diseño de Integración de Evidencias en Paper Materials

El documento [`RECOVERY_08_EVIDENCE_WORKFLOW_DESIGN.md`](./RECOVERY_08_EVIDENCE_WORKFLOW_DESIGN.md) define la arquitectura de integración en Paper Materials:
- **Cero ruptura de enums existentes**: Reutiliza los valores ya soportados por [`paperCaliperReconciliationService.js`](../../src/api/services/spine/paperCaliperReconciliationService.js) (`MANUFACTURER_DATASHEET` + `REFERENCE_IMPORTED` para fichas importadas; `MEASURED_MICROMETER` + `VERIFIED` para lotes medidos físicamente y aprobados por tecnólogo).
- **Tres tablas aditivas nuevas** (`paper_variant_caliper_evidence`, `paper_variant_caliper_audit_log`, `paper_variant_classification_evidence`) que registran SHA-256 del documento, fuente y revisión, valor nominal vs valor medido, estadísticas `ISO 534` ($\bar{x}$, $s$, $\text{CV}\%$), estado de revisión (`PENDING_TECH_REVIEW`, `APPROVED_REFERENCE`, `CERTIFIED_MEASURED`, `REJECTED`), segregación de funciones (`submitted_by !== approved_by_technologist`) e historial inmutable con `caliper_revision`.
- **Bloqueo industrial intacto**: `canReleaseToManufacturing` permanece `false` mientras el perfil industrial no sea `PRODUCTION_CERTIFIED`.

---

## 6. Fase 5 — Inventario Independiente de Clasificaciones Técnicas Pendientes (`OTHER / UNKNOWN`)

De forma **estrictamente separada de la certificación de espesores**, se ha auditado el estado de la clasificación técnica (`paper_products.category` y resolución en [`paperMaterialsNormalizationService.js`](../../src/api/services/paperMaterialsNormalizationService.js)):

- En `MySQL Control`, existen **`338` variantes** cuyo producto padre tiene `paper_products.category = 'OTHER'` (`186` ya disponen de espesor acreditado y `152` carecen de espesor).
- Al pasar por el servicio de normalización BFF (`resolveVariantTechnicalAttributes`), **`1` variante** (`var_85c142a50239e312` — *Efalin FINE LINEN 130 (Light Blue) 120 102x70cm*) ya resuelve dinámicamente como `DESIGN / UNCOATED / UNCOATED` gracias al diccionario ODS, quedando exactamente **`337` variantes** con resolución efectiva **`OTHER / UNKNOWN / UNKNOWN`** (el `22,11 %` del catálogo de `1.524` variantes, frente a `1.187` variantes [`77,89 %`] ya clasificadas).

### 6.1. Desglose de las 337 Variantes en `OTHER / UNKNOWN` (338 en `paper_products.category = 'OTHER'`)

| Grupo Funcional de Clasificación Pendiente | Total Variantes (`category = 'OTHER'`) | Ya con Espesor (`caliper_um != NULL`) | Sin Espesor (`caliper_um IS NULL`) | Familias Principales y Criterio de Clasificación Futura (Separado del Espesor) |
| :--- | :---: | :---: | :---: | :--- |
| **`G1` — Materiales de Recubrimiento Editorial** | **`63`** *(62 en `OTHER/UNKNOWN` + 1 resuelta)* | 0 | 63 | *Efalin* (`27`), *Geltex* (`18`), *Wibalin* (`13`), *Surbalin* (`5`). Requieren confirmación documental de categoría (`DESIGN` / recubrimiento celulósico no estucado). |
| **`G2` — Papeles Creativos, Verjurados y Coloreados en Masa** | **`113`** | 79 | 34 | *Olin* (`54`), *Keaykolour* (`11`), *Sirio Color/Pearl* (`11`), *Curious* (`14`), *Conqueror* (`7`), *Burano* (`6`), *Colorit* (`6`), *Pop'Set* (`5`), *Rainbow* (`4`), *Rives* (`4`), *Arena* (`3`), *Constellation* (`2`), *Fedrigoni* (`3`), *Materica* (`1`), *Gmund* (`1`), *Tintoretto* (`1`). La mayoría (`79`) **ya tienen espesor acreditado**; sólo precisan acreditar su familia técnica (`DESIGN` / `UNCOATED` o `SPECIALTY`). |
| **`G3` — Papeles Offset / Libro con `category = 'OTHER'` en BD** | **`74`** | 65 | 9 | *IQ* (`18`), *Serixo* (`13`), *Luxline / LuxCream / Lux* (`12`), *Munken* (`7`), *Maestro* (`5`), *MasterBook* (`4`), *Pergraphica* (`4`), *Maxima* (`4`), *MultiOffset* (`2`), *Amber Graphic* (`1`), *Nautilus* (`1`), *Printspeed* (`1`), *Soporset* (`1`), *Volume* (`1`). `65` ya tienen espesor; precisan homologar su producto padre a `OFFSET / UNCOATED`. |
| **`G4` — Cartulinas Gráficas y Kraftliner en `OTHER`** | **`27`** | 26 | 1 | *Ensocoat* (`9`), *KraftPak / Kraftliner* (`4`), *MetsaBoard* (`3`), *CrownBoard* (`2`), *Diva Art* (`2`), *Invercote* (`2`), *Multicolor* (`2`), *Umka* (`2`), *Artboard* (`1`). `26` ya tienen espesor; precisan homologación documental a `CARTON`. |
| **`G5` — Papeles Estucados de Publicación en `OTHER`** | **`12`** | 9 | 3 | *Arctic Volume* (`4`), *Garda / GardaMatt* (`4`), *Galerie Art* (`3`), *Nevia* (`1`). `9` ya tienen espesor; precisan homologación documental a `COATED`. |
| **`G6` — Especialidades, Sintéticos, Autoadhesivos y NCR** | **`49`** | 7 | 42 | *Reacto Carbonless NCR* (`11`), *Sticotac / Raflamatt* (`4`), *Syn-Coat* (`4`), *Priplak* (`3`), *G.F.* (`1`), *Metalprint* (`1`), *Antislip* (`1`), *Chantaffiche* (`1`), *Envelopes* (`1`), y lotes especiales (`22`). Deben permanecer legítimamente en `OTHER` (o subcategoría de especialidad) hasta contar con ficha técnica específica. |
| **TOTAL (`paper_products.category = 'OTHER'`)** | **`338`** (`337` `OTHER/UNKNOWN`) | **`186`** | **`152`** | **Independencia total entre clasificación técnica y espesor (`caliper_um`)** |

---

## 7. Entregables Versionados y Verificación Automatizada

1. [`docs/architecture/RECOVERY_08_MISSING_MATERIALS_INVENTORY.csv`](./RECOVERY_08_MISSING_MATERIALS_INVENTORY.csv) — Inventario definitivo de las `252` variantes sin espesor.
2. [`docs/architecture/RECOVERY_08_SUPPLIER_REQUEST_MATRIX.csv`](./RECOVERY_08_SUPPLIER_REQUEST_MATRIX.csv) — Matriz estructurada de `252` solicitudes técnicas a proveedores y fabricantes.
3. [`docs/architecture/RECOVERY_08_SUPPLIER_EMAIL_TEMPLATES.md`](./RECOVERY_08_SUPPLIER_EMAIL_TEMPLATES.md) — Plantillas de solicitud documental (EN/ES/DE/LV) sin envío automático.
4. [`docs/architecture/RECOVERY_08_PHYSICAL_MEASUREMENT_PROTOCOL.md`](./RECOVERY_08_PHYSICAL_MEASUREMENT_PROTOCOL.md) — Protocolo operativo `ISO 534` / `ISO 187` para las `145` variantes que requieren medición física con micrómetro.
5. [`docs/architecture/RECOVERY_08_EVIDENCE_WORKFLOW_DESIGN.md`](./RECOVERY_08_EVIDENCE_WORKFLOW_DESIGN.md) — Diseño de tablas aditivas, API de revisión con segregación de funciones (SoD) y preservación de `REFERENCE_IMPORTED` frente a certificación industrial.
6. [`docs/architecture/RECOVERY_08_FINAL_ASSESSMENT.md`](./RECOVERY_08_FINAL_ASSESSMENT.md) — Presente dictamen ejecutivo e inventario independiente de las `337` clasificaciones técnicas pendientes (`338` en `paper_products.category = 'OTHER'`).
7. [`scripts/recover_paper_materials_08.cjs`](../../scripts/recover_paper_materials_08.cjs) & [`tests/paper_materials_recovery_08.test.js`](../../tests/paper_materials_recovery_08.test.js) — Validador determinista en modo solo lectura y suite de pruebas Vitest.

**Dictamen Final:** **`RECOVERY_08_READY_FOR_IMPLEMENTATION`**

