# PAPER-MATERIALS-RECOVERY-08 — Protocolo Operativo de Medición Física con Micrómetro (`RECOVERY_08_PHYSICAL_MEASUREMENT_PROTOCOL.md`)

**Proyecto:** PrintPrice OS (`PrintPriceOS/ppos-control-plane`)  
**Fase de Misión:** Fase 3 — Protocolo de medición física (`SOP-PPOS-METROLOGY-08`)  
**Normas de Referencia:** `ISO 534:2011` (Determinación del espesor y densidad aparente en papel y cartón), `ISO 187:1990` (Acondicionamiento atmosférico de muestras), `ISO 186:2002` (Muestreo de lotes)  
**Ámbito de Aplicación:** **145 variantes catalogadas en `PHYSICAL_MEASUREMENT_REQUIRED`** (+ verificación opcional sobre las `5` variantes en `CONFLICT_HOLD`)

---

## 1. Justificación Técnica y Alcance Obligatorio

En artes gráficas y encuadernación industrial (cálculo de lomo de bloque, anchura de lomo de tapa dura, bisagra/cajada y lomo de sobrecubierta), los **materiales de recubrimiento gofrados**, **papeles verjurados/texturados**, **complejos autoadhesivos** y **papeles autocopiativos multicapa** no pueden acreditarse mediante una única cifra genérica de catálogo ni por equivalencia de gramaje:

1. **Efecto cresta-valle del gofrado (*Embossing Peak-to-Valley Delta*)**: En recubrimientos como *Efalin*, *Geltex*, *Wibalin*, *Surbalin* o *Constellation Tela*, el cilindro de gofrado modifica el espesor aparente entre `+15 µm` y `+65 µm` respecto al soporte liso del mismo gramaje (`115–120 g/m²`).
2. **Variación entre tintadas y cargas acrílicas**: Los recubrimientos teñidos en masa con pigmentos minerales o negro de humo (*Sirio Ultra Black*, *Geltex* tonos oscuros, *Efalin* colores intensos) presentan diferente compresibilidad bajo el pie del micrómetro.
3. **Complejos multicapa**: En autoadhesivos (*Sticotac / Raflamatt*) debe medirse por separado el frontal despegado (*face stock*) y el laminado total con soporte (*total laminate with liner*), mientras que en autocopiativos (*Koehler Reacto NCR*) las hojas `CB`, `CFB` y `CF` poseen recubrimientos de microcápsulas con espesores distintos.

### 1.1. Desglose de las 145 Variantes Sujetas a Medición Física Obligatoria

| Familia / Gama de Material | Fabricante / Molino | Variantes en `PHYSICAL_MEASUREMENT_REQUIRED` | Gramajes (`g/m²`) | Naturaleza Física / Motivo de Medición Micrómetro `ISO 534` |
| :--- | :--- | :---: | :---: | :--- |
| **Geltex** (`111LS–230LS` y colores) | Guarro Casas (Fedrigoni Group) | **44** | 115 | Recubrimiento celulósico con tratamiento acrílico antiporoso; variación por lote y gofrado. |
| **Efalin** (*Fine Linen 108*, *New Linen 105*, *Crash 106*, *Smooth 120*) | Zanders / Reflex Paper | **41** | 120 | Papel de encuadernación de celulosa de alta resistencia con 4 gofrados distintos (`Smooth` vs `Fine Linen` vs `New Linen` vs `Crash`). |
| **Sticotac & Raflamatt Opaque** | UPM Raflatac / Antalis | **17** | 80–170 | Complejo autoadhesivo multicapa (frontal + adhesivo + soporte glassine/kraft con cortes dorsal). Requiere medición de frontal (`face`) y total (`laminate`). |
| **Wibalin** (*Buckram 560*, *Natural 500*, *Fine Linen 525*, *Stria 575*) | Winter & Company | **15** | 120 | Material de recubrimiento editorial con gofrados profundos (*Buckram*, *Stria*, *Linen*). |
| **Reacto Carbonless NCR** (`CB`, `CFB`, `CF`) | Koehler Paper | **11** | 56–170 | Papel autocopiativo con recubrimiento de microcápsulas (`CB`) y resina reactiva (`CFB`/`CF`). |
| **Conqueror Laid** (*Verjurado*) | Arjowiggins / Antalis / Fedrigoni | **7** | 100–300 | Papel verjurado con marcas al agua de corondeles y puntizones (*chain & laid lines*). |
| **Surbalin** (*Glatt*, *Gerippt*, *Linea*, *Moiré*) | Peyer Graphic | **5** | 115 | Material de recubrimiento para tapa dura con múltiples acabados superficiales. |
| **Constellation Snow / Tela & Rives Basane & Sirio Ultra Black** | Fedrigoni / Arjowiggins | **4** | 115–280 | Cartulinas y papeles con gofrado profundo de tela/fieltro o alta carga de carbono. |
| **ENVEL.POSTAC C4** | Convertidor Postal | **1** | 100 | Sobre confeccionado multicapa; requiere medición de espesor de pared individual y plegado total. |
| **TOTAL `PHYSICAL_MEASUREMENT_REQUIRED`** | — | **145** | — | **100 % bloqueado frente a inferencias teóricas** |

---

## 2. Separación Estricta entre Espesor Nominal de Ficha y Medición Física de Lote

El sistema de datos de PrintPrice OS mantiene rigurosamente separados dos conceptos metrológicos que **nunca deben sobrescribirse ni confundirse**:

| Atributo / Dimensión | Espesor Nominal de Fabricante (`Nominal Datasheet Caliper`) | Medición Física de Lote (`Physical Batch Micrometer Measurement`) |
| :--- | :--- | :--- |
| **Origen del dato** | Ficha Técnica Oficial (TDS) emitida por el molino papelero | Ensayo físico en laboratorio/planta sobre pliegos reales del lote recibido |
| **Valor de `caliper_source`** | `'MANUFACTURER_DATASHEET'` | `'MEASURED_MICROMETER'` |
| **Valor de `caliper_confidence_status`** | `'REFERENCE_IMPORTED'` (o `'VERIFIED'` tras revisión documental cruzada en papeles estándar) | `'VERIFIED'` (exclusivamente tras completar las 10 lecturas `ISO 534`, cumplir CV% y recibir firma del tecnólogo) |
| **Trazabilidad de lote** | Genérica de producto / revisión de TDS | Vinculada a `supplier_lot_number`, fecha de recepción y certificado de calibración del micrómetro |
| **Impacto en `canReleaseToManufacturing`** | Permanece `false` mientras el material no esté certificado para producción (`PRODUCTION_CERTIFIED`) | Habilita la elegibilidad metrológica del lote una vez aprobado por el tecnólogo responsable |

---

## 3. Especificaciones del Instrumento y Calibración (`ISO 534:2011`)

1. **Tipo de instrumento**: Micrómetro de precisión de peso muerto o motorizado para papel y cartón conforme a **`ISO 534:2011`** (p. ej., *Lorentzen & Wettre Micrometer 51 / 250*, *Messmer Büchel 49-56*, *Frank-PTI Micrometer*, o equivalente certificado).
   - *Prohibición*: Queda prohibido el uso de calibres pie de rey manuales (*vernier calipers*) o micrómetros mecánicos de tornillo de taller metalúrgico, ya que comprimen la fibra de forma descontrolada y falsean la lectura en `±20–40 µm`.
2. **Geometría y presión del palpador**:
   - Área circular del pie de medición (*platen area*): **`200 mm² ± 5 mm²`** (diámetro nominal **`16,0 mm ± 0,2 mm`**).
   - Presión estática ejercida sobre la muestra: **`100 kPa ± 1 kPa`** (`1,00 kgf/cm²`).
   - Velocidad de descenso del palpador: **`2,0 mm/s ± 1,0 mm/s`**, con lectura estabilizada entre `2 s` y `5 s` tras el contacto.
   - Resolución mínima de lectura: **`1 µm` (`0,001 mm`)**; repetibilidad del instrumento **`≤ ±1,0 µm`**.
3. **Certificado de calibración vigente**:
   - El micrómetro debe contar con un certificado de calibración ENAC / ISO 17025 vigente (antigüedad `< 12 meses`) mediante bloques patrón trazables.
   - Antes de cada sesión de medición, el operador debe verificar el **punto cero (`0,0 µm`)** limpiando los platos con papel óptico sin pelusa y comprobar un patrón de espesor conocido (`100 µm` y `250 µm`).

---

## 4. Acondicionamiento y Preparación de Muestras (`ISO 187` / `ISO 186`)

1. **Selección de pliegos del lote**:
   - Extraer un mínimo de **5 pliegos representativos** de diferentes alturas del palé o paquete recibido, descartando los 3 pliegos superiores e inferiores expuestos al embalaje.
   - Registrar el **código de variante (`variant_id`)**, **SKU del proveedor**, **número de lote de fabricación (`lot_batch_id`)** y **fecha de recepción**.
2. **Acondicionamiento higrotérmico**:
   - Acondicionar las muestras durante un mínimo de **4 horas** (papeles `≤ 150 g/m²`) u **8 horas** (cartulinas y recubrimientos `> 150 g/m²`) en atmósfera controlada según **`ISO 187`**:
     - Temperatura: **`23,0 °C ± 1,0 °C`**
     - Humedad relativa: **`50,0 % ± 2,0 % HR`**
   - Registrar en el acta la temperatura (`ambient_temp_c`) y humedad relativa (`ambient_rh_pct`) medidas por termohigrómetro calibrado en el momento del ensayo.
3. **Integridad de las probetas**:
   - Las zonas de lectura deben estar libres de pliegues, arrugas, marcas de pinza, empalmes o manchas de humedad, y situarse a **más de `50 mm` de cualquier borde del pliego**.

---

## 5. Procedimiento de Lectura Paso a Paso (10 Lecturas por Lote)

### 5.1. Medición de Hoja Individual (*Single-Sheet Thickness* — Obligatorio)

Para evitar el efecto de encaje entre crestas y valles (*nesting effect*) propio de los papeles gofrados (*Efalin*, *Geltex*, *Wibalin*, *Surbalin*), **la medición principal debe realizarse sobre hoja individual (`single-sheet method`, `ISO 534` Sección 7.1)**, nunca en fajo (*pack measurement*):

1. Seleccionar **5 pliegos acondicionados** del lote.
2. En cada pliego, tomar **2 lecturas independientes** separadas al menos `150 mm` en sentido transversal (`CD`) y longitudinal (`MD`), completando **`N = 10` lecturas individuales (`r_1 ... r_10`) en `µm`**.
3. **Regla específica para papeles gofrados y verjurados (*Efalin*, *Wibalin*, *Surbalin*, *Conqueror Laid*, *Constellation*)**:
   - El plato circular de `16,0 mm` abarca simultáneamente múltiples crestas y valles del gofrado, integrando el espesor efectivo de cresta (*effective peak caliper*).
   - Adicionalmente, tomar una medición informativa en paquete de 5 hojas (`pack_5_sheet_avg_um`) únicamente para documentar el factor de anidamiento (*embossing nesting ratio*), pero **registrar como espesor oficial el promedio de hoja individual (`mean_single_sheet_um`)**.
4. **Regla específica para complejos autoadhesivos (*Sticotac / Raflamatt*)**:
   - **Serie A (Complejo total — `total_laminate_um`)**: 10 lecturas sobre el material completo (frontal + adhesivo + soporte).
   - **Serie B (Frontal puro — `facestock_only_um`)**: despegar cuidadosamente el soporte siliconado de 5 muestras, neutralizar el adhesivo con talco técnico ultrafino sin espesor apreciable (o medir el soporte siliconado `liner_only_um` por separado) y registrar `facestock_only_um = total_laminate_um - liner_only_um`. Para cálculo de lomo o plegado donde el soporte se retira, se utiliza `facestock_only_um`; para paso por máquina de impresión en pliego completo, se utiliza `total_laminate_um`.

---

## 6. Criterios Estadísticos de Aceptación y Tolerancia

A partir de las `10` lecturas individuales ($x_1, x_2, \dots, x_{10}$ en $\mu\text{m}$), el sistema calcula automáticamente:

1. **Media aritmética ($\bar{x}$)**:
   $$\bar{x} = \frac{1}{10} \sum_{i=1}^{10} x_i \quad (\text{redondeada al } \mu\text{m} \text{ entero más próximo})$$
2. **Desviación estándar muestral ($s$)**:
   $$s = \sqrt{\frac{1}{9} \sum_{i=1}^{10} (x_i - \bar{x})^2}$$
3. **Coeficiente de variación ($\text{CV}\%$)**:
   $$\text{CV}\% = \left(\frac{s}{\bar{x}}\right) \times 100$$
4. **Rango relativo máximo ($\Delta_{\max}\%$)**:
   $$\Delta_{\max}\% = \left(\frac{\max(x_i) - \min(x_i)}{\bar{x}}\right) \times 100$$

### 6.1. Umbrales de Validación Automática

| Categoría de Sustrato | Coeficiente de Variación Máximo ($\text{CV}\%$) | Rango Máximo entre Lecturas ($\Delta_{\max}\%$) | Desviación Máxima vs. Ficha Nominal del Fabricante (si existe) |
| :--- | :---: | :---: | :---: |
| **Papeles lisos, estucados y offset** (`CONFLICT_HOLD` verificación) | `≤ 2,5 %` | `≤ 6,0 %` | `± 5,0 %` o `± 5 µm` |
| **Recubrimientos lisos o acrílicos** (*Geltex*, *Efalin Smooth 120*, *Surbalin Glatt*, *Wibalin Natural*) | `≤ 3,5 %` | `≤ 8,0 %` | `± 7,5 %` o `± 10 µm` |
| **Recubrimientos y papeles con gofrado profundo / verjurados** (*Efalin Linen/Crash*, *Wibalin Buckram/Stria*, *Conqueror Laid*, *Constellation*) | `≤ 5,0 %` | `≤ 12,0 %` | `± 10,0 %` o `± 15 µm` (respecto a TDS del mismo gofrado) |
| **Autoadhesivos y Autocopiativo NCR** (*Sticotac*, *Reacto*) | `≤ 3,0 %` | `≤ 7,0 %` | `± 5,0 %` o `± 5 µm` |

- Si un lote supera el $\text{CV}\%$ máximo permitido, el sistema **rechaza el acta automáticamente (`REJECTED_HIGH_VARIANCE`)** y exige ampliar el muestreo a `20` lecturas o segregar el lote por falta de uniformidad de calibre.

---

## 7. Acta Digital de Medición Física y Doble Firma (`Operator + Technologist`)

Toda medición física debe registrarse con los siguientes campos obligatorios antes de poder actualizar la variante en Paper Materials:

```json
{
  "measurement_record_id": "PMR-2026-0001",
  "variant_id": "var_85c142a50239e312",
  "product_name": "Efalin FINE LINEN 130 (Light Blue) 120 102x70cm",
  "manufacturer": "Zanders / Reflex",
  "family": "Efalin",
  "sub_series_embossing": "Fine Linen (108)",
  "gsm_nominal": 120,
  "supplier_name": "Polap",
  "supplier_sku": "130 light blue",
  "supplier_lot_batch_id": "LOT-ZAN-2026-09412",
  "received_date": "2026-10-29",
  "conditioning": {
    "standard": "ISO 187:1990",
    "duration_hours": 8.5,
    "ambient_temp_c": 23.1,
    "ambient_rh_pct": 50.4
  },
  "instrument": {
    "standard": "ISO 534:2011",
    "make_model": "Messmer Buchel 49-56 Dead-Weight Micrometer",
    "serial_number": "MB4956-88412",
    "platen_area_mm2": 200.0,
    "pressure_kpa": 100.0,
    "calibration_cert_id": "CAL-ISO17025-2026-0419",
    "calibration_valid_until": "2027-04-18",
    "zero_check_passed": true
  },
  "readings_single_sheet_um": [168, 170, 169, 171, 168, 170, 169, 167, 170, 168],
  "statistics": {
    "sample_count": 10,
    "mean_um": 169.0,
    "rounded_caliper_um": 169,
    "std_dev_um": 1.25,
    "cv_pct": 0.74,
    "min_um": 167,
    "max_um": 171,
    "range_pct": 2.37,
    "within_tolerance": true
  },
  "nominal_reference_comparison": {
    "nominal_datasheet_caliper_um": 165,
    "datasheet_doc_ref": "TDS-REFLEX-EFALIN-108-2025",
    "delta_vs_nominal_um": 4,
    "delta_vs_nominal_pct": 2.42
  },
  "governance": {
    "measured_by_operator_id": "op_metrology_01",
    "measured_at": "2026-10-29T10:30:00Z",
    "approved_by_technologist_id": "tech_lead_materials_01",
    "approved_at": "2026-10-29T11:00:00Z",
    "review_status": "CERTIFIED_MEASURED",
    "resulting_caliper_source": "MEASURED_MICROMETER",
    "resulting_confidence_status": "VERIFIED"
  }
}
```

### 7.1. Regla de Segregación de Funciones (SoD)
- El **Operador de Laboratorio (`measured_by_operator_id`)** que ejecuta las 10 lecturas micrométricas **no puede ser la misma persona** que firma la **Aprobación Tecnológica (`approved_by_technologist_id`)**.
- El sistema bloquea cualquier transición a `CERTIFIED_MEASURED` si `measured_by_operator_id === approved_by_technologist_id` o si el certificado de calibración del micrómetro (`calibration_valid_until`) está vencido en la fecha de ensayo.

