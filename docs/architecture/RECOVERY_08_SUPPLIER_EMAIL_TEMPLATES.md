# PAPER-MATERIALS-RECOVERY-08 — Programa de Solicitud Documental a Proveedores y Fabricantes (`RECOVERY_08_SUPPLIER_EMAIL_TEMPLATES.md`)

**Proyecto:** PrintPrice OS (`PrintPriceOS/ppos-control-plane`)  
**Fase de Misión:** Fase 2 — Programa de documentación de proveedores  
**Referencia Base:** `PAPER-MATERIALS-RECOVERY-07W` (`ba6211c6ff45292fa9f4595710d4b7890be51d26`)  
**Estado Operativo:** **PLANTILLAS PREPARADAS · CERO ENVÍOS AUTOMÁTICOS REALIZADOS**  
**Matriz Asociada:** [`RECOVERY_08_SUPPLIER_REQUEST_MATRIX.csv`](./RECOVERY_08_SUPPLIER_REQUEST_MATRIX.csv) (`252` solicitudes individuales trazables: `REQ08-001` a `REQ08-252`)

---

## 1. Principios de Gobernanza Documental

1. **Prohibición de inferencia por gramaje o analogía comercial**: Ninguna de las `252` variantes pendientes (`102` `DOCUMENTATION_REQUIRED`, `145` `PHYSICAL_MEASUREMENT_REQUIRED`, `5` `CONFLICT_HOLD`) puede recibir espesor (`caliper_um`) mediante reglas empíricas ni factores de volumen (`bulk`) genéricos.
2. **Siete requisitos técnicos obligatorios en cada respuesta de proveedor o molino**:
   - **Espesor nominal en `µm`** (micrómetros) o `mm` con precisión micrométrica.
   - **Método de ensayo normalizado** (`ISO 534:2011` para papel/cartón a `100 kPa` sobre plato de `200 mm²`; `ISO 4593` para films/polipropileno rígido como *Priplak*; `ISO 534` pieza frontal vs laminado total en autoadhesivos *Sticotac / Raflamatt*).
   - **Tolerancia técnica oficial** (`± µm` o `± %` respecto al nominal).
   - **Gramaje (`g/m²` según `ISO 536`) y acabado exacto** (liso, rugoso, verjurado, gofrado lino, bucarán, perlado, estucado 1C/2C).
   - **Referencia comercial / SKU del proveedor** y correspondencia con el código interno del catálogo (`ods_code`).
   - **Versión y fecha de revisión de la Ficha Técnica Oficial (TDS)** en PDF original del fabricante.
   - **Confirmación explícita de invarianza o variación por color y gofrado**: confirmar por escrito si el espesor nominal varía entre tintadas (ej. colores intensos/oscuros como *Sirio Ultra Black*, *Keaykolour Guardsman Red*, *Colorit*, *Kaskad*) o entre gofrados (*Fine Linen*, *New Linen*, *Crash*, *Buckram*, *Constellation Tela*).
3. **Separación entre referencia importada y certificación industrial**:
   - Los espesores recibidos mediante ficha técnica oficial se registran inicialmente con `caliper_source = 'MANUFACTURER_DATASHEET'` y `caliper_confidence_status = 'REFERENCE_IMPORTED'`.
   - Para materiales de recubrimiento gofrados, papeles verjurados/texturados, autoadhesivos y multicapa (`145` variantes en `PHYSICAL_MEASUREMENT_REQUIRED`), la ficha técnica del fabricante actúa únicamente como **referencia nominal orientativa**, siendo **obligatoria la medición física por lote con micrómetro (`ISO 534`)** según [`RECOVERY_08_PHYSICAL_MEASUREMENT_PROTOCOL.md`](./RECOVERY_08_PHYSICAL_MEASUREMENT_PROTOCOL.md).

---

## 2. Distribución de Solicitudes por Canal de Proveedor y Fabricante

| Código de Plantilla | Destinatario Principal (Proveedor / Molino) | Total Variantes | `DOCUMENTATION_REQUIRED` | `PHYSICAL_MEASUREMENT_REQUIRED` | `CONFLICT_HOLD` | Familias Principales Cubiertas |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **`TPL-01-ANTALIS-TDS`** | **Antalis** (Baltics / Europe Technical Desk) | **171** | 84 | 82 | 5 | *Keaykolour*, *Pop'Set*, *Rives*, *Conqueror Laid*, *Olin Design Smooth*, *Image Digicolor*, *Print Speed*, *Rainbow*, *Serixo*, *Nautilus SuperWhite*, *Maestro Print*, *IQ Print*, *Munken Polar / Pure Rough*, *Arctic Volume Maxima*, *Sirio Color / Pearl / Ultra Black*, *Arena*, *Materica*, *Splendorgel*, *Woodstock*, *Constellation*, *Burano*, *Colorit*, *Kaskad*, *Priplak*, *Nevia Plus C1S*, *Efalin* (canal Antalis), *Wibalin*, *Sticotac*, *Reacto NCR* |
| **`TPL-02-PAPYRUS-TDS`** | **Papyrus** (OptiGroup / Inapa / Clairefontaine Desk) | **13** | 12 | 1 | 0 | *MultiDesign Original*, *Balance Pure*, *Balance Silk*, *Galerie Art Silk*, *Ensocoat*, *Omela Matt*, *Serimatt* |
| **`TPL-03-POLAP-COVERING-TDS`** | **Polap** (Especialidades de Encuadernación / Guarro Casas / Zanders) | **53** | 0 | 53 | 0 | *Geltex* (`44` variantes Guarro Casas / Fedrigoni Group) y *Efalin* (`9` variantes canal Polap) |
| **`TPL-04-IGEPA-ZANDERS-TDS`** | **Igepa Group / Reflex-Zanders / Winter & Co / Peyer** | **62** *(co-solicitadas con TPL-01/03)* | 0 | 62 | 0 | *Efalin* (`41` variantes Zanders / Reflex), *Wibalin* (`15` variantes Winter & Company), *Surbalin* (`5` variantes Peyer Graphic), *Gmund Colors Metallic* (`1`) |
| **`TPL-05-BALTIC-PARTNERS-TDS`** | **Dardedze hologrāfija / Oldi / Cits** | **15** | 6 | 9 | 0 | *Fredrigoni ArcoPrint Extra White*, *Garda Recycled Print*, *ProVantage Kraftliner*, *Brun Board / Brūns kraftpapīrs*, *Antislip pap.100*, *Surbalin* (lotes locales), *ENVEL.POSTAC C4* |
| **`TPL-06-MILL-ARBITRATION`** | **Arctic Paper Munkedal & Mondi Uncoated Fine Paper** | **5** *(incluidas en TPL-01)* | 0 | 0 | **5** | Arbitraje de discrepancia entre celda ODS y TDS oficial: *Munken Polar 90g*, *Munken Pure Rough 150g*, *IQ Print 70g*, *Maestro Print 90g (x2)* |

---

## 3. Plantillas de Solicitud Lista para Envío Manual (Sin Envío Automático)

### 3.1. `TPL-01-ANTALIS-TDS` — Solicitud Técnica a Antalis (171 variantes: Papeles Creativos, Offset, Estucados, Sintéticos y Recubrimiento)

**Asunto (EN):** `[PrintPrice OS Technical Accreditation] Official ISO 534 Caliper (€/µm) & TDS Revision Request — 171 Catalog SKUs (Ref: REC08-ANTALIS)`  
**Asunto (ES):** `[Acreditación Técnica PrintPrice OS] Solicitud de Fichas Técnicas Oficiales (TDS) y Espesor ISO 534 (µm) — 171 referencias de catálogo (Ref: REC08-ANTALIS)`

```text
Estimado Departamento Técnico y de Calidad de Producto de Antalis / Dear Antalis Product & Technical Support Team,

Dentro de nuestro programa de aseguramiento metrológico para el cálculo industrial de lomo y encuadernación (PrintPrice OS Control Plane — Programa PAPER-MATERIALS-RECOVERY-08), estamos auditando las especificaciones físicas de los materiales suministrados por Antalis que actualmente carecen de ficha técnica firmada por el molino en nuestro repositorio documental.

Adjuntamos el extracto correspondiente de nuestra matriz técnica (RECOVERY_08_SUPPLIER_REQUEST_MATRIX.csv, solicitudes filtradas por canal Antalis) y solicitamos la documentación oficial del fabricante (Technical Data Sheet — TDS vigente en formato PDF) junto con la confirmación expresa de los siguientes 7 parámetros para cada referencia y gramaje:

1. Espesor nominal en micrómetros (µm) [Caliper / Thickness] y factor de mano (bulk cm³/g).
2. Norma de ensayo aplicada (confirmar si corresponde a ISO 534:2011 a 100 kPa sobre plato de 200 mm², o ISO 4593 en el caso de polipropileno Priplak).
3. Tolerancia técnica de fabricación aplicable al espesor (± µm o ± %).
4. Gramaje nominal (g/m² según ISO 536) y acabado exacto de superficie.
5. Código comercial / SKU vigente de Antalis vinculado a cada código de nuestro inventario (ods_code).
6. Versión / código de documento y fecha de revisión de la Ficha Técnica Oficial del molino.
7. Confirmación de invarianza o variación por color y gofrado:
   - En gamas coloreadas en masa (Arjowiggins Keaykolour 120g/300g, Pop'Set 80g-400g, Fedrigoni Sirio Color / Ultra Black, Mondi Rainbow, Colorit, Kaskad): confirmar si todos los colores del mismo gramaje comparten exactamente el mismo espesor nominal o si existen fichas diferenciadas por pigmentación.
   - En papeles con textura/verjurado (Conqueror Laid, Rives Design/Linear/Shetland/Basane, Fedrigoni Arena Rough/Smooth, Materica, Constellation Snow/Tela): indicar el espesor nominal de cresta medido según ISO 534 para cada acabado.
   - En materiales autoadhesivos (Sticotac / Raflamatt): desglosar explícitamente el espesor del frontal (face stock µm) frente al espesor total del complejo con soporte (total laminate µm con backing glassine/kraft).
   - En papel autocopiativo (Koehler Reacto NCR CB / CFB / CF): desglosar el espesor nominal específico de cada hoja (CB, CFB, CF) por gramaje.
   - En referencias retenidas por validación cruzada (Nevia Plus C1S 80g [71 µm], Priplak Cristal 0.5 mm [500 µm / 640g], Arctic Volume Maxima / Maxima Natural, Munken Polar 90g, Munken Pure Rough 150g, Mondi IQ Print 70g y Maestro Print 90g): confirmar qué serie exacta fue suministrada bajo los códigos adjuntos.

Agradecemos el envío de los PDFs oficiales de fabricante y la tabla adjunta completada.

Atentamente / Best regards,
Oficina Técnica de Materiales y Metrología — PrintPrice OS
```

---

### 3.2. `TPL-02-PAPYRUS-TDS` — Solicitud Técnica a Papyrus / OptiGroup (13 variantes: MultiDesign, Balance, Galerie Art, Ensocoat, Omela/Serimatt)

**Asunto (EN):** `[PrintPrice OS Technical Accreditation] Official Mill TDS & ISO 534 Thickness (µm) Request — 13 Catalog SKUs (Ref: REC08-PAPYRUS)`

```text
Dear Papyrus Technical & Quality Assurance Team,

As part of our industrial spine and bookbinding metrology qualification program (PrintPrice OS — PAPER-MATERIALS-RECOVERY-08), we require official mill Technical Data Sheets (PDF) and explicit thickness verification for 13 paper and board references supplied via Papyrus (extract attached from RECOVERY_08_SUPPLIER_REQUEST_MATRIX.csv):

- MultiDesign Original (Clairefontaine / Papyrus) — confirm exact sub-series (White / Natural / Rough) and nominal caliper (µm) per GSM.
- Balance Pure & Balance Silk (Inapa / Papyrus recycled coated/uncoated series) — provide archived official TDS with nominal caliper (µm) and tolerance.
- Sappi Galerie Art Silk (350 gsm), Stora Enso Ensocoat (275 gsm), Omela Matt & Serimatt — provide current mill TDS confirming nominal caliper (µm) under ISO 534.

For each SKU, please confirm:
1. Nominal thickness in µm and bulk (cm³/g).
2. Test method (ISO 534:2011).
3. Manufacturing tolerance (± µm or ± %).
4. Exact grammage (g/m²) and finish designation.
5. Current Papyrus article number / SKU matching our internal reference code.
6. Official mill datasheet revision date and document ID.
7. Confirmation of any thickness difference across shades or surface finishes.

Kind regards,
Materials & Metrology Engineering — PrintPrice OS
```

---

### 3.3. `TPL-03-POLAP-COVERING-TDS` — Solicitud Técnica a Polap y Guarro Casas / Fedrigoni (`53` variantes: *Geltex* y *Efalin*)

**Asunto (ES/EN):** `[PrintPrice OS Metrología de Encuadernación] Solicitud de Ficha Técnica Nominal y Tolerancias de Gofrado — Gama Geltex (44 ref.) y Efalin (9 ref.) (Ref: REC08-POLAP)`

```text
Estimado Equipo Técnico de Polap / Guarro Casas (Fedrigoni Special Papers),

Dentro del programa de acreditación técnica de materiales de recubrimiento editorial de PrintPrice OS (PAPER-MATERIALS-RECOVERY-08), estamos protocolizando la caracterización de espesores de nuestras 44 variantes en catálogo de Guarro Casas GELTEX (115 g/m², formatos 70x100 cm y 102x70 cm, referencias LS y colores de línea) y las 9 variantes de EFALIN suministradas a través de Polap.

Dado que los materiales de recubrimiento para tapa dura (case-binding covering materials) presentan tratamientos acrílicos superficiales y gofrados que alteran la lectura micrométrica de lote, nuestro sistema aplica una doble trazabilidad:
  a) Valor nominal de ficha técnica del fabricante (REFERENCE_IMPORTED), y
  b) Medición física por lote en planta mediante micrómetro de peso muerto ISO 534 (MEASURED_MICROMETER).

Solicitamos para todas las referencias detalladas en el anexo (RECOVERY_08_SUPPLIER_REQUEST_MATRIX.csv — canal Polap):
1. Ficha Técnica Oficial vigente de Guarro Casas para GELTEX 115 g/m² (y de Zanders/Reflex para EFALIN 120 g/m²), con fecha y número de revisión.
2. Espesor nominal en micrómetros (µm) medido según ISO 534:2011.
3. Tolerancia técnica admitida por el molino (± µm o ± %).
4. Gramaje nominal (g/m²) y especificación exacta del acabado/gofrado.
5. Correspondencia entre nuestra referencia interna (ods_code: ej. 111LS, 113LS, 117LS, 120LS, etc.) y el SKU actual del fabricante/distribuidor.
6. Confirmación expresa de si existen diferencias de espesor nominal entre colores claros, colores intensos/oscuros o acabados gofrados dentro de la gama Geltex 115 g/m².

Atentamente,
Oficina Técnica de Materiales y Metrología — PrintPrice OS
```

---

### 3.4. `TPL-04-IGEPA-ZANDERS-WINTER-PEYER-TDS` — Solicitud a Fabricantes de Materiales de Recubrimiento (*Efalin*, *Wibalin*, *Surbalin*)

**Asunto (DE/EN):** `[PrintPrice OS Metrology] Request for Official Mill TDS & Embossing Caliper Delta — Efalin (41 SKUs), Wibalin (15 SKUs), Surbalin (5 SKUs)`

```text
Dear Technical Support Teams at Reflex Paper (formerly Zanders), Winter & Company, and Peyer Graphic (and distribution partner Igepa),

We are executing a formal metrology qualification program (PAPER-MATERIALS-RECOVERY-08) for hardcover bookbinding covering materials in PrintPrice OS. Because embossed covering papers exhibit distinct caliper profiles across embossing patterns, we never infer thickness across finishes.

Please provide the official Technical Data Sheets (PDF) and complete the attached specification schedule for:
- EFALIN 120 gsm (41 variants across Fine Linen 108, New Linen 105, Crash 106, Smooth 120).
- WIBALIN 120 gsm (15 variants across Buckram 560, Natural 500, Fine Linen 525, Stria 575).
- SURBALIN 115 gsm (5 variants across Glatt / Smooth, Gerippt / Laid, Linea, Moiré).

For each product line and embossing pattern, please specify:
1. Nominal thickness in µm before and after embossing.
2. Measurement standard applied (ISO 534:2011 dead-weight micrometer at 100 kPa).
3. Official manufacturing tolerance (± µm or ± %).
4. Nominal grammage (g/m²) and exact embossing code.
5. Commercial SKU / article code mapping.
6. Datasheet revision number and publication date.
7. Explicit confirmation of thickness deltas between smooth vs. embossed finishes (e.g., Smooth vs. Fine Linen vs. Buckram/Crash) and across dye lots/colors.

Note: In accordance with our internal quality protocol (RECOVERY_08_PHYSICAL_MEASUREMENT_PROTOCOL.md), your official TDS values will be recorded as nominal reference guidelines, while production release for case-making and spine board clearance will additionally require physical ISO 534 micrometer verification on incoming lots.

Sincerely,
Materials & Metrology Engineering — PrintPrice OS
```

---

### 3.5. `TPL-05-BALTIC-PARTNERS-TDS` — Solicitud a Dardedze hologrāfija, Oldi y Proveedores Especiales (`15` variantes)

**Asunto (EN/LV):** `[PrintPrice OS Technical Audit] Mill Identification & Official ISO 534 Datasheet Request — 15 Specialty & Packaging SKUs (Ref: REC08-BALTIC)`

```text
Dear Technical Team at Dardedze hologrāfija / Oldi,

Within our catalog technical accreditation program (PAPER-MATERIALS-RECOVERY-08), we are resolving 15 paper, board, and specialty references sourced through local partner channels where either the exact paper mill brand or the official ISO 534 thickness datasheet is pending confirmation.

Please review the attached schedule (RECOVERY_08_SUPPLIER_REQUEST_MATRIX.csv) covering:
- Fredrigoni ArcoPrint Extra White 100 gsm (640x900 mm)
- Garda Recycled Print 115 gsm (640x900 mm)
- Mondi ProVantage Kraftliner & generic Kraftliner / Brūns kraftpapīrs / Brun Board
- Antislip paper 100 gsm (720x1020 mm)
- Local Surbalin & specialty envelope references (ENVEL.POSTAC C4)

For each item, please provide:
1. Exact producing mill and product brand name.
2. Nominal thickness in µm.
3. Measurement standard (ISO 534).
4. Manufacturing tolerance (± µm or ± %).
5. Grammage (g/m²) and surface finish.
6. Supplier SKU and mill datasheet PDF (with version and date).
7. Confirmation of batch-to-batch thickness stability.

Kind regards,
Materials & Metrology Engineering — PrintPrice OS
```

---

### 3.6. `TPL-06-MILL-ARBITRATION` — Solicitud de Arbitraje Técnico por Conflicto Documental (`5` variantes `CONFLICT_HOLD`)

**Asunto (EN):** `[PrintPrice OS Metrology Arbitration] Sub-Series & Caliper Verification for 5 Held Variants — Arctic Paper Munkedal & Mondi (Ref: REC08-CONFLICT-05)`

```text
Dear Arctic Paper Munkedal & Mondi Technical Specifications Teams (via Antalis),

During our cross-validation audit (PAPER-MATERIALS-RECOVERY-07V), 5 catalog variants were placed in CONFLICT_HOLD because the legacy warehouse spreadsheet (ODS) thickness cells differed from the standard mill Technical Data Sheet values by more than our 5% tolerance threshold:

1. var_d47593d50cd74cb8 — Munken Polar 90 gsm (600x900 mm, ODS Row 1179, code: Munken Polar 90):
   - Legacy ODS cell recorded: 132 µm (1.47 bulk).
   - Official Arctic Paper Munken Design TDS for Munken Polar 90 gsm (1.13 bulk) specifies: 102 µm.
   - Required confirmation: Was this SKU supplied as standard Munken Polar (102 µm) or a high-bulk Munken Polar Rough / custom bulk run?

2. var_9d2f242c646a498f — Munken Pure Rough 150 gsm (700x1000 mm, ODS Row 1254, code: Munken Pure Rough 150):
   - Legacy ODS cell recorded: 280 µm (1.87 bulk).
   - Official Arctic Paper Munken Design TDS for Munken Pure Rough 150 gsm (1.40 bulk) specifies: 210 µm.
   - Required confirmation: Please confirm whether 280 µm was a clerical entry in the legacy sheet (confusing 200 gsm = 280 µm with 150 gsm = 210 µm) and provide the signed confirmation for this SKU.

3. var_2826c14910e54f25 — Mondi IQ Print 70 gsm (640x900 mm, ODS Row 1168):
   - Legacy ODS cell recorded: 100 µm.
   - Official Mondi IQ Print 70 gsm TDS specifies: 92 µm.
   - Required confirmation: Confirm official nominal caliper and tolerance for IQ Print 70 gsm.

4. var_08e2948be1794e2c & var_b83dfcbef6be42f8 — Mondi Maestro Print 90 gsm (640x900 mm & 700x1000 mm, ODS Rows 1177 & 1178):
   - Legacy ODS cells recorded: 106 µm.
   - Official Mondi Maestro Print 90 gsm TDS specifies: 118 µm.
   - Required confirmation: Confirm whether these SKUs correspond to standard Maestro Print 90 gsm (118 µm) or a different calendered offset grade.

Until written confirmation and the matching mill TDS PDF are registered in our Evidence Workflow, these 5 variants remain strictly held with caliper_um = NULL.

Sincerely,
Materials & Metrology Engineering — PrintPrice OS
```

---

## 4. Procedimiento de Recepción y Validación de Respuestas

1. **Prohibición de carga directa sin revisión**: Ninguna respuesta de proveedor se vuelca directamente a `paper_variants`.
2. **Registro en flujo de evidencias (Fase 4)**:
   - Al recibir el PDF de la ficha técnica y la tabla completada, el tecnólogo registra el documento en el flujo diseñado en [`RECOVERY_08_EVIDENCE_WORKFLOW_DESIGN.md`](./RECOVERY_08_EVIDENCE_WORKFLOW_DESIGN.md), calculando el hash `SHA-256` del PDF y verificando los 7 campos obligatorios.
3. **Criterio de promoción**:
   - Si el material pertenece a `DATASHEET_REQUEST_TRACK` (`102` variantes) o `CONFLICT_RECONCILIATION_TRACK` (`5` variantes) y la ficha oficial está completa y sin contradicciones, pasa a estado `APPROVED_REFERENCE` (`caliper_source = 'MANUFACTURER_DATASHEET'`, `caliper_confidence_status = 'REFERENCE_IMPORTED'`).
   - Si el material pertenece a `PHYSICAL_MICROMETER_TRACK` (`145` variantes), el valor de la ficha se almacena únicamente como `nominal_datasheet_caliper_um` de referencia, y la variante exige completar el protocolo de medición física ([`RECOVERY_08_PHYSICAL_MEASUREMENT_PROTOCOL.md`](./RECOVERY_08_PHYSICAL_MEASUREMENT_PROTOCOL.md)) antes de habilitar su espesor operativo.

